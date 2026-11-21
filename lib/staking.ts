// Copyright (c) 2026 PioneerCrypto Contributors
// SPDX-License-Identifier: MIT
// Scaled Reward-Per-Token Staking Pool Engine & Synthetix O(1) Distribution Model.

export const PRECISION_SCALE = 10n ** 18n;

export interface StakeAccount {
  balance: bigint;
  userRewardPerTokenPaid: bigint;
  rewards: bigint;
  lastStakeTimestamp: number;
}

export interface StakingPoolConfig {
  rewardRatePerSec: bigint; // Tokens distributed per second in wei (10^18)
  poolDurationSec: number;
  startTime: number;
}

export class StakingPool {
  public totalStaked: bigint = 0n;
  public rewardPerTokenStored: bigint = 0n;
  public lastUpdateTime: number;
  public periodFinish: number;
  public rewardRate: bigint;
  public accounts: Map<string, StakeAccount> = new Map();

  constructor(config: StakingPoolConfig) {
    if (config.rewardRatePerSec < 0n) {
      throw new Error("rewardRatePerSec must be non-negative");
    }
    if (config.poolDurationSec <= 0) {
      throw new Error("poolDurationSec must be positive");
    }

    this.rewardRate = config.rewardRatePerSec;
    this.lastUpdateTime = config.startTime;
    this.periodFinish = config.startTime + config.poolDurationSec;
  }

  public lastTimeRewardApplicable(now: number): number {
    return Math.min(now, this.periodFinish);
  }

  /**
   * Computes current accumulated reward per staked token (scaled by 10^18).
   */
  public rewardPerToken(now: number): bigint {
    if (this.totalStaked === 0n) {
      return this.rewardPerTokenStored;
    }

    const applicableTime = this.lastTimeRewardApplicable(now);
    if (applicableTime <= this.lastUpdateTime) {
      return this.rewardPerTokenStored;
    }

    const elapsedSec = BigInt(applicableTime - this.lastUpdateTime);
    const addedReward = (elapsedSec * this.rewardRate * PRECISION_SCALE) / this.totalStaked;
    return this.rewardPerTokenStored + addedReward;
  }

  /**
   * Updates pool accumulator and account reward balances up to timestamp `now`.
   */
  public updateReward(accountAddr: string, now: number): void {
    this.rewardPerTokenStored = this.rewardPerToken(now);
    this.lastUpdateTime = this.lastTimeRewardApplicable(now);

    if (accountAddr) {
      const acc = this._getOrCreateAccount(accountAddr);
      acc.rewards = this.earned(accountAddr, now);
      acc.userRewardPerTokenPaid = this.rewardPerTokenStored;
    }
  }

  /**
   * Calculates earned but unclaimed reward tokens for an account.
   */
  public earned(accountAddr: string, now: number): bigint {
    const acc = this._getOrCreateAccount(accountAddr);
    const currentRpt = this.rewardPerToken(now);
    const deltaRpt = currentRpt - acc.userRewardPerTokenPaid;
    const pending = (acc.balance * deltaRpt) / PRECISION_SCALE;
    return acc.rewards + pending;
  }

  /**
   * Deposits stake tokens into the pool.
   */
  public stake(accountAddr: string, amount: bigint, now: number): void {
    if (!accountAddr || typeof accountAddr !== "string") {
      throw new Error("Invalid account address");
    }
    if (amount <= 0n) {
      throw new Error("Cannot stake non-positive amount");
    }

    this.updateReward(accountAddr, now);

    const acc = this._getOrCreateAccount(accountAddr);
    acc.balance += amount;
    acc.lastStakeTimestamp = now;
    this.totalStaked += amount;
  }

  /**
   * Withdraws staked tokens from the pool.
   */
  public withdraw(accountAddr: string, amount: bigint, now: number): void {
    if (!accountAddr || typeof accountAddr !== "string") {
      throw new Error("Invalid account address");
    }
    if (amount <= 0n) {
      throw new Error("Cannot withdraw non-positive amount");
    }

    const acc = this._getOrCreateAccount(accountAddr);
    if (acc.balance < amount) {
      throw new Error(`Insufficient staked balance: available ${acc.balance}, requested ${amount}`);
    }

    this.updateReward(accountAddr, now);

    acc.balance -= amount;
    this.totalStaked -= amount;
  }

  /**
   * Claims and resets accumulated reward tokens for an account.
   */
  public claimReward(accountAddr: string, now: number): bigint {
    this.updateReward(accountAddr, now);

    const acc = this._getOrCreateAccount(accountAddr);
    const payout = acc.rewards;
    acc.rewards = 0n;
    return payout;
  }

  /**
   * Computes annualized percentage rate (APR) in percentage basis points.
   */
  public static calculateApr(
    rewardRatePerSec: bigint,
    totalStaked: bigint,
    rewardTokenPriceUsd: number,
    stakeTokenPriceUsd: number
  ): number {
    if (totalStaked <= 0n || stakeTokenPriceUsd <= 0 || rewardTokenPriceUsd <= 0) {
      return 0.0;
    }

    const secondsPerYear = 31536000n; // 365 days
    const annualRewardTokens = Number(rewardRatePerSec * secondsPerYear) / 1e18;
    const totalStakedTokens = Number(totalStaked) / 1e18;

    const annualRewardUsd = annualRewardTokens * rewardTokenPriceUsd;
    const totalStakedUsd = totalStakedTokens * stakeTokenPriceUsd;

    const apr = (annualRewardUsd / totalStakedUsd) * 100.0;
    return Math.round(apr * 100) / 100;
  }

  private _getOrCreateAccount(addr: string): StakeAccount {
    let acc = this.accounts.get(addr);
    if (!acc) {
      acc = {
        balance: 0n,
        userRewardPerTokenPaid: 0n,
        rewards: 0n,
        lastStakeTimestamp: 0,
      };
      this.accounts.set(addr, acc);
    }
    return acc;
  }
}
