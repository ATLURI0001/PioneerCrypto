import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getTokens,
  saveTokens,
  getTransactions,
  getWalletAddresses,
  addWalletAddress,
  importAllData,
  clearAllData,
} from './storage.ts'

const store = new Map<string, string>()

;(globalThis as Record<string, unknown>).window = {}
;(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, String(value))
  },
  removeItem: (key: string) => {
    store.delete(key)
  },
  clear: () => {
    store.clear()
  },
}

describe('PioneerCrypto storage utilities', () => {
  beforeEach(() => {
    store.clear()
  })

  it('returns empty arrays when localStorage holds corrupted or non-array JSON', () => {
    store.set('token-creator-tokens', '{"not":"an-array"}')
    store.set('token-creator-transactions_t1', '12345')
    store.set('token-creator-wallet-addresses', '"0xabc"')

    assert.deepEqual(getTokens(), [])
    assert.deepEqual(getTransactions('t1'), [])
    assert.deepEqual(getWalletAddresses(), [])
  })

  it('trims and ignores blank wallet addresses in addWalletAddress', () => {
    addWalletAddress('   ')
    addWalletAddress(' 0x1234 ')
    addWalletAddress('0x1234')
    assert.deepEqual(getWalletAddresses(), ['0x1234'])
  })

  it('rejects non-object importAllData payloads without overwriting valid data', () => {
    saveTokens([{ id: 't1', name: 'Demo', symbol: 'DM' } as never])
    assert.equal(importAllData('[]'), false)
    assert.equal(importAllData('"hello"'), false)
    assert.equal(importAllData('{"tokens": {"bad": 1}}'), false)
    assert.equal(getTokens().length, 1)
  })

  it('skips forbidden prototype-pollution keys and preserves valid arrays in importAllData', () => {
    const payload = JSON.stringify({
      tokens: [{ id: 't2', name: 'Valid', symbol: 'VAL' }],
      transactions: {
        __proto__: [{ id: 'evil' }],
        constructor: [{ id: 'evil2' }],
        t2: [{ id: 'tx1', amount: '10' }],
      },
      walletAddresses: ['0xabc', '', 42],
    })

    assert.equal(importAllData(payload), true)
    assert.equal(getTokens().length, 1)
    assert.equal(getTransactions('__proto__').length, 0)
    assert.equal(getTransactions('t2').length, 1)
    assert.deepEqual(getWalletAddresses(), ['0xabc'])

    clearAllData()
  })
})
