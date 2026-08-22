import type { Token, Transaction, TokenMetadata } from '@/lib/types'

const STORAGE_KEYS = {
  TOKENS: 'token-creator-tokens',
  TRANSACTIONS: 'token-creator-transactions',
  WALLET_ADDRESSES: 'token-creator-wallet-addresses',
} as const

export function getTokens(): Token[] {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(STORAGE_KEYS.TOKENS)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
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
  if (typeof window === 'undefined') return []
  try {
    const key = tokenId ? `${STORAGE_KEYS.TRANSACTIONS}_${tokenId}` : STORAGE_KEYS.TRANSACTIONS
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
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
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(STORAGE_KEYS.WALLET_ADDRESSES)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function saveWalletAddresses(addresses: string[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESSES, JSON.stringify(addresses))
}

export function addWalletAddress(address: string): void {
  const addresses = getWalletAddresses()
  if (!addresses.includes(address)) {
    addresses.push(address)
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
    if (data.tokens) saveTokens(data.tokens)
    if (data.transactions) {
      Object.entries(data.transactions).forEach(([tokenId, txs]) => {
        saveTransactions(tokenId, txs as Transaction[])
      })
    }
    if (data.walletAddresses) saveWalletAddresses(data.walletAddresses)
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