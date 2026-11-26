import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AmmSlippageTelemetryRotary,
  type SwapExecutionSample,
} from './amm_slippage_telemetry.ts';

describe('AmmSlippageTelemetryRotary Suite', () => {
  const pool = '0x1111111111111111111111111111111111111111';

  it('records nominal swap execution with positive slippage', () => {
    const rotary = new AmmSlippageTelemetryRotary(50, 50);
    // Expected 1,000,000, Actual 995,000 -> 5,000 loss (0.5% or 50 bps)
    const sample = rotary.recordSwap(
      pool,
      'USDC',
      'WETH',
      1000000n,
      995000n,
      2500000,
      12.5,
      100000
    );

    assert.equal(sample.slippageBps, 50);
    assert.equal(sample.poolAddress, pool.toLowerCase());
    assert.equal(sample.tokenIn, 'USDC');
    assert.equal(sample.tokenOut, 'WETH');

    const stats = rotary.getStats();
    assert.equal(stats.totalIngested, 1);
    assert.equal(stats.activeSamples, 1);
  });

  it('records surplus execution with negative slippage', () => {
    const rotary = new AmmSlippageTelemetryRotary(50, 50);
    // Expected 1,000,000, Actual 1,005,000 -> 50 bps favorable surplus
    const sample = rotary.recordSwap(
      pool,
      'USDC',
      'WETH',
      1000000n,
      1005000n,
      2500000,
      8.0
    );

    assert.equal(sample.slippageBps, -50);
  });

  it('enforces circular buffer rollover without exceeding capacity', () => {
    const capacity = 10;
    const rotary = new AmmSlippageTelemetryRotary(capacity, 100);

    for (let i = 0; i < 25; i++) {
      rotary.recordSwap(
        pool,
        'USDC',
        'WETH',
        10000n,
        BigInt(10000 - i),
        100000,
        5.0
      );
    }

    const stats = rotary.getStats();
    assert.equal(stats.totalIngested, 25);
    assert.equal(stats.activeSamples, capacity);

    const active = rotary.getActiveSamples();
    assert.equal(active.length, capacity);
  });

  it('filters samples within rolling time window', () => {
    const rotary = new AmmSlippageTelemetryRotary(50, 100);
    const now = 200000;

    rotary.recordSwap(pool, 'A', 'B', 1000n, 990n, 50000, 2.0, now - 60000); // 60s ago
    rotary.recordSwap(pool, 'A', 'B', 1000n, 995n, 50000, 2.0, now - 20000); // 20s ago
    rotary.recordSwap(pool, 'A', 'B', 1000n, 998n, 50000, 2.0, now - 5000);  // 5s ago

    const recent = rotary.getWindowSamples(30000, now); // last 30s
    assert.equal(recent.length, 2);
  });

  it('computes accurate slippage percentiles and averages', () => {
    const rotary = new AmmSlippageTelemetryRotary(50, 100);

    // Feed 10 samples with slippage: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100 bps
    for (let i = 1; i <= 10; i++) {
      const bps = i * 10;
      const actual = 10000n - BigInt(bps);
      rotary.recordSwap(pool, 'A', 'B', 10000n, actual, 100000, 4.0);
    }

    const summary = rotary.summarizePool(pool);
    assert.equal(summary.sampleCount, 10);
    assert.equal(summary.percentiles.min ?? summary.percentiles.p50, 60);
    assert.equal(summary.percentiles.max, 100);
    assert.equal(summary.percentiles.avg, 55);
    assert.equal(summary.breachCount, 1); // 100 bps >= threshold 100
  });

  it('defensively validates pool address and input arguments', () => {
    const rotary = new AmmSlippageTelemetryRotary(50, 100);

    assert.throws(
      () => rotary.recordSwap('invalid-address', 'A', 'B', 100n, 90n, 100, 1),
      /Invalid poolAddress format/
    );

    assert.throws(
      () => rotary.recordSwap(pool, 'A', 'B', 0n, 0n, 100, 1),
      /expectedOutput must be positive/
    );

    assert.throws(
      () => rotary.recordSwap(pool, 'A', 'B', 100n, -10n, 100, 1),
      /actualOutput cannot be negative/
    );

    assert.throws(
      () => new AmmSlippageTelemetryRotary(5),
      /Capacity must be at least 10/
    );
  });

  it('resets buffer cleanly', () => {
    const rotary = new AmmSlippageTelemetryRotary(50, 100);
    rotary.recordSwap(pool, 'A', 'B', 1000n, 990n, 10000, 1.0);
    assert.equal(rotary.getActiveSamples().length, 1);

    rotary.reset();
    assert.equal(rotary.getActiveSamples().length, 0);
    assert.equal(rotary.getStats().totalIngested, 0);
  });
});
