import test from 'node:test'
import assert from 'node:assert/strict'
import {
  balanceOf,
  allowance,
  transfer,
  approve,
  transferFrom,
  increaseAllowance,
  decreaseAllowance,
  mint,
  burn,
  createInitialContractState,
  createTransaction,
} from './contract.ts'
import type { ContractState } from './types.ts'

const initialMockState: ContractState = {
  name: 'TestToken',
  symbol: 'TTK',
  decimals: 18,
  totalSupply: '1000000',
  balances: {
    '0xalice': '1000',
    '0xbob': '500',
  },
  allowances: {
    '0xalice': {
      '0xcharlie': '200',
    },
  },
}

test('Contract state reading helpers guard null or invalid addresses', () => {
  assert.equal(balanceOf(initialMockState, '0xalice'), '1000')
  assert.equal(balanceOf(initialMockState, '0xALICE'), '1000')
  assert.equal(balanceOf(initialMockState, '0xunknown'), '0')
  assert.equal(balanceOf(initialMockState, '' as any), '0')
  assert.equal(balanceOf(initialMockState, null as any), '0')

  assert.equal(allowance(initialMockState, '0xalice', '0xcharlie'), '200')
  assert.equal(allowance(initialMockState, '0xALICE', '0xCHARLIE'), '200')
  assert.equal(allowance(initialMockState, '0xalice', '0xbob'), '0')
  assert.equal(allowance(initialMockState, null as any, '0xcharlie'), '0')
})

test('transfer guards against invalid amounts, non-string addresses, and insufficient balances', () => {
  // Valid transfer
  const res1 = transfer(initialMockState, '0xalice', '0xbob', '100')
  assert.equal(res1.success, true)
  assert.equal(res1.newState.balances['0xalice'], '900')
  assert.equal(res1.newState.balances['0xbob'], '600')

  // Zero or negative amounts
  assert.equal(transfer(initialMockState, '0xalice', '0xbob', '0').success, false)
  assert.equal(transfer(initialMockState, '0xalice', '0xbob', '-50').success, false)

  // Malformed or non-numeric amount string
  assert.equal(transfer(initialMockState, '0xalice', '0xbob', 'abc').success, false)
  assert.equal(transfer(initialMockState, '0xalice', '0xbob', '').success, false)

  // Insufficient balance
  assert.equal(transfer(initialMockState, '0xalice', '0xbob', '5000').success, false)

  // Missing or invalid address
  assert.equal(transfer(initialMockState, null as any, '0xbob', '100').success, false)
  assert.equal(transfer(initialMockState, '0xalice', undefined as any, '100').success, false)
})

test('approve and allowance manipulation guards against malformed values', () => {
  // Approve valid amount
  const app1 = approve(initialMockState, '0xalice', '0xbob', '300')
  assert.equal(app1.success, true)
  assert.equal(app1.newState.allowances['0xalice']['0xbob'], '300')

  // Negative amount rejected
  assert.equal(approve(initialMockState, '0xalice', '0xbob', '-10').success, false)
  // Malformed amount rejected
  assert.equal(approve(initialMockState, '0xalice', '0xbob', 'invalid').success, false)
  // Missing addresses
  assert.equal(approve(initialMockState, null as any, '0xbob', '50').success, false)

  // increaseAllowance guards
  const inc = increaseAllowance(initialMockState, '0xalice', '0xcharlie', '50')
  assert.equal(inc.success, true)
  assert.equal(inc.newState.allowances['0xalice']['0xcharlie'], '250')
  assert.equal(increaseAllowance(initialMockState, '0xalice', '0xcharlie', 'bad').success, false)

  // decreaseAllowance guards
  const dec = decreaseAllowance(initialMockState, '0xalice', '0xcharlie', '50')
  assert.equal(dec.success, true)
  assert.equal(dec.newState.allowances['0xalice']['0xcharlie'], '150')
  assert.equal(decreaseAllowance(initialMockState, '0xalice', '0xcharlie', '500').success, false)
})

test('transferFrom guards allowances, balances, and malformed inputs', () => {
  const tf = transferFrom(initialMockState, '0xcharlie', '0xalice', '0xbob', '100')
  assert.equal(tf.success, true)
  assert.equal(tf.newState.balances['0xalice'], '900')
  assert.equal(tf.newState.balances['0xbob'], '600')
  assert.equal(tf.newState.allowances['0xalice']['0xcharlie'], '100')

  // Exceeds allowance
  assert.equal(transferFrom(initialMockState, '0xcharlie', '0xalice', '0xbob', '300').success, false)
  // Malformed amount
  assert.equal(transferFrom(initialMockState, '0xcharlie', '0xalice', '0xbob', 'not_a_num').success, false)
  // Missing addresses
  assert.equal(transferFrom(initialMockState, null as any, '0xalice', '0xbob', '10').success, false)
})

test('mint and burn update total supply and balances with strict bounds checks', () => {
  // Mint increases recipient balance and total supply
  const m1 = mint(initialMockState, '0xbob', '400')
  assert.equal(m1.success, true)
  assert.equal(m1.newState.balances['0xbob'], '900')
  assert.equal(m1.newState.totalSupply, '1000400')

  // Mint guards against invalid inputs
  assert.equal(mint(initialMockState, '', '100').success, false)
  assert.equal(mint(initialMockState, '0xbob', '0').success, false)
  assert.equal(mint(initialMockState, '0xbob', '-50').success, false)
  assert.equal(mint(initialMockState, '0xbob', 'invalid').success, false)

  // Burn decreases holder balance and total supply
  const b1 = burn(initialMockState, '0xalice', '300')
  assert.equal(b1.success, true)
  assert.equal(b1.newState.balances['0xalice'], '700')
  assert.equal(b1.newState.totalSupply, '999700')

  // Burn guards against overdraft and excessive supply burn
  assert.equal(burn(initialMockState, '0xalice', '2000').success, false)
  assert.equal(burn(initialMockState, '0xalice', '0').success, false)
  assert.equal(burn(initialMockState, '0xalice', '-10').success, false)
  assert.equal(burn(initialMockState, null as any, '100').success, false)
})

test('createInitialContractState and createTransaction normalize addresses and guard nulls', () => {
  const token = {
    id: 'tok1',
    name: 'Pioneer',
    symbol: 'PIO',
    totalSupply: '500000',
    decimals: 18,
    description: 'Test',
    logo: null,
    createdAt: Date.now(),
    deployedAt: null,
    contractAddress: null,
    txHash: null,
    blockNumber: null,
    gasUsed: null,
    network: 'sepolia',
  }

  const s1 = createInitialContractState(token, '0xDeployerUpper')
  assert.equal(s1.balances['0xdeployerupper'], '500000')
  assert.equal(s1.name, 'Pioneer')

  const tx = createTransaction('mint', null as any, '0xRecipient', '250', { spender: '0xSPENDER' })
  assert.equal(tx.from, '')
  assert.equal(tx.to, '0xrecipient')
  assert.equal(tx.amount, '250')
  assert.equal(tx.spender, '0xspender')
  assert.equal(tx.type, 'mint')
})
