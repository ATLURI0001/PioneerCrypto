import type { Token, Transaction, TokenMetadata } from '@/lib/types'

const STORAGE_KEYS = {
  TOKENS: 'token-creator-tokens',
  TRANSACTIONS: 'token-creator-transactions',
  WALLET_ADDRESSES: 'token-creator-wallet-addresses',
} as const

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function readStoredArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(key)
    if (!data) return []
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export function getTokens(): Token[] {
  return readStoredArray<Token>(STORAGE_KEYS.TOKENS)
}

export function saveTokens(tokens: Token[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens))
}

export function getToken(id: string): Token | null {
  const tokens = getTokens()
  return tokens.find(t => t.id === id) || null
}

export function addToken(token: Token): void {
  const tokens = getTokens()
  tokens.unshift(token)
  saveTokens(tokens)
}

export function updateToken(id: string, updates: Partial<Token>): void {
  const tokens = getTokens()
  const index = tokens.findIndex(t => t.id === id)
  if (index !== -1) {
    tokens[index] = { ...tokens[index], ...updates }
    saveTokens(tokens)
  }
}

export function deleteToken(id: string): void {
  const tokens = getTokens()
  const filtered = tokens.filter(t => t.id !== id)
  saveTokens(filtered)
}

export function getTransactions(tokenId?: string): Transaction[] {
  const key = tokenId ? `${STORAGE_KEYS.TRANSACTIONS}_${tokenId}` : STORAGE_KEYS.TRANSACTIONS
  return readStoredArray<Transaction>(key)
}

export function saveTransactions(tokenId: string, transactions: Transaction[]): void {
  if (typeof window === 'undefined') return
  const key = `${STORAGE_KEYS.TRANSACTIONS}_${tokenId}`
  localStorage.setItem(key, JSON.stringify(transactions))
}

export function addTransaction(tokenId: string, transaction: Transaction): void {
  const transactions = getTransactions(tokenId)
  transactions.unshift(transaction)
  saveTransactions(tokenId, transactions)
}

export function getWalletAddresses(): string[] {
  return readStoredArray<string>(STORAGE_KEYS.WALLET_ADDRESSES)
}

export function saveWalletAddresses(addresses: string[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESSES, JSON.stringify(addresses))
}

export function addWalletAddress(address: string): void {
  const normalized = address.trim()
  if (!normalized) return
  const addresses = getWalletAddresses()
  if (!addresses.includes(normalized)) {
    addresses.push(normalized)
    saveWalletAddresses(addresses)
  }
}

export function exportAllData(): string {
  const tokens = getTokens()
  const allTransactions: Record<string, Transaction[]> = {}
  tokens.forEach(t => {
    allTransactions[t.id] = getTransactions(t.id)
  })
  const walletAddresses = getWalletAddresses()
  return JSON.stringify({ tokens, transactions: allTransactions, walletAddresses }, null, 2)
}

export function importAllData(json: string): boolean {
  try {
    const data = JSON.parse(json)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false

    if (data.tokens !== undefined) {
      if (!Array.isArray(data.tokens)) return false
      saveTokens(data.tokens)
    }
    if (data.transactions !== undefined) {
      if (!data.transactions || typeof data.transactions !== 'object' || Array.isArray(data.transactions)) {
        return false
      }
      for (const [tokenId, txs] of Object.entries(data.transactions)) {
        if (FORBIDDEN_KEYS.has(tokenId) || !tokenId.trim() || !Array.isArray(txs)) continue
        saveTransactions(tokenId, txs as Transaction[])
      }
    }
    if (data.walletAddresses !== undefined) {
      if (!Array.isArray(data.walletAddresses)) return false
      const validAddresses = data.walletAddresses.filter(
        (addr: unknown): addr is string => typeof addr === 'string' && addr.trim().length > 0,
      )
      saveWalletAddresses(validAddresses)
    }
    return true
  } catch {
    return false
  }
}

export function clearAllData(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEYS.TOKENS)
  localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESSES)
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(STORAGE_KEYS.TRANSACTIONS)) {
      localStorage.removeItem(key)
    }
  })
}