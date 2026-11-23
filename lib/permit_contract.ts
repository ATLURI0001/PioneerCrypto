/**
 * @file permit_contract.ts
 * EIP-2612 / EIP-712 Permit Ingress Contract & Gasless Approval Sanitizer.
 *
 * Validates off-chain signed token approval permits, enforces SECP256K1 signature
 * boundaries, bounds expiration deadlines, and blocks nonce reuse attacks.
 */

export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export interface PermitMessage {
  owner: string;
  spender: string;
  value: bigint | string;
  nonce: number;
  deadline: number;
}

export interface ECDSASignature {
  v: number;
  r: string;
  s: string;
}

export interface IngressPermitRequest {
  domain: EIP712Domain;
  message: PermitMessage;
  signature: ECDSASignature;
}

export interface PermitValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedPermit?: {
    domain: EIP712Domain;
    message: {
      owner: string;
      spender: string;
      value: bigint;
      nonce: number;
      deadline: number;
    };
    signature: ECDSASignature;
  };
}

const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const HEX32_REGEX = /^0x[0-9a-fA-F]{64}$/;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MAX_UINT256 = (1n << 256n) - 1n;

export class PermitContractSanitizer {
  private ownerNonces: Map<string, number>; // ownerAddress (lower) -> highestUsedNonce

  constructor() {
    this.ownerNonces = new Map();
  }

  /**
   * Validates and sanitizes an incoming EIP-2612 permit request.
   */
  validatePermit(req: IngressPermitRequest, currentTimestampSec?: number): PermitValidationResult {
    const errors: string[] = [];
    const now = currentTimestampSec ?? Math.floor(Date.now() / 1000);

    if (!req || typeof req !== 'object') {
      return { valid: false, errors: ['Permit request must be a non-null object'] };
    }

    // 1. Domain validation
    const domain = req.domain;
    if (!domain || typeof domain !== 'object') {
      errors.push('Missing or invalid domain specification');
    } else {
      if (!domain.name || typeof domain.name !== 'string' || domain.name.length > 64) {
        errors.push('domain.name must be a non-empty string <= 64 characters');
      }
      if (!domain.version || typeof domain.version !== 'string' || domain.version.length > 16) {
        errors.push('domain.version must be a non-empty string <= 16 characters');
      }
      if (!Number.isInteger(domain.chainId) || domain.chainId <= 0) {
        errors.push('domain.chainId must be a positive integer');
      }
      if (!domain.verifyingContract || !ETH_ADDRESS_REGEX.test(domain.verifyingContract)) {
        errors.push(`domain.verifyingContract must be a valid 20-byte hex address`);
      }
    }

    // 2. Message validation
    const msg = req.message;
    let cleanOwner = '';
    let cleanSpender = '';
    let cleanValue = 0n;

    if (!msg || typeof msg !== 'object') {
      errors.push('Missing or invalid message specification');
    } else {
      cleanOwner = String(msg.owner || '').trim().toLowerCase();
      cleanSpender = String(msg.spender || '').trim().toLowerCase();

      if (!ETH_ADDRESS_REGEX.test(cleanOwner)) {
        errors.push(`Invalid owner address "${msg.owner}"`);
      } else if (cleanOwner === ZERO_ADDRESS) {
        errors.push('owner cannot be the zero address');
      }

      if (!ETH_ADDRESS_REGEX.test(cleanSpender)) {
        errors.push(`Invalid spender address "${msg.spender}"`);
      } else if (cleanSpender === ZERO_ADDRESS) {
        errors.push('spender cannot be the zero address');
      }

      if (cleanOwner && cleanSpender && cleanOwner === cleanSpender) {
        errors.push('Self-permit rejected: owner and spender cannot be identical');
      }

      // Value check
      try {
        cleanValue = BigInt(msg.value);
        if (cleanValue < 0n || cleanValue > MAX_UINT256) {
          errors.push('value must be an unsigned integer in range [0, 2^256 - 1]');
        }
      } catch {
        errors.push(`Invalid value "${msg.value}": must be a valid BigInt representation`);
      }

      // Nonce check
      if (!Number.isInteger(msg.nonce) || msg.nonce < 0) {
        errors.push(`nonce must be a non-negative integer`);
      } else {
        const expectedNonce = this.getExpectedNonce(cleanOwner);
        if (msg.nonce !== expectedNonce) {
          errors.push(`Invalid nonce ${msg.nonce}: expected sequential nonce ${expectedNonce}`);
        }
      }

      // Deadline check
      if (!Number.isInteger(msg.deadline) || msg.deadline <= 0) {
        errors.push(`deadline must be a positive unix timestamp`);
      } else if (msg.deadline < now) {
        errors.push(`Permit expired: deadline (${msg.deadline}) is in the past (now: ${now})`);
      }
    }

    // 3. Signature validation
    const sig = req.signature;
    if (!sig || typeof sig !== 'object') {
      errors.push('Missing or invalid signature specification');
    } else {
      if (sig.v !== 27 && sig.v !== 28) {
        errors.push(`Invalid signature v: ${sig.v} (must be 27 or 28)`);
      }
      if (!sig.r || !HEX32_REGEX.test(sig.r)) {
        errors.push('signature r must be a 32-byte hex string (0x prefix + 64 hex chars)');
      }
      if (!sig.s || !HEX32_REGEX.test(sig.s)) {
        errors.push('signature s must be a 32-byte hex string (0x prefix + 64 hex chars)');
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Commit nonce consumption
    this.ownerNonces.set(cleanOwner, msg.nonce);

    return {
      valid: true,
      errors: [],
      sanitizedPermit: {
        domain: {
          name: domain.name.trim(),
          version: domain.version.trim(),
          chainId: domain.chainId,
          verifyingContract: domain.verifyingContract.toLowerCase(),
        },
        message: {
          owner: cleanOwner,
          spender: cleanSpender,
          value: cleanValue,
          nonce: msg.nonce,
          deadline: msg.deadline,
        },
        signature: {
          v: sig.v,
          r: sig.r.toLowerCase(),
          s: sig.s.toLowerCase(),
        },
      },
    };
  }

  getExpectedNonce(owner: string): number {
    const key = owner.trim().toLowerCase();
    const last = this.ownerNonces.get(key);
    return last !== undefined ? last + 1 : 0;
  }

  reset(): void {
    this.ownerNonces.clear();
  }
}
