/**
 * Time-Locked Escrow Vault & Quadratic Voting Settlement Engine
 *
 * Implements a time-locked trust-minimized escrow state machine with
 * multi-party dispute arbitration and quadratic voting conviction weighting.
 */

import { isValidAddress, isZeroAddress } from './crypto.ts';

export type EscrowState = 'INITIALIZED' | 'DEPOSITED' | 'DISPUTED' | 'RESOLVED' | 'RELEASED' | 'REFUNDED';

export interface EscrowAgreement {
  id: string;
  depositor: string;
  beneficiary: string;
  arbiter: string;
  amount: bigint;
  depositedAmount: bigint;
  releaseTimestampSec: number;
  disputeDeadlineSec: number;
  state: EscrowState;
  createdAtSec: number;
  resolvedAtSec?: number;
  beneficiaryShare?: bigint;
  depositorShare?: bigint;
}

export interface QuadraticVotingConfig {
  maxLockDurationSec: number; // e.g. 4 years (126,144,000 sec)
  precisionFactor: bigint;    // 10^18 for fixed-point weighting
}

export const DEFAULT_QV_CONFIG: QuadraticVotingConfig = {
  maxLockDurationSec: 126_144_000, // 4 years in seconds
  precisionFactor: 1_000_000_000_000_000_000n,
};

/**
 * Computes integer square root using Newton's method for BigInt.
 */
export function sqrtBigInt(n: bigint): bigint {
  if (n < 0n) {
    throw new Error('Square root of negative BigInt is undefined');
  }
  if (n < 2n) {
    return n;
  }

  let x0 = n / 2n;
  let x1 = (x0 + n / x0) / 2n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + n / x0) / 2n;
  }
  return x0;
}

/**
 * Calculates quadratic voting conviction weight with time-lock duration boosting.
 * Weight = floor(sqrt(tokens)) * (1 + duration / maxLockDuration)
 */
export function calculateQuadraticWeight(
  stakedTokens: bigint,
  lockDurationSec: number,
  config: QuadraticVotingConfig = DEFAULT_QV_CONFIG
): bigint {
  if (stakedTokens <= 0n) {
    return 0n;
  }
  if (lockDurationSec < 0) {
    throw new Error('Lock duration cannot be negative');
  }

  const baseWeight = sqrtBigInt(stakedTokens);
  const clampedDuration = Math.min(lockDurationSec, config.maxLockDurationSec);

  // Scaled boost factor: (1 + duration / maxDuration) scaled by 1e18
  const durationBoostScaled = (BigInt(clampedDuration) * config.precisionFactor) / BigInt(config.maxLockDurationSec);
  const totalMultiplierScaled = config.precisionFactor + durationBoostScaled;

  return (baseWeight * totalMultiplierScaled) / config.precisionFactor;
}

export class TimeLockedEscrowVault {
  private agreements: Map<string, EscrowAgreement> = new Map();

  /**
   * Initializes and creates a new time-locked escrow agreement.
   */
  public createAgreement(params: {
    id: string;
    depositor: string;
    beneficiary: string;
    arbiter: string;
    amount: bigint;
    releaseTimestampSec: number;
    disputeDeadlineSec: number;
    currentTimestampSec: number;
  }): EscrowAgreement {
    const { id, depositor, beneficiary, arbiter, amount, releaseTimestampSec, disputeDeadlineSec, currentTimestampSec } = params;

    if (!id || id.trim().length === 0) {
      throw new Error('Escrow ID is required');
    }
    if (this.agreements.has(id)) {
      throw new Error(`Escrow agreement with ID "${id}" already exists`);
    }

    if (!isValidAddress(depositor) || isZeroAddress(depositor)) {
      throw new Error(`Invalid depositor address: ${depositor}`);
    }
    if (!isValidAddress(beneficiary) || isZeroAddress(beneficiary)) {
      throw new Error(`Invalid beneficiary address: ${beneficiary}`);
    }
    if (!isValidAddress(arbiter) || isZeroAddress(arbiter)) {
      throw new Error(`Invalid arbiter address: ${arbiter}`);
    }

    if (depositor.toLowerCase() === beneficiary.toLowerCase()) {
      throw new Error('Depositor and beneficiary cannot be the same address');
    }
    if (arbiter.toLowerCase() === depositor.toLowerCase() || arbiter.toLowerCase() === beneficiary.toLowerCase()) {
      throw new Error('Arbiter must be an independent third party');
    }

    if (amount <= 0n) {
      throw new Error('Escrow amount must be strictly positive');
    }

    if (releaseTimestampSec <= currentTimestampSec) {
      throw new Error('Release timestamp must be strictly in the future');
    }
    if (disputeDeadlineSec <= releaseTimestampSec) {
      throw new Error('Dispute deadline must be strictly greater than release timestamp');
    }

    const agreement: EscrowAgreement = {
      id,
      depositor: depositor.toLowerCase(),
      beneficiary: beneficiary.toLowerCase(),
      arbiter: arbiter.toLowerCase(),
      amount,
      depositedAmount: 0n,
      releaseTimestampSec,
      disputeDeadlineSec,
      state: 'INITIALIZED',
      createdAtSec: currentTimestampSec,
    };

    this.agreements.set(id, agreement);
    return { ...agreement };
  }

