import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SandwichArbitrageCircuitBreaker,
  CircuitState,
} from './sandwich_arbitrage_circuit_breaker.ts';
import type { PoolReserves } from './sandwich_arbitrage_circuit_breaker.ts';

test('SandwichArbitrageCircuitBreaker - normal swap allowed', () => {
  const cb = new SandwichArbitrageCircuitBreaker(300, 3, 5, 1000);
  const reserves: PoolReserves = {
    reserveA: 1_000_000n,
    reserveB: 1_000_000n,
    blockNumber: 100,
  };

  // Swap 10,000 into 1,000,000 (~0.99% impact < 3%)
  const res = cb.evaluateSwap(10_000n, true, reserves);
  assert.equal(res.allowed, true);
  assert.equal(res.state, CircuitState.CLOSED);
  assert.ok(res.priceImpactBps < 300);
});

test('SandwichArbitrageCircuitBreaker - excessive price impact rejected', () => {
  const cb = new SandwichArbitrageCircuitBreaker(300, 3, 5, 1000);
  const reserves: PoolReserves = {
    reserveA: 1_000_000n,
    reserveB: 1_000_000n,
    blockNumber: 100,
  };

  // Swap 100,000 into 1,000,000 (~9.09% impact > 3%)
  const res = cb.evaluateSwap(100_000n, true, reserves);
  assert.equal(res.allowed, false);
  assert.equal(res.reason, 'ERR_EXCESSIVE_PRICE_IMPACT');
});

test('SandwichArbitrageCircuitBreaker - trips to OPEN after consecutive anomalies', () => {
  const cb = new SandwichArbitrageCircuitBreaker(300, 2, 5, 1000);
  const reserves: PoolReserves = {
    reserveA: 1_000_000n,
    reserveB: 1_000_000n,
    blockNumber: 100,
  };

  const t0 = 1000;
  // Anomaly 1
  cb.evaluateSwap(100_000n, true, reserves, t0);
  assert.equal(cb.getState(), CircuitState.CLOSED);

  // Anomaly 2 -> trips OPEN
  const res2 = cb.evaluateSwap(100_000n, true, reserves, t0 + 100);
  assert.equal(res2.state, CircuitState.OPEN);

  // Evaluation while OPEN
  const res3 = cb.evaluateSwap(1_000n, true, reserves, t0 + 200);
  assert.equal(res3.allowed, false);
  assert.equal(res3.reason, 'ERR_CIRCUIT_OPEN_SANDWICH_PROTECTION');
});

test('SandwichArbitrageCircuitBreaker - cooldown recovery to HALF_OPEN and CLOSED', () => {
  const cb = new SandwichArbitrageCircuitBreaker(300, 1, 2, 500);
  const reserves: PoolReserves = {
    reserveA: 1_000_000n,
    reserveB: 1_000_000n,
    blockNumber: 100,
  };

  const t0 = 1000;
  // Trip OPEN
  cb.evaluateSwap(100_000n, true, reserves, t0);
  assert.equal(cb.getState(), CircuitState.OPEN);

  // After cooldown (t0 + 600) -> HALF_OPEN
  const res1 = cb.evaluateSwap(1_000n, true, reserves, t0 + 600);
  assert.equal(res1.state, CircuitState.HALF_OPEN);
  assert.equal(res1.allowed, true);

  // 2nd success -> CLOSED
  const res2 = cb.evaluateSwap(1_000n, true, reserves, t0 + 700);
  assert.equal(res2.state, CircuitState.CLOSED);
  assert.equal(res2.allowed, true);
});
