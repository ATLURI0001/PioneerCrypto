/**
 * PioneerCrypto - Reentrancy Guard & Flash Loan Mitigation Circuit
 *
 * Implements EVM-grade nonReentrant mutex locking, flash loan fee and balance invariants,
 * same-block transaction cooldowns, and TWAP oracle manipulation defenses.
 */

export class ReentrancyGuardError extends Error {
  constructor(message: string = 'ReentrancyGuard: reentrant call detected') {
    super(message);
    this.name = 'ReentrancyGuardError';
  }
}

export class FlashLoanMitigationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlashLoanMitigationError';
  }
}

export interface FlashLoanConfig {
  feeBps: number; // e.g. 9 for 0.09%
  maxBorrowFraction: number; // e.g. 0.25 (max 25% of pool reserve)
  maxPriceDeviationBps: number; // e.g. 300 for 3% deviation between spot and TWAP
  sameBlockActionLock: boolean; // Prevent borrow and liquidate/vote in same block
}

export const DEFAULT_FLASH_LOAN_CONFIG: FlashLoanConfig = {
  feeBps: 9, // 0.09% fee
  maxBorrowFraction: 0.25,
  maxPriceDeviationBps: 300, // 3%
  sameBlockActionLock: true,
};

export class ReentrancyGuard {
  private _locked: boolean = false;
  private _invocationCount: number = 0;
  private _interceptions: number = 0;

  /**
   * Returns true if mutex is currently held
   */
  public get isLocked(): boolean {
    return this._locked;
  }

  /**
   * Executes an asynchronous routine guarded by non-reentrant mutex lock
   */
  public async nonReentrant<T>(fn: () => Promise<T>): Promise<T> {
    if (this._locked) {
      this._interceptions++;
      throw new ReentrancyGuardError();
    }

    this._locked = true;
    this._invocationCount++;

    try {
      return await fn();
    } finally {
      this._locked = false;
    }
  }

  public getTelemetry() {
    return {
      invocationCount: this._invocationCount,
      interceptions: this._interceptions,
    };
  }

  public resetTelemetry() {
    this._invocationCount = 0;
    this._interceptions = 0;
  }
}

export interface PoolReserves {
  reserveA: bigint;
  reserveB: bigint;
}

export class FlashLoanMitigationCircuit {
  private config: FlashLoanConfig;
  private guard: ReentrancyGuard;
  private userLastBlockAction: Map<string, number> = new Map();
  private totalLoansVolume: bigint = 0n;
  private totalFeesCollected: bigint = 0n;
  private blockedAttacksCount: number = 0;

  constructor(config: Partial<FlashLoanConfig> = {}) {
    this.config = { ...DEFAULT_FLASH_LOAN_CONFIG, ...config };
    this.guard = new ReentrancyGuard();
  }

  /**
   * Calculates required fee for a given borrow amount
   */
  public calculateFee(amount: bigint): bigint {
    if (amount <= 0n) return 0n;
    return (amount * BigInt(this.config.feeBps)) / 10000n;
  }

  /**
   * Validates spot price against TWAP to mitigate price oracle manipulation
   */
  public validateOracleDeviation(spotPrice: number, twapPrice: number): boolean {
    if (spotPrice <= 0 || twapPrice <= 0) {
      throw new FlashLoanMitigationError('Oracle prices must be strictly positive');
    }

    const diff = Math.abs(spotPrice - twapPrice);
    const deviationBps = (diff / twapPrice) * 10000;

    if (deviationBps > this.config.maxPriceDeviationBps) {
      this.blockedAttacksCount++;
      throw new FlashLoanMitigationError(
        `Oracle price deviation breach: ${deviationBps.toFixed(1)} bps exceeds maximum permitted ${this.config.maxPriceDeviationBps} bps`
      );
    }

    return true;
  }

  /**
   * Verifies same-block interaction cooldown to prevent flash loan governance/arbitrage exploits
   */
  public checkSameBlockAction(caller: string, currentBlock: number): void {
    if (!this.config.sameBlockActionLock) return;

    const normalizedCaller = caller.toLowerCase();
    const lastBlock = this.userLastBlockAction.get(normalizedCaller);

    if (lastBlock !== undefined && lastBlock === currentBlock) {
      this.blockedAttacksCount++;
      throw new FlashLoanMitigationError(
        `Flash loan cooldown: address ${caller} already executed a critical action in block ${currentBlock}`
      );
    }

    this.userLastBlockAction.set(normalizedCaller, currentBlock);
  }

  /**
   * Executes a protected flash loan with reentrancy lock, liquidity capacity check,
   * caller callback, and post-execution balance invariant assertion.
   */
  public async executeFlashLoan(
    caller: string,
    borrowAmount: bigint,
    poolReserve: bigint,
    currentBlock: number,
    receiverCallback: (borrowed: bigint, fee: bigint) => Promise<bigint>
  ): Promise<{ returnedAmount: bigint; fee: bigint }> {
    return await this.guard.nonReentrant(async () => {
      if (borrowAmount <= 0n) {
        throw new FlashLoanMitigationError('Borrow amount must be greater than zero');
      }

      if (poolReserve <= 0n) {
        throw new FlashLoanMitigationError('Pool reserve must be greater than zero');
      }

      // Check max borrow fraction limit
      const maxBorrow = (poolReserve * BigInt(Math.floor(this.config.maxBorrowFraction * 10000))) / 10000n;
      if (borrowAmount > maxBorrow) {
        this.blockedAttacksCount++;
        throw new FlashLoanMitigationError(
          `Borrow amount ${borrowAmount.toString()} exceeds pool capacity limit ${maxBorrow.toString()}`
        );
      }

      // Enforce block cooldown
      this.checkSameBlockAction(caller, currentBlock);

      const fee = this.calculateFee(borrowAmount);
      const requiredRepayment = borrowAmount + fee;

      // Execute borrower logic
      const returnedAmount = await receiverCallback(borrowAmount, fee);

      // Invariant check: caller must return at least borrowAmount + fee
      if (returnedAmount < requiredRepayment) {
        this.blockedAttacksCount++;
        throw new FlashLoanMitigationError(
          `Flash loan invariant failed: returned ${returnedAmount.toString()}, required minimum ${requiredRepayment.toString()}`
        );
      }

      this.totalLoansVolume += borrowAmount;
      this.totalFeesCollected += fee;

      return {
        returnedAmount,
        fee,
      };
    });
  }

  public getTelemetry() {
    return {
      totalLoansVolume: this.totalLoansVolume.toString(),
      totalFeesCollected: this.totalFeesCollected.toString(),
      blockedAttacksCount: this.blockedAttacksCount,
      reentrancyStats: this.guard.getTelemetry(),
    };
  }

  public reset() {
    this.userLastBlockAction.clear();
    this.totalLoansVolume = 0n;
    this.totalFeesCollected = 0n;
    this.blockedAttacksCount = 0;
    this.guard.resetTelemetry();
  }
}
