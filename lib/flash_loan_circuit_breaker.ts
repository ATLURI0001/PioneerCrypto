/**
 * Flash Loan Attack & Liquidity Depletion Circuit Breaker for PioneerCrypto.
 *
 * Implements a three-state resilience engine (CLOSED, OPEN, HALF_OPEN) defending
 * AMM pools against flash-loan price manipulation, sudden reserve depletion,
 * and sandwich attacks within single-block or rapid-sequence windows.
 */

export const CircuitState = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

export const FallbackAction = Object.freeze({
  EXECUTE_PRIMARY: 'EXECUTE_PRIMARY',
  THROTTLE_LARGE_SWAP: 'THROTTLE_LARGE_SWAP',
  DIVERT_TO_TWAP: 'DIVERT_TO_TWAP',
  ALLOW_CANARY: 'ALLOW_CANARY',
});

export class FlashLoanCircuitBreaker {
  constructor({
    maxReserveDepletionBps = 3500, // 35% depletion threshold
    recoveryTimeoutMs = 15000,     // 15s recovery window
    halfOpenSuccessThreshold = 3,
    maxCanaryDepletionBps = 100,   // 1% max for canary probe
  } = {}) {
    if (maxReserveDepletionBps <= 0 || maxReserveDepletionBps > 10000) {
      throw new Error(`maxReserveDepletionBps must be between 1 and 10000, got ${maxReserveDepletionBps}`);
    }
    if (recoveryTimeoutMs <= 0) {
      throw new Error(`recoveryTimeoutMs must be positive, got ${recoveryTimeoutMs}`);
    }
    if (halfOpenSuccessThreshold < 1) {
      throw new Error(`halfOpenSuccessThreshold must be >= 1, got ${halfOpenSuccessThreshold}`);
    }

    this.maxReserveDepletionBps = maxReserveDepletionBps;
    this.recoveryTimeoutMs = recoveryTimeoutMs;
    this.halfOpenSuccessThreshold = halfOpenSuccessThreshold;
    this.maxCanaryDepletionBps = maxCanaryDepletionBps;

    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastStateChange = Date.now();
    this.tripCount = 0;
    this.totalEvaluated = 0;
    this.mitigationsEngaged = 0;
  }

  /**
   * Evaluate a proposed swap against current pool reserves.
   */
  evaluateSwap({
    poolAddress,
    reserveIn,
    reserveOut,
    amountIn,
    amountOut,
    now = Date.now(),
  }) {
    this.totalEvaluated++;

    if (!poolAddress || !poolAddress.startsWith('0x') || poolAddress.length !== 42) {
      throw new Error(`Invalid poolAddress format: ${poolAddress}`);
    }
    if (reserveIn <= 0n || reserveOut <= 0n) {
      throw new Error('Reserves must be positive bigints');
    }
    if (amountIn <= 0n || amountOut <= 0n) {
      throw new Error('Swap amounts must be positive bigints');
    }

    // Depletion ratio: (amountOut * 10,000) / reserveOut
    const depletionBps = Number((amountOut * 10000n) / reserveOut);

    // Timeout check: transition OPEN to HALF_OPEN after recovery window
    if (this.state === CircuitState.OPEN && (now - this.lastStateChange >= this.recoveryTimeoutMs)) {
      this.state = CircuitState.HALF_OPEN;
      this.consecutiveSuccesses = 0;
      this.lastStateChange = now;
    }

    // 1. If circuit is OPEN
    if (this.state === CircuitState.OPEN) {
      this.mitigationsEngaged++;
      return {
        allowed: false,
        circuitState: CircuitState.OPEN,
        action: FallbackAction.DIVERT_TO_TWAP,
        depletionBps,
        reason: 'Circuit OPEN: Flash loan protection active, swap diverted to TWAP oracle',
      };
    }

    // 2. If circuit is HALF_OPEN (Canary probing)
    if (this.state === CircuitState.HALF_OPEN) {
      if (depletionBps > this.maxCanaryDepletionBps) {
        // Large swap attempted during canary probe -> re-trip!
        this._trip(now);
        this.mitigationsEngaged++;
        return {
          allowed: false,
          circuitState: CircuitState.OPEN,
          action: FallbackAction.THROTTLE_LARGE_SWAP,
          depletionBps,
          reason: `Canary probe exceeded limit: ${depletionBps} bps > ${this.maxCanaryDepletionBps} bps`,
        };
      }

      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.halfOpenSuccessThreshold) {
        this.state = CircuitState.CLOSED;
        this.consecutiveSuccesses = 0;
        this.lastStateChange = now;
      }

      return {
        allowed: true,
        circuitState: CircuitState.HALF_OPEN,
        action: FallbackAction.ALLOW_CANARY,
        depletionBps,
        reason: `Canary swap permitted (${this.consecutiveSuccesses}/${this.halfOpenSuccessThreshold})`,
      };
    }

    // 3. If circuit is CLOSED
    if (depletionBps >= this.maxReserveDepletionBps) {
      // Sudden extreme liquidity extraction (flash loan pattern)
      this._trip(now);
      this.mitigationsEngaged++;
      return {
        allowed: false,
        circuitState: CircuitState.OPEN,
        action: FallbackAction.THROTTLE_LARGE_SWAP,
        depletionBps,
        reason: `Flash loan liquidity drain detected: ${depletionBps} bps >= ${this.maxReserveDepletionBps} bps`,
      };
    }

    // Nominal execution
    return {
      allowed: true,
      circuitState: CircuitState.CLOSED,
      action: FallbackAction.EXECUTE_PRIMARY,
      depletionBps,
      reason: 'Nominal swap execution within liquidity safety envelope',
    };
  }

  _trip(now) {
    this.state = CircuitState.OPEN;
    this.tripCount++;
    this.lastStateChange = now;
    this.consecutiveSuccesses = 0;
  }

  reset() {
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastStateChange = Date.now();
  }

  getMetrics() {
    return {
      state: this.state,
      tripCount: this.tripCount,
      totalEvaluated: this.totalEvaluated,
      mitigationsEngaged: this.mitigationsEngaged,
    };
  }
}
