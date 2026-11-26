import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CircuitState,
  FallbackAction,
  FlashLoanCircuitBreaker,
} from './flash_loan_circuit_breaker.ts';

describe('FlashLoanCircuitBreaker Suite', () => {
  const pool = '0x1234567890123456789012345678901234567890';
  const reserve100k = 100000000000n; // 100k units

  it('permits nominal swaps within reserve depletion bounds', () => {
    const cb = new FlashLoanCircuitBreaker({ maxReserveDepletionBps: 2000 }); // 20% max

    // 5% swap (5,000 / 100,000 = 500 bps)
    const res = cb.evaluateSwap({
      poolAddress: pool,
      reserveIn: reserve100k,
      reserveOut: reserve100k,
      amountIn: 5000000000n,
      amountOut: 5000000000n,
    });

    assert.equal(res.allowed, true);
    assert.equal(res.circuitState, CircuitState.CLOSED);
    assert.equal(res.action, FallbackAction.EXECUTE_PRIMARY);
    assert.equal(res.depletionBps, 500);
  });

  it('trips to OPEN when a massive flash-loan swap depletes reserves', () => {
    const cb = new FlashLoanCircuitBreaker({ maxReserveDepletionBps: 3000, recoveryTimeoutMs: 10000 });

    // 40% swap (40,000 / 100,000 = 4,000 bps >= 3,000 bps)
    const res = cb.evaluateSwap({
      poolAddress: pool,
      reserveIn: reserve100k,
      reserveOut: reserve100k,
      amountIn: 40000000000n,
      amountOut: 40000000000n,
      now: 1000,
    });

    assert.equal(res.allowed, false);
    assert.equal(res.circuitState, CircuitState.OPEN);
    assert.equal(res.action, FallbackAction.THROTTLE_LARGE_SWAP);
    assert.equal(cb.state, CircuitState.OPEN);
    assert.equal(cb.tripCount, 1);
  });

  it('diverts subsequent swaps to TWAP when circuit is OPEN', () => {
    const cb = new FlashLoanCircuitBreaker({ maxReserveDepletionBps: 3000, recoveryTimeoutMs: 5000 });

    // Trip
    cb.evaluateSwap({
      poolAddress: pool,
      reserveIn: reserve100k,
      reserveOut: reserve100k,
      amountIn: 50000000000n,
      amountOut: 50000000000n,
      now: 1000,
    });

    // Subsequent small swap within timeout window (1000 + 2000 = 3000 < 6000)
    const res2 = cb.evaluateSwap({
      poolAddress: pool,
      reserveIn: reserve100k,
      reserveOut: reserve100k,
      amountIn: 100000000n,
      amountOut: 100000000n,
      now: 3000,
    });

    assert.equal(res2.allowed, false);
    assert.equal(res2.action, FallbackAction.DIVERT_TO_TWAP);
  });

  it('transitions to HALF_OPEN after recovery and permits small canary swaps', () => {
    const cb = new FlashLoanCircuitBreaker({
      maxReserveDepletionBps: 2000,
      recoveryTimeoutMs: 5000,
      halfOpenSuccessThreshold: 2,
      maxCanaryDepletionBps: 100, // 1%
    });

    // Trip to OPEN
    cb.evaluateSwap({
      poolAddress: pool,
      reserveIn: reserve100k,
      reserveOut: reserve100k,
      amountIn: 30000000000n,
      amountOut: 30000000000n,
      now: 1000,
    });

    // Advance past recovery (now = 7000 > 6000) -> 0.5% canary swap
    const probe1 = cb.evaluateSwap({
      poolAddress: pool,
      reserveIn: reserve100k,
      reserveOut: reserve100k,
      amountIn: 500000000n,
      amountOut: 500000000n, // 50 bps <= 100 bps
      now: 7000,
    });

    assert.equal(probe1.allowed, true);
    assert.equal(probe1.circuitState, CircuitState.HALF_OPEN);
    assert.equal(probe1.action, FallbackAction.ALLOW_CANARY);

    // 2nd probe succeeds -> transitions back to CLOSED!
    const probe2 = cb.evaluateSwap({
      poolAddress: pool,
      reserveIn: reserve100k,
      reserveOut: reserve100k,
      amountIn: 500000000n,
      amountOut: 500000000n,
      now: 7100,
    });

    assert.equal(probe2.allowed, true);
    assert.equal(cb.state, CircuitState.CLOSED);
  });

  it('re-trips immediately if a large swap is attempted during HALF_OPEN phase', () => {
    const cb = new FlashLoanCircuitBreaker({
      maxReserveDepletionBps: 2000,
      recoveryTimeoutMs: 5000,
      maxCanaryDepletionBps: 100,
    });

    cb.evaluateSwap({
      poolAddress: pool,
      reserveIn: reserve100k,
      reserveOut: reserve100k,
      amountIn: 30000000000n,
      amountOut: 30000000000n,
      now: 1000,
    });

    // During HALF_OPEN, attempt a 5% swap (> 1% canary ceiling)
    const probe = cb.evaluateSwap({
      poolAddress: pool,
      reserveIn: reserve100k,
      reserveOut: reserve100k,
      amountIn: 5000000000n,
      amountOut: 5000000000n,
      now: 7000,
    });

    assert.equal(probe.allowed, false);
    assert.equal(cb.state, CircuitState.OPEN);
    assert.equal(cb.tripCount, 2);
  });

  it('defensively validates input parameters', () => {
    const cb = new FlashLoanCircuitBreaker();

    assert.throws(
      () => cb.evaluateSwap({ poolAddress: 'bad', reserveIn: 10n, reserveOut: 10n, amountIn: 1n, amountOut: 1n }),
      /Invalid poolAddress format/
    );

    assert.throws(
      () => cb.evaluateSwap({ poolAddress: pool, reserveIn: 0n, reserveOut: 10n, amountIn: 1n, amountOut: 1n }),
      /Reserves must be positive bigints/
    );
  });
});
