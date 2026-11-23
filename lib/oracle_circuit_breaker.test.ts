import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OracleCircuitBreaker,
  DEFAULT_ORACLE_CONFIG,
} from './oracle_circuit_breaker.ts';

describe('OracleCircuitBreaker & TWAP Flash Crash Mitigation', () => {
  it('computes accurate trapezoidal TWAP across multi-observation window', () => {
    const cb = new OracleCircuitBreaker({ twapWindowSec: 1000 });
    const t0 = 10000;

    // Price moves linearly from 100 to 200 over 1000s
    cb.recordObservation(100, t0);
    cb.recordObservation(200, t0 + 1000);

    const twap = cb.computeTWAP(t0 + 1000);
    // Average of linear slope 100 to 200 is 150
    assert.equal(twap, 150);
  });

  it('allows updates when spot price is within deviation limit', () => {
    const cb = new OracleCircuitBreaker({ maxDeviationPercent: 5.0 });
    const t0 = 10000;

    cb.recordObservation(2000, t0);
    cb.recordObservation(2000, t0 + 300);

    // 2020 is only a 1% deviation (20/2000)
    const res = cb.validatePrice(2020, t0 + 310);
    assert.equal(res.status, 'NORMAL');
    assert.equal(res.allowed, true);
    assert.equal(res.deviationPercent, 1.0);
  });

  it('trips circuit breaker when spot price deviates significantly from TWAP', () => {
    const cb = new OracleCircuitBreaker({ maxDeviationPercent: 5.0 });
    const t0 = 10000;

    cb.recordObservation(2000, t0);
    cb.recordObservation(2000, t0 + 600);

    // 2200 is 10% deviation (limit is 5%)
    const res = cb.validatePrice(2200, t0 + 610);
    assert.equal(res.status, 'TRIPPED_DEVIATION');
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('breaches limit of 5%'));
  });

  it('trips circuit breaker when oracle heartbeat is stale', () => {
    const cb = new OracleCircuitBreaker({ maxHeartbeatSec: 3600 });
    const t0 = 10000;

    cb.recordObservation(1500, t0);

    // 4000s later (exceeds 3600s heartbeat)
    const res = cb.validatePrice(1500, t0 + 4000);
    assert.equal(res.status, 'TRIPPED_STALE');
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('stale'));
  });

  it('trips circuit breaker on rapid price flash crash within 60s', () => {
    const cb = new OracleCircuitBreaker({
      maxDeviationPercent: 20.0,
      maxRapidChangePercent: 10.0,
      rapidChangeWindowSec: 60,
    });
    const t0 = 10000;

    cb.recordObservation(1000, t0);

    // 30 seconds later, price crashes 12% to 880 (within 10% limit)
    const res = cb.validatePrice(880, t0 + 30);
    assert.equal(res.status, 'TRIPPED_VOLATILITY');
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('Rapid price movement'));
  });

  it('rejects invalid or negative prices defensively', () => {
    const cb = new OracleCircuitBreaker();
    const res1 = cb.validatePrice(-50, 10000);
    assert.equal(res1.status, 'TRIPPED_INVALID_PRICE');
    assert.equal(res1.allowed, false);

    const res2 = cb.validatePrice(0, 10000);
    assert.equal(res2.status, 'TRIPPED_INVALID_PRICE');
    assert.equal(res2.allowed, false);

    assert.throws(() => cb.recordObservation(-10, 1000), /Invalid observation price/);
    assert.throws(() => cb.recordObservation(100, -5), /Invalid observation timestamp/);
  });

  it('rejects non-monotonic observation timestamps', () => {
    const cb = new OracleCircuitBreaker();
    cb.recordObservation(100, 1000);
    assert.throws(() => cb.recordObservation(105, 900), /Non-monotonic timestamp/);
  });

  it('respects emergency multisig manual pause and reset', () => {
    const cb = new OracleCircuitBreaker();
    cb.recordObservation(100, 1000);

    cb.setEmergencyPause(true);
    const res = cb.validatePrice(100, 1010);
    assert.equal(res.allowed, false);
    assert.ok(res.reason.includes('manually paused'));

    cb.reset();
    const resAfterReset = cb.validatePrice(100, 1010);
    assert.equal(resAfterReset.allowed, true);
  });
});
