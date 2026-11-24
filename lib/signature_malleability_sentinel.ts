/**
 * PioneerCrypto - Secp256k1 Signature Malleability & Replay Attack Failsafe Sentinel
 *
 * Implements EIP-2 and EIP-712 cryptographic invariants to prevent signature malleability
 * exploits and duplicate relay attacks in DeFi permits and meta-transactions.
 *
 * Postmortem Incident: INC-2026-DEFI-5109
 */

import { createHash } from 'node:crypto';

// secp256k1 group order n
export const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
// secp256k1 n / 2 (EIP-2 canonical low-s boundary)
export const SECP256K1_HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;

export const SignatureErrorCode = {
  INVALID_R_RANGE: 'ERR_INVALID_R_RANGE',
  MALLEABLE_HIGH_S: 'ERR_MALLEABLE_HIGH_S',
  INVALID_S_RANGE: 'ERR_INVALID_S_RANGE',
  INVALID_V_VALUE: 'ERR_INVALID_V_VALUE',
  SIGNATURE_REPLAYED: 'ERR_SIGNATURE_REPLAYED',
  DOMAIN_CHAIN_MISMATCH: 'ERR_DOMAIN_CHAIN_MISMATCH',
  DOMAIN_CONTRACT_MISMATCH: 'ERR_DOMAIN_CONTRACT_MISMATCH',
} as const;

export type SignatureErrorCode = (typeof SignatureErrorCode)[keyof typeof SignatureErrorCode];

export interface ECDSASignature {
  r: string;
  s: string;
  v: number;
}

export interface SentinelDomain {
  chainId: number;
  verifyingContract: string;
}

export interface SentinelConfig {
  chainId: number;
  verifyingContract: string;
  replayWindowSize: number;
  enforceLowS: boolean;
}

export interface SignatureValidationResult {
  valid: boolean;
  canonicalSignatureHash: string;
  normalizedS: string;
  isMalleable: boolean;
  errorCode?: SignatureErrorCode;
  errorMessage?: string;
}

export class SignatureMalleabilitySentinel {
  private config: SentinelConfig;
  private executedSignatures: Set<string>;
  private executionOrder: string[];

  constructor(customConfig?: Partial<SentinelConfig>) {
    this.config = {
      chainId: customConfig?.chainId ?? 1,
      verifyingContract: (customConfig?.verifyingContract ?? '0x0000000000000000000000000000000000000000').toLowerCase(),
      replayWindowSize: Math.max(10, customConfig?.replayWindowSize ?? 1000),
      enforceLowS: customConfig?.enforceLowS ?? true,
    };
    this.executedSignatures = new Set();
    this.executionOrder = [];
  }

  /**
   * Evaluates if an s-value complies with EIP-2 canonical low-s requirements.
   */
  public evaluateSValue(sHex: string): {
    validRange: boolean;
    isLowS: boolean;
    sBigInt: bigint;
    canonicalSBigInt: bigint;
  } {
    const cleanS = sHex.startsWith('0x') ? sHex.slice(2) : sHex;
    let sBigInt: bigint;
    try {
      sBigInt = BigInt(`0x${cleanS}`);
    } catch {
      return { validRange: false, isLowS: false, sBigInt: 0n, canonicalSBigInt: 0n };
    }

    if (sBigInt <= 0n || sBigInt >= SECP256K1_N) {
      return { validRange: false, isLowS: false, sBigInt, canonicalSBigInt: 0n };
    }

    const isLowS = sBigInt <= SECP256K1_HALF_N;
    const canonicalS = isLowS ? sBigInt : SECP256K1_N - sBigInt;

    return {
      validRange: true,
      isLowS,
      sBigInt,
      canonicalSBigInt: canonicalS,
    };
  }

  /**
   * Computes deterministic canonical SHA-256 digest of normalized (r, low-s, v).
   */
  public computeCanonicalHash(sig: ECDSASignature, messageHash: string): string {
    const sEval = this.evaluateSValue(sig.s);
    const lowSHex = sEval.canonicalSBigInt.toString(16).padStart(64, '0');
    const cleanR = (sig.r.startsWith('0x') ? sig.r.slice(2) : sig.r).toLowerCase().padStart(64, '0');
    const cleanMsg = (messageHash.startsWith('0x') ? messageHash.slice(2) : messageHash).toLowerCase();

    // Canonical digest binds r, normalized low-s, and messageHash
    return createHash('sha256')
      .update(`${cleanR}:${lowSHex}:${cleanMsg}`)
      .digest('hex');
  }

