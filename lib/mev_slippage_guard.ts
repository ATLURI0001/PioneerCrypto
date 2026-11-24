// Copyright 2026 PioneerCrypto Authors. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// MEV Sandwich Attack & Dynamic Slippage Tolerance Circuit Guard.
// Defends DEX swaps against mempool front-running and back-running exploits,
// detects spot-TWAP price manipulation, and enforces dynamic slippage bounds.

export const GuardCircuitState = {
  NORMAL: 'NORMAL',
  SUSPICIOUS: 'SUSPICIOUS',
  CIRCUIT_TRIPPED: 'CIRCUIT_TRIPPED',
} as const;

export type GuardCircuitState = (typeof GuardCircuitState)[keyof typeof GuardCircuitState];

export const RiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export interface PoolState {
  reserve0: bigint;
  reserve1: bigint;
  twapPrice: number;
  blockNumber: number;
}

export interface SwapOrder {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOutMin: bigint;
  maxPriorityFeeGwei: number;
  caller: string;
  timestampMs?: number;
}

export interface SandwichEvaluation {
  state: GuardCircuitState;
  riskLevel: RiskLevel;
  allowed: boolean;
  recommendedMaxSlippageBps: number;
  spotDivergencePercent: number;
  priorityFeeAnomaly: boolean;
  reason: string;
  timestampMs: number;
}

export interface GuardOptions {
  maxNormalSlippageBps: number;        // Default 50 bps (0.50%)
  maxSuspiciousSlippageBps: number;    // Default 15 bps (0.15%)
  spotTwapDeviationThresholdBps: number; // Default 150 bps (1.50%)
  criticalDeviationThresholdBps: number; // Default 400 bps (4.00%)
  priorityFeeAnomalyThresholdGwei: number; // Default 50 Gwei
}

export class MevSandwichGuard {
  readonly options: GuardOptions;
  private state: GuardCircuitState = GuardCircuitState.NORMAL;
  private tripReason: string | null = null;
  private incidentHistory: SandwichEvaluation[] = [];

  constructor(options: Partial<GuardOptions> = {}) {
    this.options = {
      maxNormalSlippageBps: Math.max(5, options.maxNormalSlippageBps ?? 50),
      maxSuspiciousSlippageBps: Math.max(1, options.maxSuspiciousSlippageBps ?? 15),
      spotTwapDeviationThresholdBps: Math.max(10, options.spotTwapDeviationThresholdBps ?? 150),
      criticalDeviationThresholdBps: Math.max(50, options.criticalDeviationThresholdBps ?? 400),
      priorityFeeAnomalyThresholdGwei: Math.max(1.0, options.priorityFeeAnomalyThresholdGwei ?? 50.0),
    };
  }

