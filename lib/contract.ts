import { generateAddress, generateTxHash, generateBlockNumber, generateGasUsed, formatBalance, parseBalance } from './crypto.ts'
import type { ContractState, Transaction, Token } from './types.ts'

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
  if (!account || typeof account !== 'string') return '0'
  return state.balances[account.toLowerCase()] || '0'
}

export function totalSupply(state: ContractState): string {
  return state.totalSupply
}

export function allowance(state: ContractState, owner: string, spender: string): string {
  if (!owner || typeof owner !== 'string' || !spender || typeof spender !== 'string') return '0'
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
  if (!state || !state.balances) {
    return { success: false, newState: state, error: 'Invalid contract state' }
  }
  if (!from || typeof from !== 'string' || !to || typeof to !== 'string') {
    return { success: false, newState: state, error: 'Invalid address' }
  }
  let amountBig: bigint
  try {
    amountBig = BigInt(amount)
  } catch {
    return { success: false, newState: state, error: 'Invalid amount' }
  }

  if (amountBig <= 0n) {
    return { success: false, newState: state, error: 'Amount must be greater than 0' }
  }

  const fromLower = from.toLowerCase()
  const toLower = to.toLowerCase()
  const fromBalance = BigInt(state.balances[fromLower] || '0')

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
  if (!state || !state.allowances) {
    return { success: false, newState: state, error: 'Invalid contract state' }
  }
  if (!owner || typeof owner !== 'string' || !spender || typeof spender !== 'string') {
    return { success: false, newState: state, error: 'Invalid address' }
  }
  let amountBig: bigint
  try {
    amountBig = BigInt(amount)
  } catch {
    return { success: false, newState: state, error: 'Invalid amount' }
  }

  if (amountBig < 0n) {
    return { success: false, newState: state, error: 'Amount cannot be negative' }
  }

  const ownerLower = owner.toLowerCase()
  const spenderLower = spender.toLowerCase()
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
  if (!state || !state.balances || !state.allowances) {
    return { success: false, newState: state, error: 'Invalid contract state' }
  }
  if (
    !spender ||
    typeof spender !== 'string' ||
    !from ||
    typeof from !== 'string' ||
    !to ||
    typeof to !== 'string'
  ) {
    return { success: false, newState: state, error: 'Invalid address' }
  }
  let amountBig: bigint
  try {
    amountBig = BigInt(amount)
  } catch {
    return { success: false, newState: state, error: 'Invalid amount' }
  }

  if (amountBig <= 0n) {
    return { success: false, newState: state, error: 'Amount must be greater than 0' }
  }

  const spenderLower = spender.toLowerCase()
  const fromLower = from.toLowerCase()
  const toLower = to.toLowerCase()

  const allowanceAmount = BigInt(state.allowances[fromLower]?.[spenderLower] || '0')
  const fromBalance = BigInt(state.balances[fromLower] || '0')

  if (allowanceAmount < amountBig) {
    return { success: false, newState: state, error: 'Insufficient allowance' }
  }
  if (fromBalance < amountBig) {
    return { success: false, newState: state, error: 'Insufficient balance' }
  }

  const newState = JSON.parse(JSON.stringify(state)) as ContractState
  newState.balances[fromLower] = (fromBalance - amountBig).toString()
  newState.balances[toLower] = (BigInt(newState.balances[toLower] || '0') + amountBig).toString()
  if (!newState.allowances[fromLower]) {
    newState.allowances[fromLower] = {}
  }
  newState.allowances[fromLower][spenderLower] = (allowanceAmount - amountBig).toString()

  return { success: true, newState }
}

export function increaseAllowance(
  state: ContractState,
  owner: string,
  spender: string,
  addedValue: string
): { success: boolean; newState: ContractState; error?: string } {
  let addBig: bigint
  try {
    addBig = BigInt(addedValue)
  } catch {
    return { success: false, newState: state, error: 'Invalid added value' }
  }
  if (addBig < 0n) {
    return { success: false, newState: state, error: 'Added value cannot be negative' }
  }
  const current = BigInt(allowance(state, owner, spender))
  return approve(state, owner, spender, (current + addBig).toString())
}

export function decreaseAllowance(
  state: ContractState,
  owner: string,
  spender: string,
  subtractedValue: string
): { success: boolean; newState: ContractState; error?: string } {
  let subBig: bigint
  try {
    subBig = BigInt(subtractedValue)
  } catch {
    return { success: false, newState: state, error: 'Invalid subtracted value' }
  }
  if (subBig < 0n) {
    return { success: false, newState: state, error: 'Subtracted value cannot be negative' }
  }
  const current = BigInt(allowance(state, owner, spender))
  if (subBig > current) {
    return { success: false, newState: state, error: 'Decrease amount exceeds current allowance' }
  }
  return approve(state, owner, spender, (current - subBig).toString())
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