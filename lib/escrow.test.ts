import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  sqrtBigInt,
  calculateQuadraticWeight,
  TimeLockedEscrowVault,
  DEFAULT_QV_CONFIG,
} from './escrow.ts';

const ALICE = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';
const CHARLIE_ARBITER = '0x3333333333333333333333333333333333333333';
const EVE_ATTACKER = '0x4444444444444444444444444444444444444444';

describe('Time-Locked Escrow Vault & Quadratic Voting Engine', () => {
  describe('sqrtBigInt & calculateQuadraticWeight', () => {
    it('should compute exact and floored square roots correctly', () => {
      assert.equal(sqrtBigInt(0n), 0n);
      assert.equal(sqrtBigInt(1n), 1n);
      assert.equal(sqrtBigInt(4n), 2n);
      assert.equal(sqrtBigInt(10n), 3n);
      assert.equal(sqrtBigInt(100n), 10n);
      assert.equal(sqrtBigInt(1_000_000_000_000_000_000n), 1_000_000_000n);
      assert.throws(() => sqrtBigInt(-5n), /negative/);
    });

    it('should calculate quadratic voting weight with duration boost', () => {
      const staked = 10_000n; // sqrt(10,000) = 100
      // 0 lock duration -> exactly base weight (100)
      const w0 = calculateQuadraticWeight(staked, 0);
      assert.equal(w0, 100n);

      // Max lock duration (4 years) -> exactly 2x boost (200)
      const wMax = calculateQuadraticWeight(staked, DEFAULT_QV_CONFIG.maxLockDurationSec);
      assert.equal(wMax, 200n);

      // Half duration (2 years) -> 1.5x boost (150)
      const wHalf = calculateQuadraticWeight(staked, DEFAULT_QV_CONFIG.maxLockDurationSec / 2);
      assert.equal(wHalf, 150n);

      // Zero tokens -> 0 weight
      assert.equal(calculateQuadraticWeight(0n, 1000), 0n);
    });
  });

  describe('TimeLockedEscrowVault Lifecycle', () => {
    let vault: TimeLockedEscrowVault;
    const now = 1000;
    const releaseTime = 2000;
    const disputeDeadline = 3000;
    const amount = 50_000_000n;

    beforeEach(() => {
      vault = new TimeLockedEscrowVault();
    });

    it('should create agreement with validated parameters', () => {
      const ag = vault.createAgreement({
        id: 'escrow-1',
        depositor: ALICE,
        beneficiary: BOB,
        arbiter: CHARLIE_ARBITER,
        amount,
        releaseTimestampSec: releaseTime,
        disputeDeadlineSec: disputeDeadline,
        currentTimestampSec: now,
      });

      assert.equal(ag.id, 'escrow-1');
      assert.equal(ag.state, 'INITIALIZED');
      assert.equal(ag.amount, amount);
    });

    it('should reject invalid addresses or timestamps', () => {
      assert.throws(
        () =>
          vault.createAgreement({
            id: 'bad-1',
            depositor: '0xinvalid',
            beneficiary: BOB,
            arbiter: CHARLIE_ARBITER,
            amount,
            releaseTimestampSec: releaseTime,
            disputeDeadlineSec: disputeDeadline,
            currentTimestampSec: now,
          }),
        /Invalid depositor/
      );

      // Same depositor and beneficiary
      assert.throws(
        () =>
          vault.createAgreement({
            id: 'bad-2',
            depositor: ALICE,
            beneficiary: ALICE,
            arbiter: CHARLIE_ARBITER,
            amount,
            releaseTimestampSec: releaseTime,
            disputeDeadlineSec: disputeDeadline,
            currentTimestampSec: now,
          }),
        /cannot be the same/
      );

      // Release in the past
      assert.throws(
        () =>
          vault.createAgreement({
            id: 'bad-3',
            depositor: ALICE,
            beneficiary: BOB,
            arbiter: CHARLIE_ARBITER,
            amount,
            releaseTimestampSec: now - 10,
            disputeDeadlineSec: disputeDeadline,
            currentTimestampSec: now,
          }),
        /strictly in the future/
      );
    });

    it('should fund escrow and allow depositor early release', () => {
      vault.createAgreement({
        id: 'escrow-2',
        depositor: ALICE,
        beneficiary: BOB,
        arbiter: CHARLIE_ARBITER,
        amount,
        releaseTimestampSec: releaseTime,
        disputeDeadlineSec: disputeDeadline,
        currentTimestampSec: now,
      });

      // Funding
      const funded = vault.deposit('escrow-2', ALICE, amount);
      assert.equal(funded.state, 'DEPOSITED');
      assert.equal(funded.depositedAmount, amount);

      // Depositor releases early before releaseTime
      const released = vault.releaseFunds('escrow-2', ALICE, now + 100);
      assert.equal(released.state, 'RELEASED');
      assert.equal(released.beneficiaryShare, amount);
      assert.equal(released.depositorShare, 0n);
    });

    it('should enforce timelock for beneficiary release', () => {
      vault.createAgreement({
        id: 'escrow-3',
        depositor: ALICE,
        beneficiary: BOB,
        arbiter: CHARLIE_ARBITER,
        amount,
        releaseTimestampSec: releaseTime,
        disputeDeadlineSec: disputeDeadline,
        currentTimestampSec: now,
      });
      vault.deposit('escrow-3', ALICE, amount);

      // Beneficiary attempts early release -> rejected
      assert.throws(() => vault.releaseFunds('escrow-3', BOB, releaseTime - 50), /timelock active/);

      // Beneficiary releases after releaseTime -> success
      const released = vault.releaseFunds('escrow-3', BOB, releaseTime + 10);
      assert.equal(released.state, 'RELEASED');
      assert.equal(released.beneficiaryShare, amount);
    });

    it('should manage dispute escalation and arbiter split settlement', () => {
      vault.createAgreement({
        id: 'escrow-4',
        depositor: ALICE,
        beneficiary: BOB,
        arbiter: CHARLIE_ARBITER,
        amount,
        releaseTimestampSec: releaseTime,
        disputeDeadlineSec: disputeDeadline,
        currentTimestampSec: now,
      });
      vault.deposit('escrow-4', ALICE, amount);

      // Alice disputes quality of work
      const disputed = vault.raiseDispute('escrow-4', ALICE, releaseTime + 5);
      assert.equal(disputed.state, 'DISPUTED');

      // Unauthorized party cannot resolve
      assert.throws(
        () => vault.resolveDispute('escrow-4', EVE_ATTACKER, 20_000_000n, 30_000_000n, releaseTime + 10),
        /designated arbiter/
      );

      // Mismatched shares total rejected
      assert.throws(
        () => vault.resolveDispute('escrow-4', CHARLIE_ARBITER, 20_000_000n, 20_000_000n, releaseTime + 10),
        /must exactly equal/
      );

      // Charlie resolves 60/40 split
      const resolved = vault.resolveDispute(
        'escrow-4',
        CHARLIE_ARBITER,
        30_000_000n, // Bob
        20_000_000n, // Alice
        releaseTime + 20
      );
      assert.equal(resolved.state, 'RESOLVED');
      assert.equal(resolved.beneficiaryShare, 30_000_000n);
      assert.equal(resolved.depositorShare, 20_000_000n);
    });

    it('should allow beneficiary to refund depositor', () => {
      vault.createAgreement({
        id: 'escrow-5',
        depositor: ALICE,
        beneficiary: BOB,
        arbiter: CHARLIE_ARBITER,
        amount,
        releaseTimestampSec: releaseTime,
        disputeDeadlineSec: disputeDeadline,
        currentTimestampSec: now,
      });
      vault.deposit('escrow-5', ALICE, amount);

      const refunded = vault.refund('escrow-5', BOB, now + 50);
      assert.equal(refunded.state, 'REFUNDED');
      assert.equal(refunded.depositorShare, amount);
      assert.equal(refunded.beneficiaryShare, 0n);
    });
  });
});
