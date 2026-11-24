/**
 * Liquidity Pool Imbalance & Impermanent Loss Telemetry Engine
 *
 * Instruments constant-product and automated market maker (AMM) liquidity pools,
 * monitors reserve skew, tracks real-time impermanent loss against entry benchmarks,
 * detects anomalous pool drains, and exports OpenMetrics/Prometheus telemetry.
 */

export interface PoolReserves {
  reserve0: bigint;
  reserve1: bigint;
  decimals0?: number;
  decimals1?: number;
}

export type LiquiditySeverity = 'NORMAL' | 'ELEVATED' | 'CRITICAL';

export interface LiquiditySnapshot {
  poolId: string;
  timestamp: number;
  reserve0: bigint;
  reserve1: bigint;
  spotPrice: number;
  entryPrice: number;
  priceRatio: number;
  impermanentLossPct: number;
  imbalanceRatio: number;
  severity: LiquiditySeverity;
}

export interface LiquidityAnomalyAlert {
  poolId: string;
  alertType: 'HIGH_IMPERMANENT_LOSS' | 'SEVERE_RESERVE_SKEW' | 'DRAIN_WARNING';
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
}

export interface LiquidityTelemetryReport {
  poolId: string;
  sampleCount: number;
  meanImbalanceRatio: number;
  maxImpermanentLossPct: number;
  latestSpotPrice: number;
  latestImbalanceRatio: number;
  activeAlertsCount: number;
  severityDistribution: Record<LiquiditySeverity, number>;
}

export interface LiquidityTelemetryOptions {
  maxHistory?: number;
  imbalanceThresholdElevated?: number;
  imbalanceThresholdCritical?: number;
  impermanentLossThresholdElevated?: number;
  impermanentLossThresholdCritical?: number;
}

/**
 * Calculates spot price of token0 in terms of token1: (reserve1 / 10^dec1) / (reserve0 / 10^dec0)
 */
export function calculateSpotPrice(
  reserve0: bigint,
  reserve1: bigint,
  decimals0: number = 18,
  decimals1: number = 18
): number {
  if (reserve0 <= 0n || reserve1 <= 0n) {
    throw new RangeError('Reserves must be strictly positive to compute spot price');
  }
  const norm0 = Number(reserve0) / Math.pow(10, decimals0);
  const norm1 = Number(reserve1) / Math.pow(10, decimals1);
  if (norm0 <= 0) {
    throw new RangeError('Normalized reserve0 must be strictly positive');
  }
  return norm1 / norm0;
}

/**
 * Computes impermanent loss percentage relative to standard HODL strategy:
 * IL(k) = (2 * sqrt(k) / (1 + k) - 1) * 100
 * where k = spotPrice / entryPrice
 */
export function calculateImpermanentLoss(priceRatio: number): number {
  if (priceRatio <= 0 || !Number.isFinite(priceRatio)) {
    return -100.0;
  }
  const sqrtK = Math.sqrt(priceRatio);
  const ilFraction = (2 * sqrtK) / (1 + priceRatio) - 1;
  return Number((ilFraction * 100).toFixed(4));
}

/**
 * Computes reserve imbalance ratio: abs(value0 - value1) / (value0 + value1)
 * Normalized on range [0, 1] where 0 is perfectly balanced and 1 is completely drained.
 */
export function calculateImbalanceRatio(
  reserve0: bigint,
  reserve1: bigint,
  spotPrice: number,
  decimals0: number = 18,
  decimals1: number = 18
): number {
  if (reserve0 <= 0n || reserve1 <= 0n) {
    return 1.0;
  }
  const norm0 = Number(reserve0) / Math.pow(10, decimals0);
  const norm1 = Number(reserve1) / Math.pow(10, decimals1);

  // Value of token0 measured in token1
  const value0InToken1 = norm0 * spotPrice;
  const value1 = norm1;
  const totalValue = value0InToken1 + value1;

  if (totalValue <= 0) {
    return 1.0;
  }
  const diff = Math.abs(value0InToken1 - value1);
  return Number((diff / totalValue).toFixed(4));
}

