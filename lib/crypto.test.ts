import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  randomHex,
  generateAddress,
  generateTxHash,
  isValidAddress,
  isValidHash,
  isValidNonce,
  isValidSignature,
  formatBalance,
  parseBalance,
  shortenAddress,
} from './crypto.ts'

describe('Crypto Utilities', () => {
  it('generates hex strings of requested length', () => {
    assert.equal(randomHex(0), '0x')
    assert.equal(randomHex(10).length, 12) // '0x' + 10 chars
    assert.ok(isValidAddress(generateAddress()))
    assert.ok(isValidHash(generateTxHash()))
  })

  it('validates Ethereum addresses', () => {
    assert.ok(isValidAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'))
    assert.ok(isValidAddress('0x0000000000000000000000000000000000000000'))
    assert.equal(isValidAddress('0x123'), false)
    assert.equal(isValidAddress('not_an_address'), false)
    assert.equal(isValidAddress(''), false)
  })

  it('validates Ethereum tx hashes', () => {
    const validHash = '0x' + 'a'.repeat(64)
    assert.ok(isValidHash(validHash))
    assert.equal(isValidHash('0x' + 'a'.repeat(63)), false)
    assert.equal(isValidHash('0x' + 'g'.repeat(64)), false)
  })

  it('validates ECDSA signatures', () => {
    const validSig = '0x' + 'f'.repeat(130)
    assert.ok(isValidSignature(validSig))
    assert.equal(isValidSignature('0x' + 'f'.repeat(128)), false)
    assert.equal(isValidSignature('invalid_sig'), false)
  })

  it('validates nonces safely', () => {
    assert.ok(isValidNonce(0))
    assert.ok(isValidNonce('42'))
    assert.ok(isValidNonce(100n))
    assert.equal(isValidNonce(-1), false)
    assert.equal(isValidNonce('-5'), false)
    assert.equal(isValidNonce('abc'), false)
    assert.equal(isValidNonce(2n ** 65n), false)
  })

  it('formats and parses token balances with high precision', () => {
    // 1.5 tokens with 18 decimals
    const parsed = parseBalance('1.5', 18)
    assert.equal(parsed, 1500000000000000000n)
    assert.equal(formatBalance(parsed, 18), '1.5')

    // Fractional only: ".25"
    assert.equal(parseBalance('.25', 6), 250000n)
    assert.equal(formatBalance(250000n, 6), '0.25')

    // Whole number only
    assert.equal(parseBalance('100', 18), 100000000000000000000n)
    assert.equal(formatBalance(100000000000000000000n, 18), '100')

    // Zero balance
    assert.equal(parseBalance('0', 18), 0n)
    assert.equal(formatBalance(0n, 18), '0')
  })

  it('shortens address string safely', () => {
    const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
    assert.equal(shortenAddress(addr), '0xd8dA6B...6045')
    assert.equal(shortenAddress(''), '')
    assert.equal(shortenAddress('0x12'), '0x12')
  })
})
