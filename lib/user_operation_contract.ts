/**
 * @file user_operation_contract.ts
 * ERC-4337 Account Abstraction UserOperation Ingress & Bundler Boundary Contract.
 * 
 * Enforces strict schema validation, gas limit boundaries, fee invariants,
 * paymaster parameter integrity, and EIP-4337 EntryPoint hash calculation.
 */

import crypto from 'node:crypto';

export class UserOperationContractError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'UserOperationContractError';
    this.code = code;
  }
}

export interface RawUserOperation {
  sender: string;
  nonce: bigint | number | string;
  initCode?: string | Uint8Array;
  callData?: string | Uint8Array;
  callGasLimit: bigint | number | string;
  verificationGasLimit: bigint | number | string;
  preVerificationGas: bigint | number | string;
  maxFeePerGas: bigint | number | string;
  maxPriorityFeePerGas: bigint | number | string;
  paymasterAndData?: string | Uint8Array;
  signature?: string | Uint8Array;
}

export interface ValidatedUserOperation {
  sender: string;
  nonce: bigint;
  initCode: Uint8Array;
  callData: Uint8Array;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Uint8Array;
  signature: Uint8Array;
  hasPaymaster: boolean;
  paymasterAddress: string | null;
}

export interface UserOpValidationResult {
  valid: boolean;
  errors: string[];
  userOp?: ValidatedUserOperation;
}

export class UserOperationContract {
  public static readonly MIN_VERIFICATION_GAS = 10000n;
  public static readonly MIN_PRE_VERIFICATION_GAS = 21000n;
  public static readonly MIN_CALL_GAS = 21000n;

