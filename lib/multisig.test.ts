import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MultiSigWallet } from './multisig.ts';

describe('Multi-Signature Authorization Engine', () => {
  const ownerA = '0x1111111111111111111111111111111111111111';
  const ownerB = '0x2222222222222222222222222222222222222222';
  const ownerC = '0x3333333333333333333333333333333333333333';
  const nonOwner = '0x4444444444444444444444444444444444444444';
  const recipient = '0x5555555555555555555555555555555555555555';

  it('should initialize with validated owners and threshold', () => {
    const wallet = new MultiSigWallet({
      owners: [ownerA, ownerB, ownerC],
      threshold: 2,
    });

    assert.equal(wallet.owners.size, 3);
    assert.equal(wallet.threshold, 2);
    assert.equal(wallet.getNonce(), 0n);
  });

  it('should reject invalid owners or threshold out of range', () => {
    assert.throws(() => new MultiSigWallet({ owners: [], threshold: 1 }), /at least one owner/);
    assert.throws(() => new MultiSigWallet({ owners: ['invalid-addr'], threshold: 1 }), /invalid owner address/);
    assert.throws(
      () => new MultiSigWallet({ owners: [ownerA, ownerB], threshold: 3 }),
      /threshold 3 must be between 1 and 2/
    );
  });

  it('should submit, confirm, and execute a 2-of-3 multisig transaction', () => {
    const wallet = new MultiSigWallet({
      owners: [ownerA, ownerB, ownerC],
      threshold: 2,
    });

    const txId = wallet.submitTransaction(recipient, 1000n, '0xabcd');
    assert.equal(txId, 0);

    const tx = wallet.getTransaction(txId);
    assert.ok(tx);
    assert.equal(tx.status, 'PENDING');
    assert.equal(tx.confirmations.size, 0);

    // Confirm by Owner A
    assert.equal(wallet.confirmTransaction(txId, ownerA), true);
    assert.equal(wallet.confirmTransaction(txId, ownerA), false); // Duplicate confirmation returns false

    // Attempt execute before threshold met
    assert.throws(() => wallet.executeTransaction(txId), /quorum not met/);

    // Confirm by Owner B
    assert.equal(wallet.confirmTransaction(txId, ownerB), true);

    // Now threshold (2) is met: execute
    assert.equal(wallet.executeTransaction(txId), true);

    const executedTx = wallet.getTransaction(txId);
    assert.equal(executedTx?.status, 'EXECUTED');
    assert.equal(wallet.getNonce(), 1n);

    // Double execution should be prevented
    assert.throws(() => wallet.executeTransaction(txId), /already processed/);
  });

  it('should reject unauthorized signers and handle confirmation revocation', () => {
    const wallet = new MultiSigWallet({
      owners: [ownerA, ownerB],
      threshold: 2,
    });

    const txId = wallet.submitTransaction(recipient, 500n);

    // Non-owner confirmation rejected
    assert.throws(() => wallet.confirmTransaction(txId, nonOwner), /not an authorized owner/);

    // Owner A confirms, then revokes
    wallet.confirmTransaction(txId, ownerA);
    assert.equal(wallet.getTransaction(txId)?.confirmations.size, 1);

    assert.equal(wallet.revokeConfirmation(txId, ownerA), true);
    assert.equal(wallet.getTransaction(txId)?.confirmations.size, 0);
  });

  it('should cancel expired transaction past deadline', () => {
    const wallet = new MultiSigWallet({
      owners: [ownerA, ownerB],
      threshold: 1,
    });

    const deadlineSec = 1000;
    const txId = wallet.submitTransaction(recipient, 100n, '0x', deadlineSec);
    wallet.confirmTransaction(txId, ownerA);

    // Attempt execute after deadline (t = 1001)
    assert.throws(() => wallet.executeTransaction(txId, 1001), /expired past deadline/);
    assert.equal(wallet.getTransaction(txId)?.status, 'CANCELLED');
  });
});
