import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateNextBaseFee,
  calculateTransactionCost,
  validateEip1559Fees,
} from './eip1559.ts'

describe('EIP-1559 Fee Calculations & Invariants', () => {
  it('should maintain base fee unchanged when gas used exactly matches target', () => {
    const nextBaseFee = calculateNextBaseFee({
      parentBaseFee: 100_000_000_000n, // 100 gwei
      parentGasUsed: 15_000_000n,      // exact target
    })
    assert.equal(nextBaseFee, 100_000_000_000n)
  })

  it('should increase base fee up to 12.5% when block is 100% full', () => {
    // 30M gas used vs 15M target -> max 12.5% increase = +12.5 gwei on 100 gwei -> 112.5 gwei
    const nextBaseFee = calculateNextBaseFee({
      parentBaseFee: 100_000_000_000n,
      parentGasUsed: 30_000_000n,
    })
    assert.equal(nextBaseFee, 112_500_000_000n)
  })

  it('should decrease base fee up to 12.5% when block is empty', () => {
    // 0 gas used vs 15M target -> max 12.5% decrease = -12.5 gwei on 100 gwei -> 87.5 gwei
    const nextBaseFee = calculateNextBaseFee({
      parentBaseFee: 100_000_000_000n,
      parentGasUsed: 0n,
    })
    assert.equal(nextBaseFee, 87_500_000_000n)
  })

  it('should accurately compute effective gas price and total transaction costs', () => {
    const cost = calculateTransactionCost({
      baseFee: 50_000_000_000n,           // 50 gwei baseFee
      maxFeePerGas: 100_000_000_000n,      // 100 gwei maxFee
      maxPriorityFeePerGas: 2_000_000_000n,// 2 gwei tip
      gasLimit: 21_000n,                   // Standard transfer
      value: 1_000_000_000_000_000_000n,   // 1 ETH
    })

    // Effective price = 50 gwei + 2 gwei = 52 gwei
    assert.equal(cost.effectiveGasPrice, 52_000_000_000n)
    assert.equal(cost.priorityFeePerGas, 2_000_000_000n)
    // Gas cost = 21,000 * 52 gwei = 1,092,000 gwei = 1,092,000,000,000,000 wei
    assert.equal(cost.totalGasCost, 1_092_000_000_000_000n)
    assert.equal(cost.totalValue, 1_000_000_000_000_000_000n)
  })

  it('should cap priority tip when maxFeePerGas - baseFee is less than maxPriorityFeePerGas', () => {
    const cost = calculateTransactionCost({
      baseFee: 90_000_000_000n,           // 90 gwei baseFee
      maxFeePerGas: 95_000_000_000n,      // 95 gwei maxFee (only 5 gwei room for tip)
      maxPriorityFeePerGas: 10_000_000_000n,// 10 gwei requested tip
      gasLimit: 50_000n,
    })

    // Tip is capped at 5 gwei
    assert.equal(cost.priorityFeePerGas, 5_000_000_000n)
    assert.equal(cost.effectiveGasPrice, 95_000_000_000n)
  })

  it('should reject invalid fee relations and malformed inputs', () => {
    // maxPriorityFee > maxFeePerGas
    assert.throws(
      () =>
        calculateTransactionCost({
          baseFee: 10n,
          maxFeePerGas: 20n,
          maxPriorityFeePerGas: 30n,
          gasLimit: 21_000n,
        }),
      /maxPriorityFeePerGas cannot exceed maxFeePerGas/
    )

    // maxFeePerGas < baseFee
    assert.throws(
      () =>
        calculateTransactionCost({
          baseFee: 50n,
          maxFeePerGas: 40n,
          maxPriorityFeePerGas: 2n,
          gasLimit: 21_000n,
        }),
      /maxFeePerGas is lower than current block baseFee/
    )

    // validateEip1559Fees validator tests
    const valid = validateEip1559Fees(50n, 100n, 2n)
    assert.equal(valid.valid, true)

    const invalidMax = validateEip1559Fees(50n, 40n, 2n)
    assert.equal(invalidMax.valid, false)
    assert.match(invalidMax.reason!, /below baseFee/)

    const invalidTip = validateEip1559Fees(50n, 100n, 120n)
    assert.equal(invalidTip.valid, false)
    assert.match(invalidTip.reason!, /exceeds maxFeePerGas/)
  })
})