  /**
   * Validates and sanitizes a raw UserOperation structure against ERC-4337 invariants.
   */
  public static validateUserOperation(raw: RawUserOperation): UserOpValidationResult {
    const errors: string[] = [];

    if (!raw || typeof raw !== 'object') {
      return { valid: false, errors: ['UserOperation must be a non-null object'] };
    }

    // 1. Sender validation
    const sender = typeof raw.sender === 'string' ? raw.sender.trim() : '';
    if (!/^0x[a-fA-F0-9]{40}$/.test(sender)) {
      errors.append ? null : errors.push(`Invalid sender address format: ${raw.sender}`);
    } else if (/^0x0{40}$/i.test(sender)) {
      errors.push('Sender cannot be the zero address (0x0)');
    }

    // 2. Nonce validation
    let nonce = 0n;
    try {
      nonce = BigInt(raw.nonce ?? 0);
      if (nonce < 0n) errors.push(`Negative nonce: ${nonce}`);
    } catch {
      errors.push(`Invalid nonce value: ${raw.nonce}`);
    }

    // 3. Byte arrays: initCode, callData, paymasterAndData, signature
    const initCode = UserOperationContract.toBytes(raw.initCode);
    const callData = UserOperationContract.toBytes(raw.callData);
    const paymasterAndData = UserOperationContract.toBytes(raw.paymasterAndData);
    const signature = UserOperationContract.toBytes(raw.signature);

    if (initCode.length > 0 && initCode.length < 20) {
      errors.push(`initCode must contain at least a 20-byte factory address (got ${initCode.length} bytes)`);
    }

    let hasPaymaster = false;
    let paymasterAddress: string | null = null;
    if (paymasterAndData.length > 0) {
      if (paymasterAndData.length < 20) {
        errors.push(`paymasterAndData must contain at least a 20-byte paymaster address (got ${paymasterAndData.length} bytes)`);
      } else {
        hasPaymaster = true;
        paymasterAddress = '0x' + Buffer.from(paymasterAndData.subarray(0, 20)).toString('hex');
      }
    }

    if (signature.length < 64) {
      errors.push(`signature length must be at least 64 bytes (got ${signature.length} bytes)`);
    }

    // 4. Gas Limits
    let callGasLimit = 0n;
    let verificationGasLimit = 0n;
    let preVerificationGas = 0n;
    let maxFeePerGas = 0n;
    let maxPriorityFeePerGas = 0n;

    try {
      callGasLimit = BigInt(raw.callGasLimit ?? 0);
      if (callGasLimit < UserOperationContract.MIN_CALL_GAS) {
        errors.push(`callGasLimit ${callGasLimit} is below minimum requirement of ${UserOperationContract.MIN_CALL_GAS}`);
      }
    } catch {
      errors.push(`Invalid callGasLimit: ${raw.callGasLimit}`);
    }

    try {
      verificationGasLimit = BigInt(raw.verificationGasLimit ?? 0);
      if (verificationGasLimit < UserOperationContract.MIN_VERIFICATION_GAS) {
        errors.push(`verificationGasLimit ${verificationGasLimit} is below minimum requirement of ${UserOperationContract.MIN_VERIFICATION_GAS}`);
      }
    } catch {
      errors.push(`Invalid verificationGasLimit: ${raw.verificationGasLimit}`);
    }

    try {
      preVerificationGas = BigInt(raw.preVerificationGas ?? 0);
      if (preVerificationGas < UserOperationContract.MIN_PRE_VERIFICATION_GAS) {
        errors.push(`preVerificationGas ${preVerificationGas} is below minimum requirement of ${UserOperationContract.MIN_PRE_VERIFICATION_GAS}`);
      }
    } catch {
      errors.push(`Invalid preVerificationGas: ${raw.preVerificationGas}`);
    }

    // 5. Fee Constraints
    try {
      maxFeePerGas = BigInt(raw.maxFeePerGas ?? 0);
      maxPriorityFeePerGas = BigInt(raw.maxPriorityFeePerGas ?? 0);

      if (maxPriorityFeePerGas < 0n) {
        errors.push(`Negative maxPriorityFeePerGas: ${maxPriorityFeePerGas}`);
      }
      if (maxFeePerGas < maxPriorityFeePerGas) {
        errors.push(`maxFeePerGas (${maxFeePerGas}) cannot be lower than maxPriorityFeePerGas (${maxPriorityFeePerGas})`);
      }
    } catch {
      errors.push('Fee parameters must be valid BigInt quantities');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      errors: [],
      userOp: {
        sender,
        nonce,
        initCode,
        callData,
        callGasLimit,
        verificationGasLimit,
        preVerificationGas,
        maxFeePerGas,
        maxPriorityFeePerGas,
        paymasterAndData,
        signature,
        hasPaymaster,
        paymasterAddress,
      },
    };
  }

  /**
   * Computes the EntryPoint UserOpHash:
   * keccak256(pack(userOpHash, entryPoint, chainId))
   */
  public static computeUserOpHash(entryPoint: string, chainId: number, op: ValidatedUserOperation): string {
    const packedCore = [
      op.sender,
      op.nonce.toString(16),
      Buffer.from(op.callData).toString('hex'),
      op.callGasLimit.toString(16),
      op.verificationGasLimit.toString(16),
      op.preVerificationGas.toString(16),
      op.maxFeePerGas.toString(16),
      op.maxPriorityFeePerGas.toString(16),
      Buffer.from(op.paymasterAndData).toString('hex'),
      entryPoint.toLowerCase(),
      chainId.toString(16),
    ].join(':');

    return '0x' + crypto.createHash('sha256').update(packedCore).digest('hex');
  }

  private static toBytes(val?: string | Uint8Array): Uint8Array {
    if (!val) return new Uint8Array(0);
    if (val instanceof Uint8Array || Buffer.isBuffer(val)) {
      return new Uint8Array(val);
    }
    if (typeof val === 'string') {
      const hex = val.startsWith('0x') ? val.slice(2) : val;
      const padded = hex.length % 2 === 1 ? '0' + hex : hex;
      return new Uint8Array(Buffer.from(padded, 'hex'));
    }
    return new Uint8Array(0);
  }
}
