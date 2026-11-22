import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ReentrancyGuard,
  ReentrancyGuardError,
  FlashLoanMitigationCircuit,
  FlashLoanMitigationError,
} from './reentrancy_guard.ts';

describe('Reentrancy Guard & Mutex Protection', () => {
  test('executes routine and releases lock upon completion', async () => {
    const guard = new ReentrancyGuard();
    assert.equal(guard.isLocked, false);

    const result = await guard.nonReentrant(async () => {
      assert.equal(guard.isLocked, true);
      return 42;
    });

    assert.equal(result, 42);
    assert.equal(guard.isLocked, false);
    assert.equal(guard.getTelemetry().invocationCount, 1);
    assert.equal(guard.getTelemetry().interceptions, 0);
  });

  test('prevents reentrant self-invocation and nested calls', async () => {
    const guard = new ReentrancyGuard();

    await assert.rejects(
      async () => {
        await guard.nonReentrant(async () => {
          // Attempt nested reentrancy
          await guard.nonReentrant(async () => {
            return 'nested';
          });
        });
      },
      (err: any) => {
        assert.ok(err instanceof ReentrancyGuardError);
        assert.equal(err.message, 'ReentrancyGuard: reentrant call detected');
        return true;
      }
    );

    assert.equal(guard.isLocked, false);
    assert.equal(guard.getTelemetry().interceptions, 1);
  });

  test('guarantees lock release when inner routine throws exception', async () => {
    const guard = new ReentrancyGuard();

    await assert.rejects(async () => {
      await guard.nonReentrant(async () => {
        throw new Error('Application failure');
      });
    });

    assert.equal(guard.isLocked, false);

    // Subsequent call should succeed without being blocked
    const subsequent = await guard.nonReentrant(async () => 'recovered');
    assert.equal(subsequent, 'recovered');
  });
});

describe('Flash Loan Attack Mitigation Circuit', () => {
  const alice = '0x1111111111111111111111111111111111111111';
  const bob = '0x2222222222222222222222222222222222222222';

  test('calculates correct protocol fee according to basis points', () => {
    const circuit = new FlashLoanMitigationCircuit({ feeBps: 9 }); // 0.09%
    const borrow = 1_000_000n;
    const fee = circuit.calculateFee(borrow);
    // 1,000,000 * 9 / 10,000 = 900
    assert.equal(fee, 900n);
  });

  test('executes successful flash loan with repayment and fee', async () => {
    const circuit = new FlashLoanMitigationCircuit({ feeBps: 10, maxBorrowFraction: 0.2 });
    const reserve = 1_000_000n;
    const borrow = 100_000n; // 10% of reserve (< 20% limit)

    const result = await circuit.executeFlashLoan(alice, borrow, reserve, 100, async (amount, fee) => {
      // Repay principal + fee
      return amount + fee;
    });

    assert.equal(result.fee, 100n);
    assert.equal(result.returnedAmount, 100_100n);

    const telemetry = circuit.getTelemetry();
    assert.equal(telemetry.totalLoansVolume, '100000');
    assert.equal(telemetry.totalFeesCollected, '100');
    assert.equal(telemetry.blockedAttacksCount, 0);
  });

  test('rejects borrow amount exceeding pool capacity limit', async () => {
    const circuit = new FlashLoanMitigationCircuit({ maxBorrowFraction: 0.1 });
    const reserve = 100_000n;
    const borrow = 25_000n; // 25% > 10% limit

    await assert.rejects(
      async () => {
        await circuit.executeFlashLoan(alice, borrow, reserve, 101, async (amt, fee) => amt + fee);
      },
      (err: any) => {
        assert.ok(err instanceof FlashLoanMitigationError);
        assert.match(err.message, /exceeds pool capacity limit/);
        return true;
      }
    );

    assert.equal(circuit.getTelemetry().blockedAttacksCount, 1);
  });

  test('reverts when borrower fails to return sufficient funds (invariant breach)', async () => {
    const circuit = new FlashLoanMitigationCircuit({ feeBps: 10 });
    const reserve = 1_000_000n;
    const borrow = 50_000n;

    await assert.rejects(
      async () => {
        await circuit.executeFlashLoan(bob, borrow, reserve, 102, async (amt, _fee) => {
          // Returning only borrowed amount without fee
          return amt;
        });
      },
      (err: any) => {
        assert.ok(err instanceof FlashLoanMitigationError);
        assert.match(err.message, /Flash loan invariant failed/);
        return true;
      }
    );

    assert.equal(circuit.getTelemetry().blockedAttacksCount, 1);
  });

  test('enforces same-block action cooldown for caller', async () => {
    const circuit = new FlashLoanMitigationCircuit({ sameBlockActionLock: true });
    const reserve = 1_000_000n;
    const borrow = 10_000n;

    // First loan in block 105 succeeds
    await circuit.executeFlashLoan(alice, borrow, reserve, 105, async (amt, fee) => amt + fee);

    // Second loan by same user in same block 105 must fail
    await assert.rejects(
      async () => {
        await circuit.executeFlashLoan(alice, borrow, reserve, 105, async (amt, fee) => amt + fee);
      },
      (err: any) => {
        assert.ok(err instanceof FlashLoanMitigationError);
        assert.match(err.message, /Flash loan cooldown/);
        return true;
      }
    );

    // Loan in next block 106 succeeds
    const nextBlock = await circuit.executeFlashLoan(alice, borrow, reserve, 106, async (amt, fee) => amt + fee);
    assert.ok(nextBlock);
  });

  test('validates oracle price deviation against TWAP to mitigate manipulation', () => {
    const circuit = new FlashLoanMitigationCircuit({ maxPriceDeviationBps: 200 }); // 2% max deviation

    // 1% deviation: 101 vs 100 -> valid
    assert.equal(circuit.validateOracleDeviation(101, 100), true);

    // 5% deviation: 105 vs 100 -> breach
    assert.throws(
      () => circuit.validateOracleDeviation(105, 100),
      (err: any) => {
        assert.ok(err instanceof FlashLoanMitigationError);
        assert.match(err.message, /Oracle price deviation breach/);
        return true;
      }
    );

    // Zero or negative price checks
    assert.throws(() => circuit.validateOracleDeviation(0, 100), /strictly positive/);
  });
});
