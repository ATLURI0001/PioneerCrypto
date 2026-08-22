import { generateAddress, generateTxHash, generateBlockNumber, generateGasUsed, formatBalance, parseBalance } from './crypto'
import type { ContractState, Transaction, Token } from './types'

export function createInitialContractState(token: Token): ContractState {
  const deployerAddress = generateAddress()
  return {
    name: token.name,
    symbol: token.symbol,
    decimals: token.decimals,
    totalSupply: token.totalSupply,
    balances: {
      [deployerAddress]: token.totalSupply,
    },
    allowances: {},
  }
}

export function balanceOf(state: ContractState, account: string): string {
  return state.balances[account.toLowerCase()] || '0'
}

export function totalSupply(state: ContractState): string {
  return state.totalSupply
}

export function allowance(state: ContractState, owner: string, spender: string): string {
  const ownerLower = owner.toLowerCase()
  const spenderLower = spender.toLowerCase()
  return state.allowances[ownerLower]?.[spenderLower] || '0'
}

export function transfer(
  state: ContractState,
  from: string,
  to: string,
  amount: string
): { success: boolean; newState: ContractState; error?: string } {
  const fromLower = from.toLowerCase()
  const toLower = to.toLowerCase()
  const amountBig = BigInt(amount)
  const fromBalance = BigInt(state.balances[fromLower] || '0')

  if (amountBig <= 0) {
    return { success: false, newState: state, error: 'Amount must be greater than 0' }
  }
  if (fromBalance < amountBig) {
    return { success: false, newState: state, error: 'Insufficient balance' }
  }

  const newState = JSON.parse(JSON.stringify(state)) as ContractState
  newState.balances[fromLower] = (fromBalance - amountBig).toString()
  newState.balances[toLower] = (BigInt(newState.balances[toLower] || '0') + amountBig).toString()

  return { success: true, newState }
}

export function approve(
  state: ContractState,
  owner: string,
  spender: string,
  amount: string
): { success: boolean; newState: ContractState; error?: string } {
  const ownerLower = owner.toLowerCase()
  const spenderLower = spender.toLowerCase()
  const amountBig = BigInt(amount)

  if (amountBig < 0) {
    return { success: false, newState: state, error: 'Amount cannot be negative' }
  }

  const newState = JSON.parse(JSON.stringify(state)) as ContractState
  if (!newState.allowances[ownerLower]) {
    newState.allowances[ownerLower] = {}
  }
  newState.allowances[ownerLower][spenderLower] = amountBig.toString()

  return { success: true, newState }
}

export function transferFrom(
  state: ContractState,
  spender: string,
  from: string,
  to: string,
  amount: string
): { success: boolean; newState: ContractState; error?: string } {
  const spenderLower = spender.toLowerCase()
  const fromLower = from.toLowerCase()
  const toLower = to.toLowerCase()
  const amountBig = BigInt(amount)

  const allowanceAmount = BigInt(state.allowances[fromLower]?.[spenderLower] || '0')
  const fromBalance = BigInt(state.balances[fromLower] || '0')

  if (amountBig <= 0) {
    return { success: false, newState: state, error: 'Amount must be greater than 0' }
  }
  if (allowanceAmount < amountBig) {
    return { success: false, newState: state, error: 'Insufficient allowance' }
  }
  if (fromBalance < amountBig) {
    return { success: false, newState: state, error: 'Insufficient balance' }
  }

  const newState = JSON.parse(JSON.stringify(state)) as ContractState
  newState.balances[fromLower] = (fromBalance - amountBig).toString()
  newState.balances[toLower] = (BigInt(newState.balances[toLower] || '0') + amountBig).toString()
  newState.allowances[fromLower][spenderLower] = (allowanceAmount - amountBig).toString()

  return { success: true, newState }
}

export function increaseAllowance(
  state: ContractState,
  owner: string,
  spender: string,
  addedValue: string
): { success: boolean; newState: ContractState; error?: string } {
  const current = BigInt(allowance(state, owner, spender))
  return approve(state, owner, spender, (current + BigInt(addedValue)).toString())
}

export function decreaseAllowance(
  state: ContractState,
  owner: string,
  spender: string,
  subtractedValue: string
): { success: boolean; newState: ContractState; error?: string } {
  const current = BigInt(allowance(state, owner, spender))
  const sub = BigInt(subtractedValue)
  if (sub > current) {
    return { success: false, newState: state, error: 'Decrease amount exceeds current allowance' }
  }
  return approve(state, owner, spender, (current - sub).toString())
}

export function createTransaction(
  type: Transaction['type'],
  from: string,
  to: string,
  amount: string,
  options?: { spender?: string; owner?: string }
): Transaction {
  return {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    from: from.toLowerCase(),
    to: to.toLowerCase(),
    amount,
    spender: options?.spender?.toLowerCase(),
    owner: options?.owner?.toLowerCase(),
    txHash: generateTxHash(),
    blockNumber: generateBlockNumber(),
    timestamp: Date.now(),
    status: 'success',
    gasUsed: generateGasUsed(),
  }
}

export function formatTokenAmount(amount: string, decimals: number): string {
  return formatBalance(amount, decimals)
}

export function parseTokenAmount(amount: string, decimals: number): bigint {
  return parseBalance(amount, decimals)
}

export function getAllBalances(state: ContractState): Record<string, string> {
  return { ...state.balances }
}

export function getAllAllowances(state: ContractState): Record<string, Record<string, string>> {
  return JSON.parse(JSON.stringify(state.allowances))
}