import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHopOutput,
  simulateMultiHopRoute,
  findBestRoute,
  benchmarkRouteExecution,
} from './amm_route_profiler.ts';
import type { LiquidityPool } from './amm_route_profiler.ts';

describe('AmmRouteOptimizer & Benchmark Profiler Suite', () => {
  const poolUsdcEth: LiquidityPool = {
    id: 'usdc-eth-pool',
    token0: 'USDC',
    token1: 'ETH',
    reserve0: 10_000_000n * 1_000_000n,       // 10M USDC (6 decimals)
    reserve1: 3_333n * 1_000_000_000_000_000_000n, // ~3,333 ETH (18 decimals) ($3,000/ETH)
    feeBasisPoints: 30n,
  };

  const poolEthWbtc: LiquidityPool = {
    id: 'eth-wbtc-pool',
    token0: 'ETH',
    token1: 'WBTC',
    reserve0: 3_000n * 1_000_000_000_000_000_000n, // 3,000 ETH
    reserve1: 100n * 100_000_000n,                 // 100 WBTC (8 decimals) (~30 ETH/BTC)
    feeBasisPoints: 30n,
  };

  const poolUsdcWbtcDirect: LiquidityPool = {
    id: 'usdc-wbtc-direct-pool',
    token0: 'USDC',
    token1: 'WBTC',
    reserve0: 5_000_000n * 1_000_000n, // Lower liquidity direct pool (5M USDC)
    reserve1: 50n * 100_000_000n,      // 50 WBTC
    feeBasisPoints: 30n,
  };

  it('calculates single-hop swap with accurate fee and constant-product invariant', () => {
    const amountIn = 3_000n * 1_000_000n; // 3,000 USDC
    const { amountOut, feeAmount, priceImpactBps } = calculateHopOutput(
      poolUsdcEth,
      'USDC',
      amountIn
    );

    assert.ok(amountOut > 0n);
    assert.equal(feeAmount, (amountIn * 30n) / 10000n);
    assert.ok(priceImpactBps >= 0 && priceImpactBps < 100); // minimal impact on 10M pool
  });

  it('rejects invalid inputs defensively', () => {
    assert.throws(
      () => calculateHopOutput(poolUsdcEth, 'USDC', 0n),
      /strictly positive/
    );
    assert.throws(
      () => calculateHopOutput(poolUsdcEth, 'DOGE', 100n),
      /does not belong to pool/
    );
  });

  it('simulates 2-hop multi-hop route correctly (USDC -> ETH -> WBTC)', () => {
    const amountIn = 10_000n * 1_000_000n; // 10,000 USDC
    const hops = [
      { pool: poolUsdcEth, tokenIn: 'USDC', tokenOut: 'ETH' },
      { pool: poolEthWbtc, tokenIn: 'ETH', tokenOut: 'WBTC' },
    ];

    const quote = simulateMultiHopRoute('route-usdc-eth-wbtc', hops, amountIn);
    assert.equal(quote.routeId, 'route-usdc-eth-wbtc');
    assert.equal(quote.hops.length, 2);
    assert.ok(quote.amountOut > 0n);
    assert.ok(quote.executionFeeAmount > 0n);
  });

  it('finds best route maximizing output between direct pool and 2-hop path', () => {
    const amountIn = 50_000n * 1_000_000n; // 50,000 USDC
    const candidateRoutes = [
      {
        routeId: 'direct-path',
        hops: [{ pool: poolUsdcWbtcDirect, tokenIn: 'USDC', tokenOut: 'WBTC' }],
      },
      {
        routeId: 'two-hop-deep-liquidity',
        hops: [
          { pool: poolUsdcEth, tokenIn: 'USDC', tokenOut: 'ETH' },
          { pool: poolEthWbtc, tokenIn: 'ETH', tokenOut: 'WBTC' },
        ],
      },
    ];

    const best = findBestRoute(candidateRoutes, amountIn);
    assert.ok(best !== null);
    assert.ok(best.amountOut > 0n);
    // Two-hop deep liquidity pool should yield higher output due to lower price impact
    assert.equal(best.routeId, 'two-hop-deep-liquidity');
  });

  it('profiles route execution and calculates latency percentiles and throughput', () => {
    const candidateRoutes = [
      {
        routeId: 'route-a',
        hops: [{ pool: poolUsdcWbtcDirect, tokenIn: 'USDC', tokenOut: 'WBTC' }],
      },
      {
        routeId: 'route-b',
        hops: [
          { pool: poolUsdcEth, tokenIn: 'USDC', tokenOut: 'ETH' },
          { pool: poolEthWbtc, tokenIn: 'ETH', tokenOut: 'WBTC' },
        ],
      },
    ];

    const profile = benchmarkRouteExecution(candidateRoutes, 1_000n * 1_000_000n, 500);

    assert.equal(profile.iterations, 500);
    assert.equal(profile.totalRoutesEvaluated, 1000);
    assert.ok(profile.meanLatencyUs >= 0);
    assert.ok(profile.p50LatencyUs >= 0);
    assert.ok(profile.p90LatencyUs >= profile.p50LatencyUs);
    assert.ok(profile.p99LatencyUs >= profile.p90LatencyUs);
    assert.ok(profile.throughputOpsSec > 0);
    assert.equal(profile.bestRouteId, 'route-b');
  });
});
