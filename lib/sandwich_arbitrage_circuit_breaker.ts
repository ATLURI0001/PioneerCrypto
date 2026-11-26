/**
 * Liquidity Pool Reserve Imbalance & Sandwich Arbitrage Circuit Breaker.
 * 
 * Protects decentralized constant-product AMMs from toxic MEV sandwich attacks,
 * flash balance manipulation, and catastrophic reserve depletion.
 */

export const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;

export type CircuitStateType = (typeof CircuitState)[keyof typeof CircuitState];

export interface PoolReserves {
  reserveA: bigint;
  reserveB: bigint;
  blockNumber: number;
}

export interface SwapEvaluationResult {
  allowed: boolean;
  state: CircuitStateType;
  priceImpactBps: number;
  reason?: string;
}

export class SandwichArbitrageCircuitBreaker {
  private state: CircuitStateType = CircuitState.CLOSED;
  private consecutiveAnomalies: number = 0;
  private consecutiveSuccesses: number = 0;
  private lastReserves: PoolReserves | null = null;
  private tripTimestamp: number = 0;

  private readonly maxPriceImpactBps: number;
  private readonly anomalyThreshold: number;
  private readonly recoverySuccessThreshold: number;
  private readonly cooldownDurationMs: number;

  constructor(
    maxPriceImpactBps: number = 300,
    anomalyThreshold: number = 3,
    recoverySuccessThreshold: number = 5,
    cooldownDurationMs: number = 2000
  ) {
    this.maxPriceImpactBps = maxPriceImpactBps;
    this.anomalyThreshold = anomalyThreshold;
    this.recoverySuccessThreshold = recoverySuccessThreshold;
    this.cooldownDurationMs = cooldownDurationMs;
  }

  /**
   * Evaluates an incoming swap against current pool reserves.
   */
  public evaluateSwap(
    amountIn: bigint,
    isAtoB: boolean,
    currentReserves: PoolReserves,
    now: number = Date.now()
  ): SwapEvaluationResult {
    // Cooldown check for OPEN state
    if (this.state === CircuitState.OPEN && now - this.tripTimestamp >= this.cooldownDurationMs) {
      this.state = CircuitState.HALF_OPEN;
      this.consecutiveSuccesses = 0;
    }

    if (this.state === CircuitState.OPEN) {
      return {
        allowed: false,
        state: this.state,
        priceImpactBps: 0,
        reason: 'ERR_CIRCUIT_OPEN_SANDWICH_PROTECTION',
      };
    }

    if (amountIn <= 0n || currentReserves.reserveA <= 0n || currentReserves.reserveB <= 0n) {
      this.recordAnomaly(now);
      return {
        allowed: false,
        state: this.state,
        priceImpactBps: 0,
        reason: 'ERR_INVALID_RESERVES_OR_AMOUNT',
      };
    }

    // Calculate price impact (bps) = (amountIn / (reserveIn + amountIn)) * 10000
    const reserveIn = isAtoB ? currentReserves.reserveA : currentReserves.reserveB;
    const impactBps = Number((amountIn * 10000n) / (reserveIn + amountIn));

    // Check same-block rapid reserve skew (Sandwich pattern indicator)
    let rapidSkew = false;
    if (this.lastReserves && this.lastReserves.blockNumber === currentReserves.blockNumber) {
      const prevRatio = Number((this.lastReserves.reserveA * 10000n) / this.lastReserves.reserveB);
      const currRatio = Number((currentReserves.reserveA * 10000n) / currentReserves.reserveB);
      const ratioDeltaBps = Math.abs(currRatio - prevRatio);
      if (ratioDeltaBps > this.maxPriceImpactBps) {
        rapidSkew = true;
      }
    }

    if (impactBps > this.maxPriceImpactBps || rapidSkew) {
      this.recordAnomaly(now);
      const reason = rapidSkew ? 'ERR_RAPID_BLOCK_RESERVE_SKEW' : 'ERR_EXCESSIVE_PRICE_IMPACT';
      return {
        allowed: false,
        state: this.state,
        priceImpactBps: impactBps,
        reason,
      };
    }

    this.recordSuccess();
    this.lastReserves = { ...currentReserves };

    return {
      allowed: true,
      state: this.state,
      priceImpactBps: impactBps,
    };
  }

  private recordAnomaly(now: number): void {
    this.consecutiveAnomalies++;
    this.consecutiveSuccesses = 0;

    if (this.state === CircuitState.HALF_OPEN || this.consecutiveAnomalies >= this.anomalyThreshold) {
      this.state = CircuitState.OPEN;
      this.tripTimestamp = now;
    }
  }

  private recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.recoverySuccessThreshold) {
        this.state = CircuitState.CLOSED;
        this.consecutiveAnomalies = 0;
      }
    } else {
      this.consecutiveAnomalies = 0;
    }
  }

  public getState(): CircuitStateType {
    return this.state;
  }

  public reset(): void {
    this.state = CircuitState.CLOSED;
    this.consecutiveAnomalies = 0;
    this.consecutiveSuccesses = 0;
    this.lastReserves = null;
    this.tripTimestamp = 0;
  }
}