  /**
   * Evaluates an incoming swap against current pool state and pending mempool orders.
   */
  evaluateSwap(
    pool: PoolState,
    order: SwapOrder,
    pendingMempool: SwapOrder[] = []
  ): SandwichEvaluation {
    if (!pool || pool.reserve0 <= 0n || pool.reserve1 <= 0n || pool.twapPrice <= 0) {
      throw new TypeError('Invalid pool state: reserves and TWAP price must be positive');
    }

    if (!order || order.amountIn <= 0n) {
      throw new TypeError('Invalid order: amountIn must be a positive bigint');
    }

    const now = Date.now();

    // If circuit is explicitly tripped, reject immediately
    if (this.state === GuardCircuitState.CIRCUIT_TRIPPED) {
      const evalResult: SandwichEvaluation = {
        state: GuardCircuitState.CIRCUIT_TRIPPED,
        riskLevel: RiskLevel.CRITICAL,
        allowed: false,
        recommendedMaxSlippageBps: 0,
        spotDivergencePercent: 0,
        priorityFeeAnomaly: false,
        reason: `Swap rejected: Circuit breaker is active (${this.tripReason || 'MANUAL_TRIP'})`,
        timestampMs: now,
      };
      this.incidentHistory.push(evalResult);
      return evalResult;
    }

    // 1. Calculate Instantaneous Spot Price (reserve1 / reserve0)
    const spotPrice = Number(pool.reserve1) / Number(pool.reserve0);
    const deviationFraction = Math.abs(spotPrice - pool.twapPrice) / pool.twapPrice;
    const deviationBps = Math.round(deviationFraction * 10000);
    const deviationPercent = Number((deviationFraction * 100).toFixed(2));

    // 2. Inspect Priority Fee Anomaly
    const priorityFeeAnomaly = order.maxPriorityFeeGwei >= this.options.priorityFeeAnomalyThresholdGwei;

    // 3. Inspect Mempool for Front-Running / Sandwich Patterns
    // Look for opposing trades with higher priority fees in pending mempool
    let frontrunDetected = false;
    for (const pending of pendingMempool) {
      if (
        pending.tokenIn === order.tokenIn &&
        pending.tokenOut === order.tokenOut &&
        pending.maxPriorityFeeGwei > order.maxPriorityFeeGwei * 1.5 &&
        pending.amountIn >= order.amountIn / 2n
      ) {
        frontrunDetected = true;
        break;
      }
    }

    // 4. Determine Dynamic Risk Level & Circuit Response
    let assignedState = GuardCircuitState.NORMAL;
    let riskLevel = RiskLevel.LOW;
    let allowed = true;
    let recommendedSlippageBps = this.options.maxNormalSlippageBps;
    let reason = 'NOMINAL_EXECUTION';

    if (deviationBps >= this.options.criticalDeviationThresholdBps || frontrunDetected) {
      assignedState = GuardCircuitState.CIRCUIT_TRIPPED;
      riskLevel = RiskLevel.CRITICAL;
      allowed = false;
      recommendedSlippageBps = 0;
      reason = frontrunDetected
        ? 'MEV_SANDWICH_SIGNATURE_DETECTED: Pending high-priority front-runner identified in mempool'
        : `CRITICAL_PRICE_MANIPULATION: Spot-TWAP deviation (${deviationPercent}%) exceeds ceiling (${this.options.criticalDeviationThresholdBps / 100}%)`;
      this.state = GuardCircuitState.CIRCUIT_TRIPPED;
      this.tripReason = reason;
    } else if (deviationBps >= this.options.spotTwapDeviationThresholdBps || priorityFeeAnomaly) {
      assignedState = GuardCircuitState.SUSPICIOUS;
      riskLevel = RiskLevel.HIGH;
      allowed = true;
      recommendedSlippageBps = this.options.maxSuspiciousSlippageBps;
      reason = priorityFeeAnomaly
        ? `SUSPICIOUS_GAS_SPIKE: Order priority fee (${order.maxPriorityFeeGwei} Gwei) triggers defensive slippage clamping`
        : `ELEVATED_SPOT_DIVERGENCE: Spot deviation (${deviationPercent}%) triggers defensive slippage clamping`;
      this.state = GuardCircuitState.SUSPICIOUS;
    } else if (deviationBps >= this.options.spotTwapDeviationThresholdBps / 2) {
      riskLevel = RiskLevel.MEDIUM;
      recommendedSlippageBps = Math.round((this.options.maxNormalSlippageBps + this.options.maxSuspiciousSlippageBps) / 2);
    }

    const result: SandwichEvaluation = {
      state: assignedState,
      riskLevel,
      allowed,
      recommendedMaxSlippageBps: recommendedSlippageBps,
      spotDivergencePercent: deviationPercent,
      priorityFeeAnomaly,
      reason,
      timestampMs: now,
    };

    if (riskLevel === RiskLevel.HIGH || riskLevel === RiskLevel.CRITICAL) {
      this.incidentHistory.push(result);
    }

    return result;
  }

  /**
   * Computes a dynamic slippage bound (in BPS) based on trade size relative to pool liquidity.
   */
  calculateDynamicSlippageBound(orderAmountIn: bigint, poolReserveIn: bigint): number {
    if (orderAmountIn <= 0n || poolReserveIn <= 0n) {
      return this.options.maxNormalSlippageBps;
    }

    // Trade proportion = amountIn / reserveIn
    const proportion = Number(orderAmountIn) / Number(poolReserveIn);

    // Deep liquidity: trade < 0.1% of pool -> tighten to 10-20 BPS
    if (proportion < 0.001) {
      return 15;
    }
    // Moderate liquidity: 0.1% to 1.0% -> 30-50 BPS
    if (proportion <= 0.01) {
      return this.options.maxNormalSlippageBps;
    }
    // Heavy trade: > 1.0% of pool -> clamp to 100 BPS max to guard against sandwichers
    return Math.min(100, Math.round(proportion * 5000));
  }

  /**
   * Manually trips the circuit breaker.
   */
  tripCircuit(reason: string): void {
    this.state = GuardCircuitState.CIRCUIT_TRIPPED;
    this.tripReason = reason;
  }

  /**
   * Resets circuit breaker to NORMAL state.
   */
  resetCircuit(): void {
    this.state = GuardCircuitState.NORMAL;
    this.tripReason = null;
  }

  getCircuitState(): GuardCircuitState {
    return this.state;
  }

  getIncidentHistory(): SandwichEvaluation[] {
    return [...this.incidentHistory];
  }
}
