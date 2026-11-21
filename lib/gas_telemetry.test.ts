import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GasTelemetryRotary } from './gas_telemetry.ts';

describe('GasTelemetryRotary & Block Gas Diagnostic', () => {
  it('should initialize with defaults and handle empty snapshot', () => {
    const rotary = new GasTelemetryRotary();
    const snap = rotary.getSnapshot();

    assert.equal(snap.totalTransactions, 0);
    assert.equal(snap.meanGasUsed, 0);
    assert.equal(snap.p50GasUsed, 0);
    assert.deepEqual(snap.methodBreakdown, {});
  });

  it('should validate inputs defensively and reject invalid gas bounds', () => {
    const rotary = new GasTelemetryRotary();

    assert.throws(
      () =>
        rotary.recordTransaction({
          txHash: '',
          method: 'transfer',
          gasUsed: 21000n,
          gasLimit: 50000n,
        }),
      TypeError
    );

    assert.throws(
      () =>
        rotary.recordTransaction({
          txHash: '0xabc',
          method: 'transfer',
          gasUsed: -100n,
          gasLimit: 50000n,
        }),
      RangeError
    );

    assert.throws(
      () =>
        rotary.recordTransaction({
          txHash: '0xabc',
          method: 'transfer',
          gasUsed: 60000n,
          gasLimit: 50000n, // gasUsed > gasLimit
        }),
      RangeError
    );
  });

  it('should record transactions and compute accurate snapshot percentiles', () => {
    const rotary = new GasTelemetryRotary({ maxHistory: 100 });

    // Record 20 transactions with transfer (21000) and swap (100000)
    for (let i = 1; i <= 20; i++) {
      rotary.recordTransaction({
        txHash: `0x${i.toString(16).padStart(4, '0')}`,
        method: i % 2 === 0 ? 'transfer' : 'swap',
        gasUsed: i % 2 === 0 ? 21000n : 100000n,
        gasLimit: 150000n,
        blockNumber: 1001,
      });
    }

    const snap = rotary.getSnapshot();
    assert.equal(snap.totalTransactions, 20);
    assert.equal(snap.methodBreakdown.transfer.count, 10);
    assert.equal(snap.methodBreakdown.swap.count, 10);
    assert.equal(snap.methodBreakdown.transfer.avgGas, 21000);
    assert.equal(snap.methodBreakdown.swap.avgGas, 100000);

    // Mean should be (21000 + 100000) / 2 = 60500
    assert.equal(snap.meanGasUsed, 60500);
    assert.ok(snap.p50GasUsed >= 21000 && snap.p50GasUsed <= 100000);
  });

  it('should detect statistical gas anomalies via z-score evaluation', () => {
    const rotary = new GasTelemetryRotary();

    // Not enough samples (< 5) initially
    const early = rotary.detectGasAnomaly('mint', 500000n);
    assert.equal(early.isAnomaly, false);

    // Record baseline mints around 80,000 gas
    for (let i = 0; i < 10; i++) {
      rotary.recordTransaction({
        txHash: `0xmint${i}`,
        method: 'mint',
        gasUsed: BigInt(80000 + (i % 3) * 1000), // 80k - 82k
        gasLimit: 200000n,
      });
    }

    // Normal execution (81,000) -> not an anomaly
    const normal = rotary.detectGasAnomaly('mint', 81000n);
    assert.equal(normal.isAnomaly, false);
    assert.ok(normal.zScore < 1.0);

    // Severe spike (250,000) -> anomaly
    const spike = rotary.detectGasAnomaly('mint', 250000n, 2.5);
    assert.equal(spike.isAnomaly, true);
    assert.ok(spike.zScore > 2.5);
  });

  it('should summarize block gas utilization against protocol target', () => {
    const rotary = new GasTelemetryRotary({ defaultBlockGasLimit: 30_000_000n });

    // Block 5000 with 3 transactions totaling 15M gas (50% target utilization)
    rotary.recordTransaction({
      txHash: '0x1',
      method: 'batch',
      gasUsed: 5_000_000n,
      gasLimit: 10_000_000n,
      blockNumber: 5000,
    });
    rotary.recordTransaction({
      txHash: '0x2',
      method: 'batch',
      gasUsed: 10_000_000n,
      gasLimit: 10_000_000n,
      blockNumber: 5000,
    });

    const summary = rotary.summarizeBlock(5000);
    assert.equal(summary.blockNumber, 5000);
    assert.equal(summary.txCount, 2);
    assert.equal(summary.totalGasUsed, 15_000_000n);
    assert.equal(summary.utilizationPct, 50);
  });
});
