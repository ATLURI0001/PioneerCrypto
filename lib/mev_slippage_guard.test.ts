// Copyright 2026 PioneerCrypto Authors. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MevSandwichGuard,
  GuardCircuitState,
  RiskLevel,
} from './mev_slippage_guard.ts';
import type {
  PoolState,
  SwapOrder,
} from './mev_slippage_guard.ts';

describe('MEV Sandwich Attack & Slippage Tolerance Circuit Guard', () => {
  const nominalPool: PoolState = {
    reserve0: 1000000n * 10n ** 18n, // 1,000,000 Token0
    reserve1: 2000000n * 10n ** 18n, // 2,000,000 Token1 (spot = 2.0)
    twapPrice: 2.0,
    blockNumber: 19500000,
  };

  const nominalOrder: SwapOrder = {
    tokenIn: '0xTokenA',
    tokenOut: '0xTokenB',
    amountIn: 1000n * 10n ** 18n,
    amountOutMin: 1950n * 10n ** 18n,
    maxPriorityFeeGwei: 2.5,
    caller: '0xUser1',
  };

  it('approves nominal swap in NORMAL circuit state with safe default slippage', () => {
    const guard = new MevSandwichGuard();
    const evalResult = guard.evaluateSwap(nominalPool, nominalOrder);

    assert.equal(evalResult.state, GuardCircuitState.NORMAL);
    assert.equal(evalResult.riskLevel, RiskLevel.LOW);
    assert.equal(evalResult.allowed, true);
    assert.equal(evalResult.recommendedMaxSlippageBps, 50); // 0.50%
    assert.equal(evalResult.spotDivergencePercent, 0.0);
    assert.equal(evalResult.priorityFeeAnomaly, false);
  });

  it('rejects invalid pool states and orders defensively', () => {
    const guard = new MevSandwichGuard();

    assert.throws(
      () => guard.evaluateSwap(null as unknown as PoolState, nominalOrder),
      /TypeError/
    );

    const badPool: PoolState = { ...nominalPool, reserve0: 0n };
    assert.throws(() => guard.evaluateSwap(badPool, nominalOrder), /TypeError/);

    const zeroTwapPool: PoolState = { ...nominalPool, twapPrice: 0 };
    assert.throws(() => guard.evaluateSwap(zeroTwapPool, nominalOrder), /TypeError/);

    const badOrder: SwapOrder = { ...nominalOrder, amountIn: -50n };
    assert.throws(() => guard.evaluateSwap(nominalPool, badOrder), /TypeError/);
  });

  it('calculates dynamic slippage bounds inversely proportional to liquidity depth', () => {
    const guard = new MevSandwichGuard();

    const poolReserve = 1000000n;
    // Micro trade (0.01% of pool) -> 15 BPS
    assert.equal(guard.calculateDynamicSlippageBound(100n, poolReserve), 15);

    // Standard trade (0.5% of pool) -> 50 BPS
    assert.equal(guard.calculateDynamicSlippageBound(5000n, poolReserve), 50);

    // Heavy trade (1.5% of pool) -> clamped to 75 BPS
    assert.equal(guard.calculateDynamicSlippageBound(15000n, poolReserve), 75);
  });

  it('transitions to SUSPICIOUS on moderate spot-TWAP divergence and clamps slippage', () => {
    const guard = new MevSandwichGuard({
      spotTwapDeviationThresholdBps: 150, // 1.5%
      maxSuspiciousSlippageBps: 15,
    });

    // Spot = 2.04 vs TWAP 2.0 (2% divergence > 1.5% threshold)
    const deviatedPool: PoolState = {
      reserve0: 1000000n * 10n ** 18n,
      reserve1: 2040000n * 10n ** 18n,
      twapPrice: 2.0,
      blockNumber: 19500001,
    };

    const evalResult = guard.evaluateSwap(deviatedPool, nominalOrder);
    assert.equal(evalResult.state, GuardCircuitState.SUSPICIOUS);
    assert.equal(evalResult.riskLevel, RiskLevel.HIGH);
    assert.equal(evalResult.allowed, true);
    assert.equal(evalResult.recommendedMaxSlippageBps, 15); // Clamped to 0.15%
    assert.equal(evalResult.spotDivergencePercent, 2.0);
    assert.match(evalResult.reason, /ELEVATED_SPOT_DIVERGENCE/);
  });

  it('detects priority fee gas spikes and activates suspicious mitigation', () => {
    const guard = new MevSandwichGuard({ priorityFeeAnomalyThresholdGwei: 40.0 });

    const aggressiveGasOrder: SwapOrder = {
      ...nominalOrder,
      maxPriorityFeeGwei: 85.0, // High priority fee anomaly
    };

    const evalResult = guard.evaluateSwap(nominalPool, aggressiveGasOrder);
    assert.equal(evalResult.state, GuardCircuitState.SUSPICIOUS);
    assert.equal(evalResult.priorityFeeAnomaly, true);
    assert.equal(evalResult.recommendedMaxSlippageBps, 15);
  });

  it('detects mempool front-running sandwich signature and trips circuit breaker', () => {
    const guard = new MevSandwichGuard();

    const pendingFrontrunner: SwapOrder = {
      tokenIn: nominalOrder.tokenIn,
      tokenOut: nominalOrder.tokenOut,
      amountIn: 5000n * 10n ** 18n, // Substantial volume
      amountOutMin: 0n,
      maxPriorityFeeGwei: 15.0, // 6x user's priority fee
      caller: '0xAttackerMevBot',
    };

    const evalResult = guard.evaluateSwap(nominalPool, nominalOrder, [pendingFrontrunner]);
    assert.equal(evalResult.state, GuardCircuitState.CIRCUIT_TRIPPED);
    assert.equal(evalResult.riskLevel, RiskLevel.CRITICAL);
    assert.equal(evalResult.allowed, false);
    assert.match(evalResult.reason, /MEV_SANDWICH_SIGNATURE_DETECTED/);

    // Subsequent swap is immediately blocked by tripped circuit
    const subsequent = guard.evaluateSwap(nominalPool, nominalOrder);
    assert.equal(subsequent.allowed, false);
    assert.equal(subsequent.state, GuardCircuitState.CIRCUIT_TRIPPED);
  });

  it('trips circuit on critical spot-TWAP price manipulation (> 4%)', () => {
    const guard = new MevSandwichGuard({ criticalDeviationThresholdBps: 400 });

    // Spot = 2.10 vs TWAP 2.0 (5% divergence > 4% critical ceiling)
    const manipulatedPool: PoolState = {
      reserve0: 1000000n * 10n ** 18n,
      reserve1: 2100000n * 10n ** 18n,
      twapPrice: 2.0,
      blockNumber: 19500005,
    };

    const evalResult = guard.evaluateSwap(manipulatedPool, nominalOrder);
    assert.equal(evalResult.state, GuardCircuitState.CIRCUIT_TRIPPED);
    assert.equal(evalResult.allowed, false);
    assert.match(evalResult.reason, /CRITICAL_PRICE_MANIPULATION/);
  });

  it('supports manual circuit trip, reset, and incident logging', () => {
    const guard = new MevSandwichGuard();
    assert.equal(guard.getCircuitState(), GuardCircuitState.NORMAL);

    guard.tripCircuit('EMERGENCY_ADMIN_HALT');
    assert.equal(guard.getCircuitState(), GuardCircuitState.CIRCUIT_TRIPPED);

    const evalBlocked = guard.evaluateSwap(nominalPool, nominalOrder);
    assert.equal(evalBlocked.allowed, false);

    guard.resetCircuit();
    assert.equal(guard.getCircuitState(), GuardCircuitState.NORMAL);

    const evalAllowed = guard.evaluateSwap(nominalPool, nominalOrder);
    assert.equal(evalAllowed.allowed, true);

    const incidents = guard.getIncidentHistory();
    assert.equal(incidents.length, 1);
  });
});
