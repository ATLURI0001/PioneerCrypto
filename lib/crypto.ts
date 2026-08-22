const HEX_CHARS = '0123456789abcdef'

export function randomHex(length: number): string {
  let result = '0x'
  for (let i = 0; i < length; i++) {
    result += HEX_CHARS[Math.floor(Math.random() * 16)]
  }
  return result
}

export function generateAddress(): string {
  return randomHex(40)
}

export function generateTxHash(): string {
  return randomHex(64)
}

export function generateBlockNumber(): number {
  return 18000000 + Math.floor(Math.random() * 2000000)
}

export function generateGasUsed(): number {
  return 45000 + Math.floor(Math.random() * 30000)
}

export function generateTokenId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `tk_${timestamp}_${random}`
}

export function formatAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

export function formatHash(hash: string, chars = 6): string {
  if (!hash || hash.length < chars * 2 + 2) return hash
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`
}

export function formatBalance(balance: string | number, decimals: number): string {
  const num = typeof balance === 'string' ? BigInt(balance) : BigInt(balance)
  const divisor = BigInt(10 ** decimals)
  const whole = num / divisor
  const fraction = num % divisor
  if (fraction === BigInt(0)) return whole.toString()
  const fracStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole}.${fracStr}`
}

export function parseBalance(balance: string, decimals: number): bigint {
  const [whole, fraction = ''] = balance.split('.')
  const fracPadded = fraction.padEnd(decimals, '0').slice(0, decimals)
  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(fracPadded)
}

export function shortenAddress(address: string, start = 6, end = 4): string {
  if (!address) return ''
  if (address.length <= start + end + 2) return address
  return `${address.slice(0, start + 2)}...${address.slice(-end)}`
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

export function isValidHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash)
}

export function checksumAddress(address: string): string {
  if (!isValidAddress(address)) return address
  const lower = address.toLowerCase().slice(2)
  let result = '0x'
  for (let i = 0; i < lower.length; i++) {
    const char = lower[i]
    const hash = simpleHash(lower.slice(0, i) + char)
    result += parseInt(hash, 16) > 7 ? char.toUpperCase() : char
  }
  return result
}

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}