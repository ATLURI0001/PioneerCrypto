/**
 * @file oracle_circuit_breaker.ts
 * DeFi Oracle Deviation Circuit Breaker & TWAP Flash Crash Mitigation Engine.
 * Safeguards protocols against stale oracles, flash crashes, and manipulation.
 */

export type CircuitStatus =
  | 'NORMAL'
  | 'TRIPPED_DEVIATION'
  | 'TRIPPED_STALE'
  | 'TRIPPED_VOLATILITY'
  | 'TRIPPED_INVALID_PRICE';

export interface PriceObservation {
  price: number;
  timestamp: number; // Unix seconds
}

export interface OracleConfig {
  maxDeviationPercent: number; // e.g. 5.0 (5% max deviation between spot and TWAP)
  maxHeartbeatSec: number;     // e.g. 3600 (1 hour staleness ceiling)
  twapWindowSec: number;       // e.g. 1800 (30-minute TWAP window)
  maxRapidChangePercent: number; // e.g. 15.0 (15% max move in 60s)
  rapidChangeWindowSec: number; // e.g. 60
}

export const DEFAULT_ORACLE_CONFIG: OracleConfig = {
  maxDeviationPercent: 5.0,
  maxHeartbeatSec: 3600,
  twapWindowSec: 1800,
  maxRapidChangePercent: 15.0,
  rapidChangeWindowSec: 60,
};

export interface OracleValidationResult {
  status: CircuitStatus;
  allowed: boolean;
  spotPrice: number;
  twapPrice: number;
  deviationPercent: number;
  rapidChangePercent: number;
  reason: string;
}

export class OracleCircuitBreaker {
  private config: OracleConfig;
  private observations: PriceObservation[] = [];
  private isManuallyPaused: boolean = false;

  constructor(config: Partial<OracleConfig> = {}) {
    this.config = {
      ...DEFAULT_ORACLE_CONFIG,
      ...config,
    };
  }

  /**
   * Records a new price observation into the TWAP historical window.
   */
  public recordObservation(price: number, timestamp: number): void {
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Invalid observation price: ${price}`);
    }
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new Error(`Invalid observation timestamp: ${timestamp}`);
    }

    if (this.observations.length > 0) {
      const last = this.observations[this.observations.length - 1];
      if (timestamp < last.timestamp) {
        throw new Error(`Non-monotonic timestamp: ${timestamp} < ${last.timestamp}`);
      }
    }

    this.observations.push({ price, timestamp });

    // Prune observations outside TWAP window (plus buffer)
    const cutoff = timestamp - this.config.twapWindowSec * 2;
    this.observations = this.observations.filter(obs => obs.timestamp >= cutoff);
  }

  /**
   * Calculates Time-Weighted Average Price (TWAP) using trapezoidal integration over twapWindowSec.
   */
  public computeTWAP(currentTimestamp: number): number {
    if (this.observations.length === 0) {
      return 0;
    }
    if (this.observations.length === 1) {
      return this.observations[0].price;
    }

    const windowStart = currentTimestamp - this.config.twapWindowSec;
    const windowObs = this.observations.filter(obs => obs.timestamp >= windowStart);

    if (windowObs.length <= 1) {
      return this.observations[this.observations.length - 1].price;
    }

    let cumulativePriceTime = 0;
    let totalDuration = 0;

    for (let i = 0; i < windowObs.length - 1; i++) {
      const p1 = windowObs[i];
      const p2 = windowObs[i + 1];
      const dt = p2.timestamp - p1.timestamp;
      if (dt > 0) {
        const avgPrice = (p1.price + p2.price) / 2;
        cumulativePriceTime += avgPrice * dt;
        totalDuration += dt;
      }
    }

    return totalDuration > 0
      ? Number((cumulativePriceTime / totalDuration).toFixed(6))
      : windowObs[windowObs.length - 1].price;
  }

  /**
   * Validates inbound spot oracle update against TWAP, staleness, and volatility criteria.
   */
  public validatePrice(spotPrice: number, currentTimestamp: number): OracleValidationResult {
    if (this.isManuallyPaused) {
      return {
        status: 'TRIPPED_DEVIATION',
        allowed: false,
        spotPrice,
        twapPrice: 0,
        deviationPercent: 0,
        rapidChangePercent: 0,
        reason: 'Oracle manually paused by emergency multisig',
      };
    }

    // Defensive price boundary checks
    if (!Number.isFinite(spotPrice) || spotPrice <= 0) {
      return {
        status: 'TRIPPED_INVALID_PRICE',
        allowed: false,
        spotPrice: spotPrice || 0,
        twapPrice: 0,
        deviationPercent: 0,
        rapidChangePercent: 0,
        reason: `Non-positive or invalid spot price: ${spotPrice}`,
      };
    }

    // Staleness check
    if (this.observations.length > 0) {
      const lastObs = this.observations[this.observations.length - 1];
      const stalenessSec = currentTimestamp - lastObs.timestamp;
      if (stalenessSec > this.config.maxHeartbeatSec) {
        return {
          status: 'TRIPPED_STALE',
          allowed: false,
          spotPrice,
          twapPrice: lastObs.price,
          deviationPercent: 0,
          rapidChangePercent: 0,
          reason: `Oracle feed stale: ${stalenessSec}s elapsed since last update (max ${this.config.maxHeartbeatSec}s)`,
        };
      }
    }

    // Compute TWAP
    const twap = this.computeTWAP(currentTimestamp);

    // Compute Deviation vs TWAP
    let deviationPercent = 0;
    if (twap > 0) {
      deviationPercent = Number((Math.abs(spotPrice - twap) / twap * 100).toFixed(4));
    }

    if (deviationPercent > this.config.maxDeviationPercent) {
      return {
        status: 'TRIPPED_DEVIATION',
        allowed: false,
        spotPrice,
        twapPrice: twap,
        deviationPercent,
        rapidChangePercent: 0,
        reason: `Price deviation ${deviationPercent}% breaches limit of ${this.config.maxDeviationPercent}%`,
      };
    }

    // Rapid change / flash crash check in rapidChangeWindowSec
    let rapidChangePercent = 0;
    if (this.observations.length > 0) {
      const recentCutoff = currentTimestamp - this.config.rapidChangeWindowSec;
      const recentObs = this.observations.filter(o => o.timestamp >= recentCutoff);
      if (recentObs.length > 0) {
        const earliestRecent = recentObs[0];
        rapidChangePercent = Number((Math.abs(spotPrice - earliestRecent.price) / earliestRecent.price * 100).toFixed(4));
        if (rapidChangePercent > this.config.maxRapidChangePercent) {
          return {
            status: 'TRIPPED_VOLATILITY',
            allowed: false,
            spotPrice,
            twapPrice: twap,
            deviationPercent,
            rapidChangePercent,
            reason: `Rapid price movement of ${rapidChangePercent}% in ${this.config.rapidChangeWindowSec}s breaches limit of ${this.config.maxRapidChangePercent}%`,
          };
        }
      }
    }

    // Clean validation
    return {
      status: 'NORMAL',
      allowed: true,
      spotPrice,
      twapPrice: twap,
      deviationPercent,
      rapidChangePercent,
      reason: 'Price within acceptable TWAP and volatility bounds',
    };
  }

  public setEmergencyPause(paused: boolean): void {
    this.isManuallyPaused = paused;
  }

  public reset(): void {
    this.observations = [];
    this.isManuallyPaused = false;
  }
}
