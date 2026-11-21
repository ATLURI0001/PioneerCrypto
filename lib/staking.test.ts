// Copyright (c) 2026 PioneerCrypto Contributors
// SPDX-License-Identifier: MIT
// Unit tests for StakingPool and Synthetix O(1) Scaled Reward Model.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { StakingPool, PRECISION_SCALE } from "./staking.ts";

describe("Synthetix O(1) Staking Pool Engine", () => {
  const ONE_TOKEN = PRECISION_SCALE; // 10^18

  test("should accrue rewards proportionally over time for single staker", () => {
    const t0 = 1000;
    const pool = new StakingPool({
      rewardRatePerSec: ONE_TOKEN, // 1 reward token per second
      poolDurationSec: 100,
      startTime: t0,
    });

    const user = "0x1111111111111111111111111111111111111111";
    pool.stake(user, 100n * ONE_TOKEN, t0);

    // 10 seconds elapse -> 10 reward tokens
    const earned10 = pool.earned(user, t0 + 10);
    assert.equal(earned10, 10n * ONE_TOKEN);

    // Claim reward at t0 + 10
    const claimed = pool.claimReward(user, t0 + 10);
    assert.equal(claimed, 10n * ONE_TOKEN);
    assert.equal(pool.earned(user, t0 + 10), 0n);
  });

  test("should split rewards proportionally between unequal stakers", () => {
    const t0 = 2000;
    const pool = new StakingPool({
      rewardRatePerSec: 2n * ONE_TOKEN, // 2 reward tokens per second
      poolDurationSec: 100,
      startTime: t0,
    });

    const alice = "0xAlice00000000000000000000000000000000000";
    const bob = "0xBob0000000000000000000000000000000000000";

    // Alice stakes 100 at t0
    pool.stake(alice, 100n * ONE_TOKEN, t0);

    // 10 seconds pass: Alice alone earns 10 * 2 = 20 tokens
    // At t0 + 10, Bob stakes 300 (total pool is now 400, Alice has 25%, Bob has 75%)
    pool.stake(bob, 300n * ONE_TOKEN, t0 + 10);

    // Another 10 seconds pass (t0 + 20): total new rewards = 10 * 2 = 20 tokens
    // Alice gets 25% of 20 = 5 tokens -> total Alice = 20 + 5 = 25 tokens
    // Bob gets 75% of 20 = 15 tokens -> total Bob = 15 tokens
    const aliceEarned = pool.earned(alice, t0 + 20);
    const bobEarned = pool.earned(bob, t0 + 20);

    assert.equal(aliceEarned, 25n * ONE_TOKEN);
    assert.equal(bobEarned, 15n * ONE_TOKEN);
  });

  test("should stop accruing rewards once poolDurationSec is reached", () => {
    const t0 = 3000;
    const pool = new StakingPool({
      rewardRatePerSec: ONE_TOKEN,
      poolDurationSec: 50,
      startTime: t0,
    });

    const user = "0xUser00000000000000000000000000000000000";
    pool.stake(user, 10n * ONE_TOKEN, t0);

    // Check at 100 seconds (50 seconds past duration finish) -> should cap at 50 tokens
    const earned = pool.earned(user, t0 + 100);
    assert.equal(earned, 50n * ONE_TOKEN);
  });

  test("should allow partial withdrawals and maintain correct remaining share", () => {
    const t0 = 4000;
    const pool = new StakingPool({
      rewardRatePerSec: ONE_TOKEN,
      poolDurationSec: 100,
      startTime: t0,
    });

    const user = "0xStaker000000000000000000000000000000000";
    pool.stake(user, 50n * ONE_TOKEN, t0);

    // Withdraw 20 at t0 + 10
    pool.withdraw(user, 20n * ONE_TOKEN, t0 + 10);
    assert.equal(pool.totalStaked, 30n * ONE_TOKEN);

    // Still has 10 tokens earned from the first 10s
    assert.equal(pool.earned(user, t0 + 10), 10n * ONE_TOKEN);
  });

  test("should compute annualized percentage rate (APR) accurately", () => {
    const rewardRate = ONE_TOKEN; // 1 reward token / sec = 31,536,000 tokens / year
    const totalStaked = 1000n * ONE_TOKEN; // 1,000 stake tokens
    // Both tokens $1.00 USD
    // APR = (31,536,000 * 1) / (1,000 * 1) * 100 = 3,153,600%
    const apr = StakingPool.calculateApr(rewardRate, totalStaked, 1.0, 1.0);
    assert.equal(apr, 3153600);
  });

  test("should reject non-positive amounts and insufficient balances defensively", () => {
    const pool = new StakingPool({
      rewardRatePerSec: ONE_TOKEN,
      poolDurationSec: 100,
      startTime: 1000,
    });

    assert.throws(() => pool.stake("0xUser", 0n, 1000), /non-positive/);
    assert.throws(() => pool.withdraw("0xUser", 10n, 1000), /Insufficient/);
  });
});
