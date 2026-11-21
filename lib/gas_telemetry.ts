export interface GasRecord {
  txHash: string;
  method: string;
  gasUsed: bigint;
  gasLimit: bigint;
  effectiveGasPriceGwei: number;
  blockNumber: number;
  timestamp: number;
}

export interface BlockGasSummary {
  blockNumber: number;
  totalGasUsed: bigint;
  blockGasLimit: bigint;
  utilizationPct: number;
  txCount: number;
}

export interface MethodGasStats {
  count: number;
  totalGas: bigint;
  avgGas: number;
  maxGas: bigint;
}

export interface GasDiagnosticSnapshot {
  totalTransactions: number;
  meanGasUsed: number;
  stdDevGasUsed: number;
  p50GasUsed: number;
  p90GasUsed: number;
  p99GasUsed: number;
  methodBreakdown: Record<string, MethodGasStats>;
}

export interface GasTelemetryOptions {
  maxHistory?: number;
  defaultBlockGasLimit?: bigint;
}

/**
 * GasTelemetryRotary instruments on-chain gas consumption, detects execution spikes,
 * and monitors block-level gas utilization against protocol limits.
 */
export class GasTelemetryRotary {
  private readonly maxHistory: number;
  private readonly defaultBlockGasLimit: bigint;
  private records: GasRecord[] = [];

  constructor(options: GasTelemetryOptions = {}) {
    this.maxHistory = options.maxHistory && options.maxHistory > 0 ? options.maxHistory : 1000;
    this.defaultBlockGasLimit =
      options.defaultBlockGasLimit && options.defaultBlockGasLimit > 0n
        ? options.defaultBlockGasLimit
        : 30_000_000n; // Default Ethereum standard target (30M gas)
  }

  /**
   * Records a validated transaction execution gas consumption event.
   */
  public recordTransaction(input: {
    txHash: string;
    method: string;
    gasUsed: bigint | number;
    gasLimit: bigint | number;
    effectiveGasPriceGwei?: number;
    blockNumber?: number;
    timestamp?: number;
  }): void {
    if (!input.txHash || typeof input.txHash !== 'string') {
      throw new TypeError('txHash must be a non-empty string');
    }
    const method = (input.method || 'unknown').trim();
    const gasUsed = BigInt(input.gasUsed);
    const gasLimit = BigInt(input.gasLimit);

    if (gasUsed < 0n || gasLimit <= 0n) {
      throw new RangeError('gasUsed must be >= 0 and gasLimit must be > 0');
    }
    if (gasUsed > gasLimit) {
      throw new RangeError(`gasUsed (${gasUsed}) cannot exceed gasLimit (${gasLimit})`);
    }

    const record: GasRecord = {
      txHash: input.txHash,
      method,
      gasUsed,
      gasLimit,
      effectiveGasPriceGwei: Math.max(0, input.effectiveGasPriceGwei ?? 0),
      blockNumber: input.blockNumber ?? 0,
      timestamp: input.timestamp ?? Date.now(),
    };

    this.records.push(record);
    if (this.records.length > this.maxHistory) {
      this.records.shift();
    }
  }

  /**
   * Evaluates whether a proposed or observed gas usage constitutes a statistical outlier (z-score anomaly).
   */
  public detectGasAnomaly(
    method: string,
    gasUsedInput: bigint | number,
    thresholdZScore: number = 2.5
  ): { isAnomaly: boolean; zScore: number; mean: number; stdDev: number } {
    const gasUsed = Number(gasUsedInput);
    const matching = this.records.filter((r) => r.method === method);

    if (matching.length < 5) {
      return { isAnomaly: false, zScore: 0, mean: 0, stdDev: 0 };
    }

    const values = matching.map((r) => Number(r.gasUsed));
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const rawStdDev = Math.sqrt(variance);

    // Apply floor to avoid division by zero
    const stdDev = Math.max(rawStdDev, 0.05 * mean, 1.0);
    const zScore = (gasUsed - mean) / stdDev;

    return {
      isAnomaly: zScore > thresholdZScore,
      zScore,
      mean,
      stdDev,
    };
  }

  /**
   * Aggregates block-level gas consumption and calculates limit utilization percentage.
   */
  public summarizeBlock(blockNumber: number, customBlockGasLimit?: bigint): BlockGasSummary {
    const blockRecords = this.records.filter((r) => r.blockNumber === blockNumber);
    const limit = customBlockGasLimit ?? this.defaultBlockGasLimit;

    let totalGas = 0n;
    for (const r of blockRecords) {
      totalGas += r.gasUsed;
    }

    const utilizationPct = limit > 0n ? (Number(totalGas) / Number(limit)) * 100 : 0;

    return {
      blockNumber,
      totalGasUsed: totalGas,
      blockGasLimit: limit,
      utilizationPct: Math.round(utilizationPct * 100) / 100,
      txCount: blockRecords.length,
    };
  }

  /**
   * Generates comprehensive telemetry snapshot including distribution percentiles.
   */
  public getSnapshot(): GasDiagnosticSnapshot {
    if (this.records.length === 0) {
      return {
        totalTransactions: 0,
        meanGasUsed: 0,
        stdDevGasUsed: 0,
        p50GasUsed: 0,
        p90GasUsed: 0,
        p99GasUsed: 0,
        methodBreakdown: {},
      };
    }

    const gasValues = this.records.map((r) => Number(r.gasUsed)).sort((a, b) => a - b);
    const n = gasValues.length;
    const mean = gasValues.reduce((sum, v) => sum + v, 0) / n;
    const variance = gasValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const getPercentile = (p: number): number => {
      const idx = (p / 100) * (n - 1);
      const lower = Math.floor(idx);
      const upper = Math.ceil(idx);
      if (lower === upper) return gasValues[lower];
      const weight = idx - lower;
      return gasValues[lower] * (1 - weight) + gasValues[upper] * weight;
    };

    const methodBreakdown: Record<string, MethodGasStats> = {};
    for (const r of this.records) {
      if (!methodBreakdown[r.method]) {
        methodBreakdown[r.method] = {
          count: 0,
          totalGas: 0n,
          avgGas: 0,
          maxGas: 0n,
        };
      }
      const stats = methodBreakdown[r.method];
      stats.count++;
      stats.totalGas += r.gasUsed;
      if (r.gasUsed > stats.maxGas) {
        stats.maxGas = r.gasUsed;
      }
    }

    for (const method in methodBreakdown) {
      const stats = methodBreakdown[method];
      stats.avgGas = Number(stats.totalGas) / stats.count;
    }

    return {
      totalTransactions: n,
      meanGasUsed: Math.round(mean * 100) / 100,
      stdDevGasUsed: Math.round(stdDev * 100) / 100,
      p50GasUsed: Math.round(getPercentile(50)),
      p90GasUsed: Math.round(getPercentile(90)),
      p99GasUsed: Math.round(getPercentile(99)),
      methodBreakdown,
    };
  }

  public reset(): void {
    this.records = [];
  }
}
