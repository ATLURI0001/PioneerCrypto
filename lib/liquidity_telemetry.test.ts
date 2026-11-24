import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSpotPrice,
  calculateImpermanentLoss,
  calculateImbalanceRatio,
  LiquidityTelemetryEngine,
} from './liquidity_telemetry.ts';

describe('LiquidityTelemetryEngine & Impermanent Loss Telemetry Suite', () => {
  it('calculates spot price accurately across identical and differing decimals', () => {
    // 10 ETH (18 decimals) and 30,000 USDC (6 decimals)
    const ethReserves = 10n * 10n ** 18n;
    const usdcReserves = 30_000n * 10n ** 6n;
    const priceEthInUsdc = calculateSpotPrice(ethReserves, usdcReserves, 18, 6);
    assert.equal(priceEthInUsdc, 3000);

    // Identical decimals: 100 A and 200 B
    const price = calculateSpotPrice(100n, 200n, 0, 0);
    assert.equal(price, 2);
  });

  it('rejects invalid or non-positive reserves defensively', () => {
    assert.throws(() => calculateSpotPrice(0n, 100n), RangeError);
    assert.throws(() => calculateSpotPrice(100n, -50n), RangeError);
  });

  it('calculates standard impermanent loss percentages accurately', () => {
    // 1x price change -> 0% IL
    assert.equal(calculateImpermanentLoss(1.0), 0);

    // 1.25x price change -> ~ -0.6% IL
    const il125 = calculateImpermanentLoss(1.25);
    assert.ok(il125 < -0.5 && il125 > -0.7, `Expected ~ -0.6%, got ${il125}%`);

    // 2x price change -> ~ -5.72% IL
    const il200 = calculateImpermanentLoss(2.0);
    assert.ok(il200 < -5.6 && il200 > -5.8, `Expected ~ -5.72%, got ${il200}%`);

    // 3x price change -> ~ -13.4% IL
    const il300 = calculateImpermanentLoss(3.0);
    assert.ok(il300 < -13.3 && il300 > -13.5, `Expected ~ -13.4%, got ${il300}%`);

    // Zero or negative ratio
    assert.equal(calculateImpermanentLoss(0), -100);
    assert.equal(calculateImpermanentLoss(-5), -100);
  });

  it('calculates reserve imbalance ratio correctly', () => {
    // Perfectly balanced: 10 ETH @ $3000 = $30,000, and $30,000 USDC
    const ethReserves = 10n * 10n ** 18n;
    const usdcReserves = 30_000n * 10n ** 6n;
    const spotPrice = 3000;
    const imbalanceBalanced = calculateImbalanceRatio(ethReserves, usdcReserves, spotPrice, 18, 6);
    assert.equal(imbalanceBalanced, 0);

    // Heavily skewed pool: value0 = 10 * 3000 = 30000, value1 = 10000
    // diff = 20000, total = 40000 -> 0.5 ratio
    const skewedUsdc = 10_000n * 10n ** 6n;
    const imbalanceSkewed = calculateImbalanceRatio(ethReserves, skewedUsdc, spotPrice, 18, 6);
    assert.equal(imbalanceSkewed, 0.5);
  });

  it('records snapshots, categorizes severity, and honors maxHistory bounds', () => {
    const engine = new LiquidityTelemetryEngine({ maxHistory: 3 });

    // Normal snapshot
    const s1 = engine.recordSnapshot({
      poolId: 'ETH-USDC',
      reserve0: 10n * 10n ** 18n,
      reserve1: 30_000n * 10n ** 6n,
      entryPrice: 3000,
      decimals0: 18,
      decimals1: 6,
    });
    assert.equal(s1.severity, 'NORMAL');
    assert.equal(s1.impermanentLossPct, 0);

    // Elevated snapshot (2x price change, IL ~ -5.72%)
    const s2 = engine.recordSnapshot({
      poolId: 'ETH-USDC',
      reserve0: 5n * 10n ** 18n,
      reserve1: 30_000n * 10n ** 6n, // spot price becomes 6000
      entryPrice: 3000,
      decimals0: 18,
      decimals1: 6,
    });
    assert.equal(s2.severity, 'ELEVATED');

    // Critical snapshot (4x price change and skew)
    const s3 = engine.recordSnapshot({
      poolId: 'ETH-USDC',
      reserve0: 2n * 10n ** 18n,
      reserve1: 36_000n * 10n ** 6n, // spot price becomes 18000
      entryPrice: 3000,
      decimals0: 18,
      decimals1: 6,
    });
    assert.equal(s3.severity, 'CRITICAL');
    assert.equal(engine.getSnapshots('ETH-USDC').length, 3);

    // 4th snapshot forces eviction of s1
    engine.recordSnapshot({
      poolId: 'ETH-USDC',
      reserve0: 10n * 10n ** 18n,
      reserve1: 30_000n * 10n ** 6n,
      entryPrice: 3000,
      decimals0: 18,
      decimals1: 6,
    });
    assert.equal(engine.getSnapshots('ETH-USDC').length, 3);
  });

  it('detects anomaly alerts for critical pool imbalances and impermanent losses', () => {
    const engine = new LiquidityTelemetryEngine();

    // Critical imbalance snapshot
    engine.recordSnapshot({
      poolId: 'WBTC-USDC',
      reserve0: 1n * 10n ** 8n,
      reserve1: 300_000n * 10n ** 6n, // 300k vs entry 60k -> 5x price ratio
      entryPrice: 60_000,
      decimals0: 8,
      decimals1: 6,
    });

    const alerts = engine.detectAnomalies('WBTC-USDC');
    assert.ok(alerts.length >= 1);
    const ilAlert = alerts.find((a) => a.alertType === 'HIGH_IMPERMANENT_LOSS');
    assert.ok(ilAlert, 'High impermanent loss alert must be triggered');
  });

  it('generates diagnostic reports and exports OpenMetrics/Prometheus telemetry', () => {
    const engine = new LiquidityTelemetryEngine();

    engine.recordSnapshot({
      poolId: 'ETH-USDC',
      reserve0: 100n * 10n ** 18n,
      reserve1: 300_000n * 10n ** 6n,
      entryPrice: 3000,
      decimals0: 18,
      decimals1: 6,
    });

    const report = engine.generateDiagnosticReport('ETH-USDC');
    assert.equal(report.poolId, 'ETH-USDC');
    assert.equal(report.sampleCount, 1);
    assert.equal(report.latestSpotPrice, 3000);
    assert.equal(report.severityDistribution.NORMAL, 1);

    const prom = engine.exportPrometheusMetrics();
    assert.ok(prom.includes('pioneer_liquidity_spot_price{pool_id="ETH-USDC"} 3000.000000'));
    assert.ok(prom.includes('pioneer_liquidity_imbalance_ratio{pool_id="ETH-USDC"} 0.0000'));
    assert.ok(prom.includes('pioneer_liquidity_impermanent_loss_pct{pool_id="ETH-USDC"} 0.0000'));

    engine.clear();
    assert.equal(engine.getSnapshots().length, 0);
  });
});
