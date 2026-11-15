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
  normalizeHexPrefix,
  encodeEip712Type,
  isZeroAddress,
  validateChainId,
  parseUnits,
  formatUnits,
  validateFunctionSelector,
  isContractBytecode,
  padAbiWord,
  encodeFunctionCall,
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

  it('handles negative balances, NaN decimals, and malformed inputs safely', () => {
    assert.equal(formatBalance('-1500', 3), '-1.5')
    assert.equal(formatBalance('-1000', 3), '-1')
    assert.equal(formatBalance('500', Number.NaN), '500')
    assert.equal(formatBalance('not_a_number', 18), '0')

    assert.equal(parseBalance('1.2.3', 18), 0n)
    assert.equal(parseBalance('abc', 18), 0n)
    assert.equal(parseBalance('-5.0', 18), 0n)
    assert.equal(parseBalance('42', Number.NaN), 42n)
  })

  it('normalizes hex prefixes and encodes EIP-712 structured types', () => {
    assert.equal(normalizeHexPrefix('  0XAbCd1234 '), '0xabcd1234')
    assert.equal(normalizeHexPrefix('deadBEEF'), '0xdeadbeef')
    assert.equal(normalizeHexPrefix(''), '0x')
    assert.throws(() => normalizeHexPrefix('0xZZZZ'), /Invalid hexadecimal string/)

    const types = {
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' },
      ],
      Mail: [
        { name: 'from', type: 'Person' },
        { name: 'to', type: 'Person[]' },
        { name: 'contents', type: 'string' },
      ],
    }
    assert.equal(
      encodeEip712Type('Mail', types),
      'Mail(Person from,Person[] to,string contents)Person(string name,address wallet)'
    )
    assert.throws(() => encodeEip712Type('MissingType', types), /Unknown primaryType/)
  })

  it('validates zero address and standard chain IDs', () => {
    assert.ok(isZeroAddress('0x0000000000000000000000000000000000000000'))
    assert.ok(isZeroAddress('0x0000000000000000000000000000000000000000'.toUpperCase()))
    assert.equal(isZeroAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'), false)
    assert.equal(isZeroAddress('invalid_address'), false)

    assert.ok(validateChainId(1)) // Ethereum Mainnet
    assert.ok(validateChainId(137)) // Polygon
    assert.ok(validateChainId('8453')) // Base
    assert.ok(validateChainId(11155111n)) // Sepolia
    assert.equal(validateChainId(0), false)
    assert.equal(validateChainId(-1), false)
    assert.equal(validateChainId(1.5), false)
    assert.equal(validateChainId('abc'), false)
    assert.equal(validateChainId(Number.NaN), false)
    assert.equal(validateChainId(Number.POSITIVE_INFINITY), false)
  })

  it('parses and formats standard Ethereum units correctly', () => {
    assert.equal(parseUnits('1', 'ether'), 1000000000000000000n)
    assert.equal(parseUnits('50', 'gwei'), 50000000000n)
    assert.equal(parseUnits('123', 'wei'), 123n)
    assert.equal(parseUnits('2.5', 6), 2500000n)

    assert.equal(formatUnits(1000000000000000000n, 'ether'), '1')
    assert.equal(formatUnits(50000000000n, 'gwei'), '50')
    assert.equal(formatUnits(123n, 'wei'), '123')
    assert.equal(formatUnits(2500000n, 6), '2.5')
  })

  it('validates selectors, bytecode, and encodes ABI function calls', () => {
    // 4-byte selector validation
    assert.ok(validateFunctionSelector('0xa9059cbb')) // transfer(address,uint256)
    assert.ok(validateFunctionSelector('0x095ea7b3')) // approve(address,uint256)
    assert.equal(validateFunctionSelector('0xa9059cb'), false) // 7 hex chars
    assert.equal(validateFunctionSelector('a9059cbb'), false) // missing 0x
    assert.equal(validateFunctionSelector('0xa9059cbbff'), false) // 10 hex chars

    // Bytecode validation
    assert.ok(isContractBytecode('0x608060405234801561001057600080fd5b50'))
    assert.equal(isContractBytecode('0x608'), false) // odd number of hex digits
    assert.equal(isContractBytecode('0x'), false) // empty

    // ABI Word padding
    assert.equal(padAbiWord(true), '0000000000000000000000000000000000000000000000000000000000000001')
    assert.equal(padAbiWord(100n), '0000000000000000000000000000000000000000000000000000000000000064')
    assert.equal(
      padAbiWord('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045'
    )

    // Function call encoding: transfer(vitalik, 1000 tokens with 18 decimals)
    const calldata = encodeFunctionCall('0xa9059cbb', [
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      1000n * 10n ** 18n,
    ])
    assert.ok(calldata.startsWith('0xa9059cbb'))
    assert.equal(calldata.length, 10 + 64 + 64)
  })
})