  /**
   * Inspects incoming signature against malleability invariants, domain bounds, and replay guards.
   */
  public verifyAndConsume(
    sig: ECDSASignature,
    messageHash: string,
    domain?: Partial<SentinelDomain>
  ): SignatureValidationResult {
    // 1. Domain binding verification
    if (domain?.chainId !== undefined && domain.chainId !== this.config.chainId) {
      return {
        valid: false,
        canonicalSignatureHash: '',
        normalizedS: '',
        isMalleable: false,
        errorCode: SignatureErrorCode.DOMAIN_CHAIN_MISMATCH,
        errorMessage: `Signature intended for chain ID ${domain.chainId}, active chain is ${this.config.chainId}`,
      };
    }

    if (
      domain?.verifyingContract &&
      domain.verifyingContract.toLowerCase() !== this.config.verifyingContract
    ) {
      return {
        valid: false,
        canonicalSignatureHash: '',
        normalizedS: '',
        isMalleable: false,
        errorCode: SignatureErrorCode.DOMAIN_CONTRACT_MISMATCH,
        errorMessage: `Signature intended for contract ${domain.verifyingContract}, active contract is ${this.config.verifyingContract}`,
      };
    }

    // 2. Validate R scalar
    let rBigInt: bigint;
    try {
      const cleanR = sig.r.startsWith('0x') ? sig.r.slice(2) : sig.r;
      rBigInt = BigInt(`0x${cleanR}`);
    } catch {
      return {
        valid: false,
        canonicalSignatureHash: '',
        normalizedS: '',
        isMalleable: false,
        errorCode: SignatureErrorCode.INVALID_R_RANGE,
        errorMessage: 'Malformed r scalar representation',
      };
    }

    if (rBigInt <= 0n || rBigInt >= SECP256K1_N) {
      return {
        valid: false,
        canonicalSignatureHash: '',
        normalizedS: '',
        isMalleable: false,
        errorCode: SignatureErrorCode.INVALID_R_RANGE,
        errorMessage: `r scalar out of valid curve range [1, n-1]`,
      };
    }

    // 3. Validate S scalar and EIP-2 low-s compliance
    const sEval = this.evaluateSValue(sig.s);
    if (!sEval.validRange) {
      return {
        valid: false,
        canonicalSignatureHash: '',
        normalizedS: '',
        isMalleable: false,
        errorCode: SignatureErrorCode.INVALID_S_RANGE,
        errorMessage: 's scalar out of valid curve range [1, n-1]',
      };
    }

    if (this.config.enforceLowS && !sEval.isLowS) {
      return {
        valid: false,
        canonicalSignatureHash: '',
        normalizedS: `0x${sEval.canonicalSBigInt.toString(16)}`,
        isMalleable: true,
        errorCode: SignatureErrorCode.MALLEABLE_HIGH_S,
        errorMessage: 'Malleable high-s signature detected; violates EIP-2 canonical low-s invariant',
      };
    }

    // 4. Validate v recovery identifier
    if (sig.v !== 27 && sig.v !== 28 && sig.v !== 0 && sig.v !== 1) {
      return {
        valid: false,
        canonicalSignatureHash: '',
        normalizedS: '',
        isMalleable: false,
        errorCode: SignatureErrorCode.INVALID_V_VALUE,
        errorMessage: `Invalid recovery identifier v=${sig.v}; expected 27 or 28`,
      };
    }

    // 5. Compute canonical hash and verify anti-replay uniqueness
    const canonicalHash = this.computeCanonicalHash(sig, messageHash);

    if (this.executedSignatures.has(canonicalHash)) {
      return {
        valid: false,
        canonicalSignatureHash: canonicalHash,
        normalizedS: `0x${sEval.canonicalSBigInt.toString(16)}`,
        isMalleable: !sEval.isLowS,
        errorCode: SignatureErrorCode.SIGNATURE_REPLAYED,
        errorMessage: `Replay detected: canonical signature digest ${canonicalHash} has already been executed`,
      };
    }

    // Record execution in sliding replay cache
    this.executedSignatures.add(canonicalHash);
    this.executionOrder.push(canonicalHash);

    if (this.executionOrder.length > this.config.replayWindowSize) {
      const oldest = this.executionOrder.shift()!;
      this.executedSignatures.delete(oldest);
    }

    return {
      valid: true,
      canonicalSignatureHash: canonicalHash,
      normalizedS: `0x${sEval.canonicalSBigInt.toString(16)}`,
      isMalleable: !sEval.isLowS,
    };
  }

  /**
   * Clears the execution replay cache.
   */
  public clearReplayCache(): void {
    this.executedSignatures.clear();
    this.executionOrder = [];
  }

  /**
   * Generates a markdown postmortem report summarizing prevented malleability and replay attacks.
   */
  public generateIncidentPostmortem(incidentId = 'INC-2026-DEFI-5109'): string {
    return [
      `# Incident Postmortem: ${incidentId} - Signature Malleability Replay Protection`,
      '',
      '## Executive Summary',
      'The transaction relay pipeline was vulnerable to transaction hash mutability where non-canonical',
      'high-s ECDSA signatures could be modified by intermediaries without invalidating cryptographic validity.',
      '',
      '## Root Cause',
      'In standard secp256k1 curves, for any signature (r, s), the inverted signature (r, n - s) evaluates to',
      'the exact same public key, allowing malicious relayers to mutate signatures and bypass naive replay filters.',
      '',
      '## Implemented Remediation',
      '1. **EIP-2 Enforcement:** Strict rejection of signatures with s > n / 2.',
      '2. **Canonical Digest Hashing:** Anti-replay ring cache stores normalized canonical hashes.',
      '3. **Domain Binding:** Strict validation of EIP-712 chainId and verifyingContract.',
    ].join('\n');
  }
}
