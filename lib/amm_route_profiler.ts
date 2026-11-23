/**
 * @file amm_route_profiler.ts
 * High-performance constant-product multi-hop swap route optimizer and benchmark profiler.
 */

export interface LiquidityPool {
  id: string;
  token0: string;
  token1: string;
  reserve0: bigint;
  reserve1: bigint;
  feeBasisPoints: bigint; // e.g., 30n for 0.3%
}

export interface HopStep {
  pool: LiquidityPool;
  tokenIn: string;
  tokenOut: string;
}

export interface RouteQuote {
  routeId: string;
  hops: HopStep[];
  amountIn: bigint;
  amountOut: bigint;
  netPriceImpactBps: number;
  executionFeeAmount: bigint;
}

export interface RouteBenchmarkProfile {
  totalRoutesEvaluated: number;
  iterations: number;
  totalDurationMs: number;
  meanLatencyUs: number;
  p50LatencyUs: number;
  p90LatencyUs: number;
  p99LatencyUs: number;
  throughputOpsSec: number;
  bestRouteId: string;
  maxOutputAmount: bigint;
}

/**
 * Calculates swap output for a single pool hop using constant-product x * y = k invariant.
 * Formula: amountOut = (reserveOut * amountInWithFee) / (reserveIn * 10000 + amountInWithFee)
 */
export function calculateHopOutput(
  pool: LiquidityPool,
  tokenIn: string,
  amountIn: bigint
): { amountOut: bigint; feeAmount: bigint; priceImpactBps: number } {
  if (amountIn <= 0n) {
    throw new RangeError('Swap amountIn must be strictly positive');
  }

  const isToken0In = tokenIn === pool.token0;
  if (!isToken0In && tokenIn !== pool.token1) {
    throw new TypeError(`Token ${tokenIn} does not belong to pool ${pool.id}`);
  }

  const reserveIn = isToken0In ? pool.reserve0 : pool.reserve1;
  const reserveOut = isToken0In ? pool.reserve1 : pool.reserve0;

  if (reserveIn <= 0n || reserveOut <= 0n) {
    throw new RangeError(`Pool ${pool.id} has insufficient reserves`);
  }

  const feeBps = pool.feeBasisPoints > 0n ? pool.feeBasisPoints : 30n;
  const feeMultiplier = 10000n - feeBps;
  const amountInWithFee = amountIn * feeMultiplier;
  const feeAmount = (amountIn * feeBps) / 10000n;

  const numerator = amountInWithFee * reserveOut;
  const denominator = (reserveIn * 10000n) + amountInWithFee;
  const amountOut = numerator / denominator;

  // Price impact calculation in basis points: ((idealOut - actualOut) / idealOut) * 10000
  // idealOut = (amountIn * reserveOut) / reserveIn
  const idealOutNumerator = amountIn * reserveOut;
  const idealOut = idealOutNumerator / reserveIn;

  let priceImpactBps = 0;
  if (idealOut > 0n && idealOut > amountOut) {
    const diff = idealOut - amountOut;
    priceImpactBps = Number((diff * 10000n) / idealOut);
  }

  return { amountOut, feeAmount, priceImpactBps };
}

/**
 * Evaluates an entire multi-hop route and returns the net quote.
 */
export function simulateMultiHopRoute(
  routeId: string,
  hops: HopStep[],
  initialAmountIn: bigint
): RouteQuote {
  if (!hops || hops.length === 0) {
    throw new RangeError('Route must contain at least one hop step');
  }

  let currentAmount = initialAmountIn;
  let totalFee = 0n;
  let accumulatedPriceImpact = 0;

  for (let i = 0; i < hops.length; i++) {
    const hop = hops[i];
    const { amountOut, feeAmount, priceImpactBps } = calculateHopOutput(
      hop.pool,
      hop.tokenIn,
      currentAmount
    );

    totalFee += feeAmount;
    accumulatedPriceImpact += priceImpactBps;
    currentAmount = amountOut;
  }

  return {
    routeId,
    hops,
    amountIn: initialAmountIn,
    amountOut: currentAmount,
    netPriceImpactBps: accumulatedPriceImpact,
    executionFeeAmount: totalFee,
  };
}

/**
 * High-performance route selector that identifies the optimal multi-hop path.
 */
export function findBestRoute(
  candidateRoutes: { routeId: string; hops: HopStep[] }[],
  amountIn: bigint
): RouteQuote | null {
  if (!candidateRoutes || candidateRoutes.length === 0) {
    return null;
  }

  let bestQuote: RouteQuote | null = null;

  for (let i = 0; i < candidateRoutes.length; i++) {
    const candidate = candidateRoutes[i];
    try {
      const quote = simulateMultiHopRoute(candidate.routeId, candidate.hops, amountIn);
      if (!bestQuote || quote.amountOut > bestQuote.amountOut) {
        bestQuote = quote;
      }
    } catch {
      // Skip invalid or drained pool routes
    }
  }

  return bestQuote;
}

/**
 * Benchmarks and profiles multi-hop route evaluation across iterations.
 */
export function benchmarkRouteExecution(
  candidateRoutes: { routeId: string; hops: HopStep[] }[],
  amountIn: bigint,
  iterations: number = 1000
): RouteBenchmarkProfile {
  if (iterations <= 0) {
    throw new RangeError('Benchmark iterations must be greater than zero');
  }

  const latenciesUs: number[] = new Array(iterations);
  let bestRoute: RouteQuote | null = null;

  const tStart = performance.now();

  for (let iter = 0; iter < iterations; iter++) {
    const t0 = performance.now();
    const result = findBestRoute(candidateRoutes, amountIn);
    const t1 = performance.now();

    latenciesUs[iter] = (t1 - t0) * 1000; // in microseconds
    if (result && (!bestRoute || result.amountOut > bestRoute.amountOut)) {
      bestRoute = result;
    }
  }

  const tEnd = performance.now();
  const totalDurationMs = tEnd - tStart;

  latenciesUs.sort((a, b) => a - b);
  const sumUs = latenciesUs.reduce((acc, v) => acc + v, 0);
  const meanLatencyUs = Number((sumUs / iterations).toFixed(2));
  const p50LatencyUs = Number(latenciesUs[Math.floor(iterations * 0.50)].toFixed(2));
  const p90LatencyUs = Number(latenciesUs[Math.floor(iterations * 0.90)].toFixed(2));
  const p99LatencyUs = Number(latenciesUs[Math.floor(iterations * 0.99)].toFixed(2));

  const throughputOpsSec = totalDurationMs > 0
    ? Math.round((iterations * 1000) / totalDurationMs)
    : 0;

  return {
    totalRoutesEvaluated: candidateRoutes.length * iterations,
    iterations,
    totalDurationMs: Number(totalDurationMs.toFixed(2)),
    meanLatencyUs,
    p50LatencyUs,
    p90LatencyUs,
    p99LatencyUs,
    throughputOpsSec,
    bestRouteId: bestRoute?.routeId || '',
    maxOutputAmount: bestRoute?.amountOut || 0n,
  };
}
