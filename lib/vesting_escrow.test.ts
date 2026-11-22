import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VestingEscrowEngine } from './vesting_escrow.ts';

describe('VestingEscrowEngine Suite', () => {
  const beneficiary = '0x1234567890123456789012345678901234567890';
  const start = 1_000_000n;
  const cliff = 100n;
  const duration = 1_000n;
  const total = 10_000_000n;

  test('validates inputs defensively on schedule creation', () => {
    const engine = new VestingEscrowEngine();

    // Invalid address
    assert.throws(
      () =>
        engine.createSchedule({
          beneficiary: '0xinvalid',
          totalAmount: total,
          startSec: start,
          cliffDurationSec: cliff,
          durationSec: duration,
        }),
      /Invalid beneficiary/
    );

    // Zero or negative total amount
    assert.throws(
      () =>
        engine.createSchedule({
          beneficiary,
          totalAmount: 0n,
          startSec: start,
          cliffDurationSec: cliff,
          durationSec: duration,
        }),
      /Total vesting amount must be strictly greater than 0/
    );

    // Cliff exceeds total duration
    assert.throws(
      () =>
        engine.createSchedule({
          beneficiary,
          totalAmount: total,
          startSec: start,
          cliffDurationSec: 1500n,
          durationSec: 1000n,
        }),
      /Cliff duration cannot be negative or exceed/
    );
  });

  test('enforces cliff lockup before cliff timestamp', () => {
    const engine = new VestingEscrowEngine();
    const schedule = engine.createSchedule({
      beneficiary,
      totalAmount: total,
      startSec: start,
      cliffDurationSec: cliff,
      durationSec: duration,
    });

    // Before cliff (start + 50s)
    const vestedBeforeCliff = engine.computeVestedAmount(schedule.id, start + 50n);
    assert.equal(vestedBeforeCliff, 0n);

    const releasableBeforeCliff = engine.computeReleasableAmount(schedule.id, start + 50n);
    assert.equal(releasableBeforeCliff, 0n);
  });

  test('calculates exact linear vesting at cliff and midpoint', () => {
    const engine = new VestingEscrowEngine();
    const schedule = engine.createSchedule({
      beneficiary,
      totalAmount: total,
      startSec: start,
      cliffDurationSec: cliff, // 100s
      durationSec: duration,   // 1000s
    });

    // Exactly at cliff (100s elapsed out of 1000s = 10% vested)
    const vestedAtCliff = engine.computeVestedAmount(schedule.id, start + 100n);
    assert.equal(vestedAtCliff, 1_000_000n);

    // At 50% midpoint (500s elapsed = 50% vested)
    const vestedAtMid = engine.computeVestedAmount(schedule.id, start + 500n);
    assert.equal(vestedAtMid, 5_000_000n);

    // At 100% completion (1000s elapsed)
    const vestedAtEnd = engine.computeVestedAmount(schedule.id, start + 1000n);
    assert.equal(vestedAtEnd, 10_000_000n);

    // Well past completion (2000s elapsed clamped at 100%)
    const vestedPastEnd = engine.computeVestedAmount(schedule.id, start + 2000n);
    assert.equal(vestedPastEnd, 10_000_000n);
  });

  test('supports partial progressive releases and tracks released totals', () => {
    const engine = new VestingEscrowEngine();
    const schedule = engine.createSchedule({
      beneficiary,
      totalAmount: total,
      startSec: start,
      cliffDurationSec: cliff,
      durationSec: duration,
    });

    // Release at 250s (25% = 2,500,000)
    const rel1 = engine.release(schedule.id, start + 250n);
    assert.equal(rel1.released, 2_500_000n);
    assert.equal(rel1.totalReleased, 2_500_000n);

    // Subsequent call at same timestamp has 0 releasable
    const relSame = engine.release(schedule.id, start + 250n);
    assert.equal(relSame.released, 0n);
    assert.equal(relSame.totalReleased, 2_500_000n);

    // Release at 750s (75% vested - 25% already released = 5,000,000 releasable)
    const rel2 = engine.release(schedule.id, start + 750n);
    assert.equal(rel2.released, 5_000_000n);
    assert.equal(rel2.totalReleased, 7_500_000n);
  });

  test('handles schedule revocation and unvested refund', () => {
    const engine = new VestingEscrowEngine();
    const schedule = engine.createSchedule({
      beneficiary,
      totalAmount: total,
      startSec: start,
      cliffDurationSec: cliff,
      durationSec: duration,
      revocable: true,
    });

    // Advance to 40% (400s elapsed = 4,000,000 vested) and revoke
    const result = engine.revoke(schedule.id, start + 400n);
    assert.equal(result.vestedClaimed, 4_000_000n);
    assert.equal(result.unvestedRefund, 6_000_000n);

    const revokedSchedule = engine.getSchedule(schedule.id);
    assert.equal(revokedSchedule.revoked, true);
    assert.equal(revokedSchedule.releasedAmount, 4_000_000n);

    // Future releases must be rejected
    assert.throws(() => engine.release(schedule.id, start + 500n), /Cannot release tokens from a revoked schedule/);

    // Second revocation attempt must be rejected
    assert.throws(() => engine.revoke(schedule.id, start + 500n), /Schedule has already been revoked/);
  });

  test('blocks revocation of non-revocable schedules', () => {
    const engine = new VestingEscrowEngine();
    const schedule = engine.createSchedule({
      beneficiary,
      totalAmount: total,
      startSec: start,
      cliffDurationSec: cliff,
      durationSec: duration,
      revocable: false,
    });

    assert.throws(() => engine.revoke(schedule.id, start + 500n), /Schedule is non-revocable/);
  });
});
