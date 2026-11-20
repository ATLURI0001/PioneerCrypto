// Copyright 2026 PioneerCrypto Authors. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Constant-Product AMM (Automated Market Maker) Invariant & Slippage Engine.
// Models Uniswap v2 invariant x * y = k with exact fee accounting, LP share issuance,
// and price impact protection.

export const MINIMUM_LIQUIDITY = 1000n;
export const FEE_NUMERATOR = 997n;
export const FEE_DENOMINATOR = 1000n;

export interface PoolReserves {
  reserve0: bigint;
  reserve1: bigint;
  totalLiquidity: bigint;
}

export interface SwapQuote {
  amountIn: bigint;
  amountOut: bigint;
  newReserve0: bigint;
  newReserve1: bigint;
  executionPrice: number;
  marginalPrice: number;
  priceImpactPercent: number;
}

export interface LiquidityMintResult {
  liquidityMinted: bigint;
  newReserve0: bigint;
  newReserve1: bigint;
  newTotalLiquidity: bigint;
}

export interface LiquidityBurnResult {
  amount0Out: bigint;
  amount1Out: bigint;
  newReserve0: bigint;
  newReserve1: bigint;
  newTotalLiquidity: bigint;
}

/**
 * Computes integer square root using Newton's method for bigints.
 */
export function sqrtBigInt(y: bigint): bigint {
  if (y < 0n) {
    throw new RangeError('Square root of negative bigint is undefined');
  }
  if (y === 0n) return 0n;
  if (y <= 3n) return 1n;

  let z = y;
  let x = y / 2n + 1n;
  while (x < z) {
    z = x;
    x = (y / x + x) / 2n;
  }
  return z;
}

/**
 * Calculate amountOut for an exact amountIn swap under constant product curve (x * y = k) with 0.3% fee.
 *
 * Formula:
 *   amountOut = (reserveOut * amountIn * 997) / (reserveIn * 1000 + amountIn * 997)
 */
export function getAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): SwapQuote {
  if (amountIn <= 0n) {
    throw new RangeError('amountIn must be strictly positive');
  }
  if (reserveIn <= 0n || reserveOut <= 0n) {
    throw new RangeError('Pool reserves must be strictly positive');
  }

  const amountInWithFee = amountIn * FEE_NUMERATOR;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * FEE_DENOMINATOR + amountInWithFee;

  const amountOut = numerator / denominator;
  if (amountOut <= 0n) {
    throw new RangeError('Calculated amountOut is zero (insufficient amountIn)');
  }

  const newReserveIn = reserveIn + amountIn;
  const newReserveOut = reserveOut - amountOut;

  // Pricing & Price Impact
  const marginalPrice = Number(reserveOut) / Number(reserveIn);
  const executionPrice = Number(amountOut) / Number(amountIn);
  const priceImpactPercent = Math.max(0, (1.0 - executionPrice / marginalPrice) * 100.0);

  return {
    amountIn,
    amountOut,
    newReserve0: newReserveIn,
    newReserve1: newReserveOut,
    executionPrice,
    marginalPrice,
    priceImpactPercent,
  };
}

/**
 * Validates maximum allowable slippage in basis points (1 bps = 0.01%).
 */
export function checkSlippage(amountOut: bigint, minAmountOut: bigint): boolean {
  if (minAmountOut <= 0n) {
    throw new RangeError('minAmountOut must be positive');
  }
  return amountOut >= minAmountOut;
}

/**
 * Calculate LP tokens minted when adding liquidity to the pool.
 */
export function mintLiquidity(
  amount0: bigint,
  amount1: bigint,
  pool: PoolReserves
): LiquidityMintResult {
  if (amount0 <= 0n || amount1 <= 0n) {
    throw new RangeError('Deposited amounts must be strictly positive');
  }

  let liquidity: bigint;

  if (pool.totalLiquidity === 0n) {
    // Initial liquidity provider: L = sqrt(x * y) - MINIMUM_LIQUIDITY
    const product = amount0 * amount1;
    const initialLiq = sqrtBigInt(product);
    if (initialLiq <= MINIMUM_LIQUIDITY) {
      throw new RangeError('Initial liquidity deposit too small (must exceed MINIMUM_LIQUIDITY 1000)');
    }
    liquidity = initialLiq - MINIMUM_LIQUIDITY;
    return {
      liquidityMinted: liquidity,
      newReserve0: amount0,
      newReserve1: amount1,
      newTotalLiquidity: initialLiq, // Total includes the 1000 locked to dead address
    };
  }

  // Subsequent provider: L = min(amount0/reserve0 * L_total, amount1/reserve1 * L_total)
  const liq0 = (amount0 * pool.totalLiquidity) / pool.reserve0;
  const liq1 = (amount1 * pool.totalLiquidity) / pool.reserve1;
  liquidity = liq0 < liq1 ? liq0 : liq1;

  if (liquidity <= 0n) {
    throw new RangeError('Calculated minted liquidity shares are zero');
  }

  return {
    liquidityMinted: liquidity,
    newReserve0: pool.reserve0 + amount0,
    newReserve1: pool.reserve1 + amount1,
    newTotalLiquidity: pool.totalLiquidity + liquidity,
  };
}

/**
 * Calculate token amounts returned when burning LP tokens.
 */
export function burnLiquidity(
  liquidityBurn: bigint,
  pool: PoolReserves
): LiquidityBurnResult {
  if (liquidityBurn <= 0n) {
    throw new RangeError('liquidityBurn must be positive');
  }
  if (pool.totalLiquidity <= 0n || liquidityBurn > pool.totalLiquidity) {
    throw new RangeError('Cannot burn more liquidity than total pool supply');
  }

  const amount0Out = (liquidityBurn * pool.reserve0) / pool.totalLiquidity;
  const amount1Out = (liquidityBurn * pool.reserve1) / pool.totalLiquidity;

  return {
    amount0Out,
    amount1Out,
    newReserve0: pool.reserve0 - amount0Out,
    newReserve1: pool.reserve1 - amount1Out,
    newTotalLiquidity: pool.totalLiquidity - liquidityBurn,
  };
}