export class LiquidityTelemetryEngine {
  private readonly maxHistory: number;
  private readonly imbalanceThresholdElevated: number;
  private readonly imbalanceThresholdCritical: number;
  private readonly impermanentLossThresholdElevated: number;
  private readonly impermanentLossThresholdCritical: number;
  private snapshots: LiquiditySnapshot[] = [];

  constructor(options: LiquidityTelemetryOptions = {}) {
    this.maxHistory = options.maxHistory && options.maxHistory > 0 ? options.maxHistory : 1000;
    this.imbalanceThresholdElevated = options.imbalanceThresholdElevated ?? 0.30;
    this.imbalanceThresholdCritical = options.imbalanceThresholdCritical ?? 0.60;
    this.impermanentLossThresholdElevated = options.impermanentLossThresholdElevated ?? -3.0;
    this.impermanentLossThresholdCritical = options.impermanentLossThresholdCritical ?? -7.5;
  }

  /**
   * Records and evaluates an AMM pool liquidity state snapshot.
   */
  public recordSnapshot(input: {
    poolId: string;
    reserve0: bigint | number;
    reserve1: bigint | number;
    entryPrice: number;
    decimals0?: number;
    decimals1?: number;
    timestamp?: number;
  }): LiquiditySnapshot {
    const poolId = (input.poolId || '').trim();
    if (!poolId) {
      throw new TypeError('poolId must be a non-empty string');
    }
    const reserve0 = BigInt(input.reserve0);
    const reserve1 = BigInt(input.reserve1);

    if (reserve0 <= 0n || reserve1 <= 0n) {
      throw new RangeError('reserve0 and reserve1 must be strictly positive');
    }
    const entryPrice = input.entryPrice;
    if (typeof entryPrice !== 'number' || entryPrice <= 0 || !Number.isFinite(entryPrice)) {
      throw new RangeError('entryPrice must be a finite positive number');
    }

    const decimals0 = input.decimals0 ?? 18;
    const decimals1 = input.decimals1 ?? 18;
    const timestamp = input.timestamp ?? Date.now();

    const spotPrice = calculateSpotPrice(reserve0, reserve1, decimals0, decimals1);
    const priceRatio = spotPrice / entryPrice;
    const impermanentLossPct = calculateImpermanentLoss(priceRatio);
    const imbalanceRatio = calculateImbalanceRatio(reserve0, reserve1, spotPrice, decimals0, decimals1);

    let severity: LiquiditySeverity = 'NORMAL';
    if (
      imbalanceRatio >= this.imbalanceThresholdCritical ||
      impermanentLossPct <= this.impermanentLossThresholdCritical
    ) {
      severity = 'CRITICAL';
    } else if (
      imbalanceRatio >= this.imbalanceThresholdElevated ||
      impermanentLossPct <= this.impermanentLossThresholdElevated
    ) {
      severity = 'ELEVATED';
    }

    const snapshot: LiquiditySnapshot = {
      poolId,
      timestamp,
      reserve0,
      reserve1,
      spotPrice,
      entryPrice,
      priceRatio,
      impermanentLossPct,
      imbalanceRatio,
      severity,
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxHistory) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  /**
   * Returns stored snapshots, optionally filtered by pool ID.
   */
  public getSnapshots(poolId?: string): LiquiditySnapshot[] {
    if (poolId) {
      return this.snapshots.filter((s) => s.poolId === poolId);
    }
    return [...this.snapshots];
  }

  /**
   * Evaluates active anomaly alerts based on latest recorded snapshots.
   */
  public detectAnomalies(poolId?: string): LiquidityAnomalyAlert[] {
    const alerts: LiquidityAnomalyAlert[] = [];
    const poolSnapshots = this.getSnapshots(poolId);
    if (poolSnapshots.length === 0) return alerts;

    // Group by poolId and inspect latest snapshot
    const latestByPool = new Map<string, LiquiditySnapshot>();
    for (const s of poolSnapshots) {
      latestByPool.set(s.poolId, s);
    }

    for (const [pId, snap] of latestByPool.entries()) {
      if (snap.imbalanceRatio >= this.imbalanceThresholdCritical) {
        alerts.push({
          poolId: pId,
          alertType: 'SEVERE_RESERVE_SKEW',
          message: `Pool ${pId} reserve imbalance at ${(snap.imbalanceRatio * 100).toFixed(1)}% exceeds critical threshold`,
          value: snap.imbalanceRatio,
          threshold: this.imbalanceThresholdCritical,
          timestamp: snap.timestamp,
        });
      }

      if (snap.impermanentLossPct <= this.impermanentLossThresholdCritical) {
        alerts.push({
          poolId: pId,
          alertType: 'HIGH_IMPERMANENT_LOSS',
          message: `Pool ${pId} impermanent loss at ${snap.impermanentLossPct.toFixed(2)}% exceeds critical threshold`,
          value: snap.impermanentLossPct,
          threshold: this.impermanentLossThresholdCritical,
          timestamp: snap.timestamp,
        });
      }
    }

    return alerts;
  }

  /**
   * Generates comprehensive telemetry diagnostics for a pool.
   */
  public generateDiagnosticReport(poolId: string): LiquidityTelemetryReport {
    const poolSnapshots = this.snapshots.filter((s) => s.poolId === poolId);
    if (poolSnapshots.length === 0) {
      throw new Error(`No telemetry snapshots recorded for pool: ${poolId}`);
    }

    let sumImbalance = 0;
    let maxIL = 0;
    const distribution: Record<LiquiditySeverity, number> = {
      NORMAL: 0,
      ELEVATED: 0,
      CRITICAL: 0,
    };

    for (const s of poolSnapshots) {
      sumImbalance += s.imbalanceRatio;
      if (s.impermanentLossPct < maxIL) {
        maxIL = s.impermanentLossPct;
      }
      distribution[s.severity]++;
    }

    const latest = poolSnapshots[poolSnapshots.length - 1];
    const alerts = this.detectAnomalies(poolId);

    return {
      poolId,
      sampleCount: poolSnapshots.length,
      meanImbalanceRatio: Number((sumImbalance / poolSnapshots.length).toFixed(4)),
      maxImpermanentLossPct: maxIL,
      latestSpotPrice: latest.spotPrice,
      latestImbalanceRatio: latest.imbalanceRatio,
      activeAlertsCount: alerts.length,
      severityDistribution: distribution,
    };
  }

  /**
   * Exports recorded pool metrics in Prometheus OpenMetrics text exposition format.
   */
  public exportPrometheusMetrics(): string {
    const lines: string[] = [];
    lines.push('# HELP pioneer_liquidity_spot_price Current spot price of token0 relative to token1');
    lines.push('# TYPE pioneer_liquidity_spot_price gauge');
    lines.push('# HELP pioneer_liquidity_imbalance_ratio Reserve value imbalance ratio [0-1]');
    lines.push('# TYPE pioneer_liquidity_imbalance_ratio gauge');
    lines.push('# HELP pioneer_liquidity_impermanent_loss_pct Current impermanent loss percentage relative to entry');
    lines.push('# TYPE pioneer_liquidity_impermanent_loss_pct gauge');

    const latestByPool = new Map<string, LiquiditySnapshot>();
    for (const s of this.snapshots) {
      latestByPool.set(s.poolId, s);
    }

    for (const [poolId, s] of latestByPool.entries()) {
      lines.push(`pioneer_liquidity_spot_price{pool_id="${poolId}"} ${s.spotPrice.toFixed(6)}`);
      lines.push(`pioneer_liquidity_imbalance_ratio{pool_id="${poolId}"} ${s.imbalanceRatio.toFixed(4)}`);
      lines.push(`pioneer_liquidity_impermanent_loss_pct{pool_id="${poolId}"} ${s.impermanentLossPct.toFixed(4)}`);
    }

    return lines.join('\n') + '\n';
  }

  public clear(): void {
    this.snapshots = [];
  }
}
