import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  UserOperationContract,
  type RawUserOperation,
} from './user_operation_contract.ts';

describe('UserOperationContract Suite', () => {
  const validOp: RawUserOperation = {
    sender: '0x71C841832049987c9B3E256C8Fa72f2E28F8b049',
    nonce: 1n,
    initCode: '0x',
    callData: '0xa9059cbb00000000000000000000000011111111111111111111111111111111111111110000000000000000000000000000000000000000000000000de0b6b3a7640000',
    callGasLimit: 100000n,
    verificationGasLimit: 50000n,
    preVerificationGas: 45000n,
    maxFeePerGas: 30000000000n,
    maxPriorityFeePerGas: 1500000000n,
    paymasterAndData: '0x22222222222222222222222222222222222222220000000000000001',
    signature: '0x' + 'ff'.repeat(65),
  };

  it('validates a compliant ERC-4337 UserOperation', () => {
    const res = UserOperationContract.validateUserOperation(validOp);
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);

    const op = res.userOp;
    assert.ok(op);
    assert.equal(op.sender, '0x71C841832049987c9B3E256C8Fa72f2E28F8b049');
    assert.equal(op.hasPaymaster, true);
    assert.equal(op.paymasterAddress, '0x2222222222222222222222222222222222222222');
  });

  it('rejects invalid sender addresses and zero address', () => {
    // Malformed address
    const r1 = UserOperationContract.validateUserOperation({ ...validOp, sender: '0x123' });
    assert.equal(r1.valid, false);
    assert.ok(r1.errors.some((e) => e.includes('Invalid sender address format')));

    // Zero address
    const r2 = UserOperationContract.validateUserOperation({
      ...validOp,
      sender: '0x0000000000000000000000000000000000000000',
    });
    assert.equal(r2.valid, false);
    assert.ok(r2.errors.some((e) => e.includes('zero address')));
  });

  it('enforces gas limit lower bounds and fee constraints', () => {
    const r1 = UserOperationContract.validateUserOperation({
      ...validOp,
      verificationGasLimit: 5000n, // Below 10,000n
    });
    assert.equal(r1.valid, false);
    assert.ok(r1.errors.some((e) => e.includes('verificationGasLimit')));

    // maxFeePerGas < maxPriorityFeePerGas
    const r2 = UserOperationContract.validateUserOperation({
      ...validOp,
      maxFeePerGas: 1000n,
      maxPriorityFeePerGas: 2000n,
    });
    assert.equal(r2.valid, false);
    assert.ok(r2.errors.some((e) => e.includes('cannot be lower than maxPriorityFeePerGas')));
  });

  it('computes deterministic userOpHash', () => {
    const res = UserOperationContract.validateUserOperation(validOp);
    assert.ok(res.userOp);

    const hash1 = UserOperationContract.computeUserOpHash(
      '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
      1,
      res.userOp
    );
    const hash2 = UserOperationContract.computeUserOpHash(
      '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
      1,
      res.userOp
    );

    assert.equal(hash1, hash2);
    assert.ok(hash1.startsWith('0x'));
    assert.equal(hash1.length, 66);
  });
});
