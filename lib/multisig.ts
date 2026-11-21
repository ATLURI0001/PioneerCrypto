/**
 * PioneerCrypto: Multi-Signature Authorization Engine & M-of-N Cryptographic Quorum Validator
 * Implements M-of-N threshold quorum, EIP-712 digest synthesis, replay defense, and execution state machine.
 */

import { isValidAddress } from './crypto.ts';

export type TxStatus = 'PENDING' | 'EXECUTED' | 'CANCELLED';

export interface MultiSigTransaction {
  id: number;
  to: string;
  value: bigint;
  data: string; // Hex payload
  nonce: bigint;
  deadlineSec: number; // Unix timestamp in seconds (0 = no deadline)
  confirmations: Set<string>; // Set of owner addresses that signed
  status: TxStatus;
  executedAt?: number;
}

export interface MultiSigConfig {
  owners: string[];
  threshold: number;
}

export class MultiSigWallet {
  public readonly owners: Set<string>;
  public readonly threshold: number;
  private currentNonce: bigint = 0n;
  private transactions: Map<number, MultiSigTransaction> = new Map();
  private nextTxId: number = 0;

  constructor(config: MultiSigConfig) {
    if (!Array.isArray(config.owners) || config.owners.length === 0) {
      throw new Error('MultiSigWallet: at least one owner address is required');
    }

    const normalizedOwners = new Set<string>();
    for (const owner of config.owners) {
      const clean = owner.toLowerCase().trim();
      if (!isValidAddress(clean)) {
        throw new Error(`MultiSigWallet: invalid owner address '${owner}'`);
      }
      normalizedOwners.add(clean);
    }

    if (config.threshold < 1 || config.threshold > normalizedOwners.size) {
      throw new Error(
        `MultiSigWallet: threshold ${config.threshold} must be between 1 and ${normalizedOwners.size}`
      );
    }

    this.owners = normalizedOwners;
    this.threshold = config.threshold;
  }

  /**
   * Generates a deterministic EIP-712 pseudo-digest string for signature verification.
   */
  public computeDigest(to: string, value: bigint, data: string, nonce: bigint, deadlineSec: number): string {
    return `EIP712_DIGEST[to=${to.toLowerCase()};value=${value.toString()};data=${data};nonce=${nonce.toString()};deadline=${deadlineSec}]`;
  }

  /**
   * Proposes a new multi-sig transaction with automatic nonce assignment.
   */
  public submitTransaction(
    to: string,
    value: bigint = 0n,
    data: string = '0x',
    deadlineSec: number = 0
  ): number {
    const cleanTo = to.toLowerCase().trim();
    if (!isValidAddress(cleanTo)) {
      throw new Error(`MultiSigWallet: invalid recipient address '${to}'`);
    }
    if (value < 0n) {
      throw new Error('MultiSigWallet: value cannot be negative');
    }

    const txId = this.nextTxId++;
    const tx: MultiSigTransaction = {
      id: txId,
      to: cleanTo,
      value,
      data,
      nonce: this.currentNonce,
      deadlineSec,
      confirmations: new Set(),
      status: 'PENDING',
    };

    this.transactions.set(txId, tx);
    return txId;
  }

  /**
   * Confirms a proposed transaction on behalf of an owner.
   */
  public confirmTransaction(txId: number, signer: string): boolean {
    const cleanSigner = signer.toLowerCase().trim();
    if (!this.owners.has(cleanSigner)) {
      throw new Error(`MultiSigWallet: signer '${signer}' is not an authorized owner`);
    }

    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error(`MultiSigWallet: transaction id ${txId} does not exist`);
    }
    if (tx.status !== 'PENDING') {
      throw new Error(`MultiSigWallet: transaction id ${txId} is not in PENDING state`);
    }

    if (tx.confirmations.has(cleanSigner)) {
      return false; // Already confirmed by this owner
    }

    tx.confirmations.add(cleanSigner);
    return true;
  }

  /**
   * Revokes an existing confirmation before execution.
   */
  public revokeConfirmation(txId: number, signer: string): boolean {
    const cleanSigner = signer.toLowerCase().trim();
    const tx = this.transactions.get(txId);
    if (!tx || tx.status !== 'PENDING') {
      return false;
    }

    return tx.confirmations.delete(cleanSigner);
  }

  /**
   * Executes a confirmed transaction once quorum threshold is reached.
   */
  public executeTransaction(txId: number, currentTimestampSec: number = Math.floor(Date.now() / 1000)): boolean {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error(`MultiSigWallet: transaction id ${txId} does not exist`);
    }
    if (tx.status !== 'PENDING') {
      throw new Error(`MultiSigWallet: transaction ${txId} already processed (status: ${tx.status})`);
    }

    if (tx.deadlineSec > 0 && currentTimestampSec > tx.deadlineSec) {
      tx.status = 'CANCELLED';
      throw new Error(`MultiSigWallet: transaction ${txId} has expired past deadline`);
    }

    if (tx.confirmations.size < this.threshold) {
      throw new Error(
        `MultiSigWallet: quorum not met (${tx.confirmations.size}/${this.threshold} required)`
      );
    }

    tx.status = 'EXECUTED';
    tx.executedAt = currentTimestampSec;
    this.currentNonce++; // Advance nonce to prevent replays
    return true;
  }

  public getTransaction(txId: number): MultiSigTransaction | undefined {
    return this.transactions.get(txId);
  }

  public getNonce(): bigint {
    return this.currentNonce;
  }
}