  /**
   * Deposits funds into the initialized agreement.
   */
  public deposit(id: string, caller: string, depositAmount: bigint): EscrowAgreement {
    const agreement = this.getAgreement(id);
    if (agreement.state !== 'INITIALIZED') {
      throw new Error(`Cannot deposit into escrow in state: ${agreement.state}`);
    }
    if (caller.toLowerCase() !== agreement.depositor) {
      throw new Error('Only the designated depositor can fund the escrow');
    }
    if (depositAmount !== agreement.amount) {
      throw new Error(`Deposit amount ${depositAmount} does not match agreement amount ${agreement.amount}`);
    }

    agreement.depositedAmount = depositAmount;
    agreement.state = 'DEPOSITED';
    return { ...agreement };
  }

  /**
   * Releases escrow funds to the beneficiary.
   * Can be invoked by:
   * 1. Depositor at any time before dispute.
   * 2. Beneficiary after releaseTimestampSec has elapsed (and before dispute deadline or if no dispute).
   */
  public releaseFunds(id: string, caller: string, currentTimestampSec: number): EscrowAgreement {
    const agreement = this.getAgreement(id);
    if (agreement.state !== 'DEPOSITED') {
      throw new Error(`Cannot release escrow in state: ${agreement.state}`);
    }

    const callerLower = caller.toLowerCase();
    const isDepositor = callerLower === agreement.depositor;
    const isBeneficiary = callerLower === agreement.beneficiary;

    if (!isDepositor && !isBeneficiary) {
      throw new Error('Only depositor or beneficiary can trigger release');
    }

    if (isBeneficiary && currentTimestampSec < agreement.releaseTimestampSec) {
      throw new Error(`Release timelock active: current time ${currentTimestampSec} < release time ${agreement.releaseTimestampSec}`);
    }

    agreement.state = 'RELEASED';
    agreement.beneficiaryShare = agreement.depositedAmount;
    agreement.depositorShare = 0n;
    agreement.resolvedAtSec = currentTimestampSec;

    return { ...agreement };
  }

  /**
   * Initiates a dispute, freezing funds until arbiter settlement.
   */
  public raiseDispute(id: string, caller: string, currentTimestampSec: number): EscrowAgreement {
    const agreement = this.getAgreement(id);
    if (agreement.state !== 'DEPOSITED') {
      throw new Error(`Cannot dispute escrow in state: ${agreement.state}`);
    }

    const callerLower = caller.toLowerCase();
    if (callerLower !== agreement.depositor && callerLower !== agreement.beneficiary) {
      throw new Error('Only depositor or beneficiary can raise a dispute');
    }

    if (currentTimestampSec > agreement.disputeDeadlineSec) {
      throw new Error('Cannot raise dispute: dispute deadline has elapsed');
    }

    agreement.state = 'DISPUTED';
    return { ...agreement };
  }

  /**
   * Settles a disputed escrow by distributing funds between depositor and beneficiary.
   */
  public resolveDispute(
    id: string,
    caller: string,
    beneficiaryShare: bigint,
    depositorShare: bigint,
    currentTimestampSec: number
  ): EscrowAgreement {
    const agreement = this.getAgreement(id);
    if (agreement.state !== 'DISPUTED') {
      throw new Error(`Cannot resolve escrow that is not in DISPUTED state (current: ${agreement.state})`);
    }

    if (caller.toLowerCase() !== agreement.arbiter) {
      throw new Error('Only the designated arbiter can resolve disputes');
    }

    if (beneficiaryShare < 0n || depositorShare < 0n) {
      throw new Error('Settlement shares cannot be negative');
    }

    if (beneficiaryShare + depositorShare !== agreement.depositedAmount) {
      throw new Error(
        `Total settlement shares (${beneficiaryShare + depositorShare}) must exactly equal deposited amount (${agreement.depositedAmount})`
      );
    }

    agreement.state = 'RESOLVED';
    agreement.beneficiaryShare = beneficiaryShare;
    agreement.depositorShare = depositorShare;
    agreement.resolvedAtSec = currentTimestampSec;

    return { ...agreement };
  }

  /**
   * Refunds entire escrow deposit back to the depositor upon mutually agreed cancellation.
   */
  public refund(id: string, caller: string, currentTimestampSec: number): EscrowAgreement {
    const agreement = this.getAgreement(id);
    if (agreement.state !== 'INITIALIZED' && agreement.state !== 'DEPOSITED') {
      throw new Error(`Cannot refund escrow in state: ${agreement.state}`);
    }

    // Beneficiary can initiate refund to depositor at any time
    if (caller.toLowerCase() !== agreement.beneficiary) {
      throw new Error('Refund must be authorized by beneficiary');
    }

    agreement.state = 'REFUNDED';
    agreement.depositorShare = agreement.depositedAmount;
    agreement.beneficiaryShare = 0n;
    agreement.resolvedAtSec = currentTimestampSec;

    return { ...agreement };
  }

  public getAgreement(id: string): EscrowAgreement {
    const agreement = this.agreements.get(id);
    if (!agreement) {
      throw new Error(`Escrow agreement "${id}" not found`);
    }
    return agreement;
  }
}
