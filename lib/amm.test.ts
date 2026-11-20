import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  FEE_DENOMINATOR,
  FEE_NUMERATOR,
  MINIMUM_LIQUIDITY,
  burnLiquidity,
  checkSlippage,
  getAmountOut,
  mintLiquidity,
  sqrtBigInt,
} from './amm.ts';

describe('Constant-Product AMM & Invariant Engine', () => {
  test('sqrtBigInt computes integer square root accurately', () => {
    assert.equal(sqrtBigInt(0n), 0n);
    assert.equal(sqrtBigInt(1n), 1n);
    assert.equal(sqrtBigInt(4n), 2n);
    assert.equal(sqrtBigInt(9n), 3n);
    assert.equal(sqrtBigInt(100n), 10n);
    assert.equal(sqrtBigInt(1000000000000n), 1000000n);
    assert.throws(() => sqrtBigInt(-5n), RangeError);
  });

  test('getAmountOut computes exact output with 0.3% fee and models price impact', () => {
    const reserveIn = 1_000_000n;
    const reserveOut = 1_000_000n;
    const amountIn = 10_000n;

    const quote = getAmountOut(amountIn, reserveIn, reserveOut);

    // Exact expected: (10,000 * 997 * 1,000,000) / (1,000,000 * 1000 + 10,000 * 997) = 9,871n
    assert.equal(quote.amountOut, 9871n);
    assert.equal(quote.newReserve0, 1_010_000n);
    assert.equal(quote.newReserve1, 990_129n);

    // Marginal price before swap is 1.0 (reserveOut / reserveIn)
    assert.equal(quote.marginalPrice, 1.0);
    // Execution price is 9871 / 10000 = 0.9871
    assert.ok(Math.abs(quote.executionPrice - 0.9871) < 1e-4);
    // Price impact is (1 - 0.9871) * 100% ~ 1.29%
    assert.ok(quote.priceImpactPercent > 1.2 && quote.priceImpactPercent < 1.4);
  });

  test('checkSlippage enforces minimum output constraints', () => {
    const amountOut = 9871n;
    assert.equal(checkSlippage(amountOut, 9800n), true);
    assert.equal(checkSlippage(amountOut, 9871n), true);
    assert.equal(checkSlippage(amountOut, 9900n), false);
    assert.throws(() => checkSlippage(amountOut, 0n), RangeError);
  });

  test('mintLiquidity handles initial liquidity lock and proportional subsequent shares', () => {
    // Initial deposit: 1,000,000 of Token0 and 1,000,000 of Token1
    // sqrt(10^12) = 1,000,000. 1000 locked -> 999,000 minted.
    const initialPool = { reserve0: 0n, reserve1: 0n, totalLiquidity: 0n };
    const initRes = mintLiquidity(1_000_000n, 1_000_000n, initialPool);

    assert.equal(initRes.liquidityMinted, 999_000n);
    assert.equal(initRes.newTotalLiquidity, 1_000_000n);
    assert.equal(initRes.newReserve0, 1_000_000n);
    assert.equal(initRes.newReserve1, 1_000_000n);

    // Subsequent deposit: 500,000 and 500,000 (50% increase)
    const activePool = {
      reserve0: initRes.newReserve0,
      reserve1: initRes.newReserve1,
      totalLiquidity: initRes.newTotalLiquidity,
    };
    const subRes = mintLiquidity(500_000n, 500_000n, activePool);

    assert.equal(subRes.liquidityMinted, 500_000n);
    assert.equal(subRes.newTotalLiquidity, 1_500_000n);
  });

  test('burnLiquidity returns exact proportional asset amounts', () => {
    const pool = {
      reserve0: 1_500_000n,
      reserve1: 1_500_000n,
      totalLiquidity: 1_500_000n,
    };

    // Burn 500,000 LP tokens (1/3 of pool)
    const burnRes = burnLiquidity(500_000n, pool);
    assert.equal(burnRes.amount0Out, 500_000n);
    assert.equal(burnRes.amount1Out, 500_000n);
    assert.equal(burnRes.newReserve0, 1_000_000n);
    assert.equal(burnRes.newReserve1, 1_000_000n);
    assert.equal(burnRes.newTotalLiquidity, 1_000_000n);

    assert.throws(() => burnLiquidity(2_000_000n, pool), RangeError);
  });
});
