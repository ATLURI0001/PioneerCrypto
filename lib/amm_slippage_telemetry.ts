/**
 * AMM Slippage & Liquidity Depth Telemetry Rotary Engine.
 *
 * Implements a high-throughput circular rotary buffer for tracking swap slippage,
 * pool liquidity depth, execution latencies, and slippage drift percentiles without
 * dynamic memory allocations.
 */

export interface SwapExecutionSample {
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  expectedOutput: bigint;
  actualOutput: bigint;
  slippageBps: number;
  liquidityDepthUSD: number;
  executionDurationMs: number;
  timestamp: number;
}

export interface SlippagePercentiles {
  p50: number;
  p90: number;
  p99: number;
  max: number;
  avg: number;
}

export interface PoolTelemetrySummary {
  poolAddress: string;
  sampleCount: number;
  percentiles: SlippagePercentiles;
  avgLiquidityDepthUSD: number;
  avgExecutionDurationMs: number;
  breachCount: number;
}

export class AmmSlippageTelemetryRotary {
  private readonly capacity: number;
  private readonly buffer: (SwapExecutionSample | null)[];
  private headIndex: number = 0;
  private totalIngested: number = 0;
  private readonly slippageBreachThresholdBps: number;

  constructor(capacity: number = 500, slippageBreachThresholdBps: number = 100) {
    if (capacity < 10) {
      throw new Error(`Capacity must be at least 10, got ${capacity}`);
    }
    if (slippageBreachThresholdBps <= 0) {
      throw new Error(`Slippage breach threshold must be positive, got ${slippageBreachThresholdBps}`);
    }
    this.capacity = capacity;
    this.slippageBreachThresholdBps = slippageBreachThresholdBps;
    this.buffer = new Array(capacity).fill(null);
  }

  /**
   * Record a completed swap execution into the rotary ring buffer.
   */
  public recordSwap(
    poolAddress: string,
    tokenIn: string,
    tokenOut: string,
    expectedOutput: bigint,
    actualOutput: bigint,
    liquidityDepthUSD: number,
    executionDurationMs: number,
    timestamp: number = Date.now()
  ): SwapExecutionSample {
    if (!poolAddress || !poolAddress.startsWith("0x") || poolAddress.length !== 42) {
      throw new Error(`Invalid poolAddress format: ${poolAddress}`);
    }
    if (expectedOutput <= 0n) {
      throw new Error(`expectedOutput must be positive bigint, got ${expectedOutput}`);
    }
    if (actualOutput < 0n) {
      throw new Error(`actualOutput cannot be negative, got ${actualOutput}`);
    }
    if (liquidityDepthUSD < 0) {
      throw new Error(`liquidityDepthUSD cannot be negative, got ${liquidityDepthUSD}`);
    }
    if (executionDurationMs < 0) {
      throw new Error(`executionDurationMs cannot be negative, got ${executionDurationMs}`);
    }

    // Slippage formula: (expected - actual) / expected * 10,000 bps
    // If actual > expected, slippage is negative (favorable execution / surplus)
    let slippageBps = 0;
    if (expectedOutput > actualOutput) {
      const diff = expectedOutput - actualOutput;
      slippageBps = Number((diff * 10000n) / expectedOutput);
    } else if (actualOutput > expectedOutput) {
      const surplus = actualOutput - expectedOutput;
      slippageBps = -Number((surplus * 10000n) / expectedOutput);
    }

    const sample: SwapExecutionSample = {
      poolAddress: poolAddress.toLowerCase(),
      tokenIn: tokenIn.toUpperCase(),
      tokenOut: tokenOut.toUpperCase(),
      expectedOutput,
      actualOutput,
      slippageBps,
      liquidityDepthUSD,
      executionDurationMs,
      timestamp,
    };

    this.buffer[this.headIndex] = sample;
    this.headIndex = (this.headIndex + 1) % this.capacity;
    this.totalIngested++;

    return sample;
  }

  /**
   * Return all valid active samples currently residing in the rotary buffer.
   */
  public getActiveSamples(): SwapExecutionSample[] {
    const active: SwapExecutionSample[] = [];
    const count = Math.min(this.totalIngested, this.capacity);
    for (let i = 0; i < count; i++) {
      const sample = this.buffer[i];
      if (sample !== null) {
        active.push(sample);
      }
    }
    return active;
  }

  /**
   * Return samples matching a rolling window duration (in ms) relative to referenceTime.
   */
  public getWindowSamples(windowDurationMs: number, referenceTime: number = Date.now()): SwapExecutionSample[] {
    const cutoff = referenceTime - windowDurationMs;
    return this.getActiveSamples().filter((s) => s.timestamp >= cutoff);
  }

  /**
   * Compute slippage percentiles (p50, p90, p99, max, avg) from a set of samples.
   */
  public computePercentiles(samples: SwapExecutionSample[]): SlippagePercentiles {
    if (samples.length === 0) {
      return { p50: 0, p90: 0, p99: 0, max: 0, avg: 0 };
    }

    const sorted = samples.map((s) => s.slippageBps).sort((a, b) => a - b);
    const n = sorted.length;

    const getP = (p: number): number => {
      const idx = Math.min(Math.floor((p / 100) * n), n - 1);
      return sorted[idx];
    };

    const sum = sorted.reduce((acc, val) => acc + val, 0);

    return {
      p50: getP(50),
      p90: getP(90),
      p99: getP(99),
      max: sorted[n - 1],
      avg: Math.round((sum / n) * 100) / 100,
    };
  }

  /**
   * Generate telemetry summary for a specific pool or globally across all pools.
   */
  public summarizePool(poolAddress?: string): PoolTelemetrySummary {
    let samples = this.getActiveSamples();
    const targetPool = poolAddress ? poolAddress.toLowerCase() : "all-pools";
    if (poolAddress) {
      samples = samples.filter((s) => s.poolAddress === targetPool);
    }

    if (samples.length === 0) {
      return {
        poolAddress: targetPool,
        sampleCount: 0,
        percentiles: { p50: 0, p90: 0, p99: 0, max: 0, avg: 0 },
        avgLiquidityDepthUSD: 0,
        avgExecutionDurationMs: 0,
        breachCount: 0,
      };
    }

    const percentiles = this.computePercentiles(samples);
    const totalLiquidity = samples.reduce((acc, s) => acc + s.liquidityDepthUSD, 0);
    const totalDuration = samples.reduce((acc, s) => acc + s.executionDurationMs, 0);
    const breachCount = samples.filter((s) => s.slippageBps >= this.slippageBreachThresholdBps).length;

    return {
      poolAddress: targetPool,
      sampleCount: samples.length,
      percentiles,
      avgLiquidityDepthUSD: Math.round(totalLiquidity / samples.length),
      avgExecutionDurationMs: Math.round((totalDuration / samples.length) * 100) / 100,
      breachCount,
    };
  }

  /**
   * Reset rotary buffer state.
   */
  public reset(): void {
    this.buffer.fill(null);
    this.headIndex = 0;
    this.totalIngested = 0;
  }

  public getStats() {
    return {
      capacity: this.capacity,
      totalIngested: this.totalIngested,
      activeSamples: Math.min(this.totalIngested, this.capacity),
      breachThresholdBps: this.slippageBreachThresholdBps,
    };
  }
}
