const HEX_CHARS = '0123456789abcdef'

export function randomHex(length: number): string {
  if (length <= 0) return '0x'
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
  if (!address || chars <= 0 || address.length < chars * 2 + 2) return address || ''
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

export function formatHash(hash: string, chars = 6): string {
  if (!hash || chars <= 0 || hash.length < chars * 2 + 2) return hash || ''
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`
}

export function formatBalance(balance: string | number | bigint, decimals: number): string {
  const dec = Number.isFinite(decimals) ? Math.max(0, Math.floor(decimals)) : 0
  let num: bigint
  try {
    if (typeof balance === 'bigint') {
      num = balance
    } else if (typeof balance === 'number') {
      num = Number.isFinite(balance) ? BigInt(Math.trunc(balance)) : 0n
    } else {
      num = BigInt(String(balance ?? '').replace(/,/g, '').trim() || '0')
    }
  } catch {
    return '0'
  }
  const sign = num < 0n ? '-' : ''
  const absNum = num < 0n ? -num : num
  const divisor = 10n ** BigInt(dec)
  const whole = absNum / divisor
  const fraction = absNum % divisor
  if (fraction === 0n || dec === 0) return `${sign}${whole.toString()}`
  const fracStr = fraction.toString().padStart(dec, '0').replace(/0+$/, '')
  return `${sign}${whole}.${fracStr}`
}

export function parseBalance(balance: string, decimals: number): bigint {
  if (typeof balance !== 'string') return 0n
  const dec = Number.isFinite(decimals) ? Math.max(0, Math.floor(decimals)) : 0
  const clean = balance.trim().replace(/,/g, '')
  if (!clean || clean === '.' || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(clean)) return 0n

  const [rawWhole, rawFraction = ''] = clean.split('.')
  const whole = rawWhole === '' || rawWhole === undefined ? '0' : rawWhole
  const fracPadded = rawFraction.padEnd(dec, '0').slice(0, dec)
  return BigInt(whole) * (10n ** BigInt(dec)) + (fracPadded ? BigInt(fracPadded) : 0n)
}

export function shortenAddress(address: string, start = 6, end = 4): string {
  if (!address) return ''
  if (address.length <= start + end + 2) return address
  return `${address.slice(0, start + 2)}...${address.slice(-end)}`
}

export function isValidAddress(address: string): boolean {
  return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address.trim())
}

export function isValidHash(hash: string): boolean {
  return typeof hash === 'string' && /^0x[a-fA-F0-9]{64}$/.test(hash.trim())
}

export function isValidSignature(sig: string): boolean {
  return typeof sig === 'string' && /^0x[a-fA-F0-9]{130}$/.test(sig.trim())
}

export function isValidNonce(nonce: number | string | bigint): boolean {
  try {
    const val = typeof nonce === 'bigint' ? nonce : BigInt(String(nonce).trim())
    return val >= 0n && val <= (2n ** 64n - 1n)
  } catch {
    return false
  }
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

export function normalizeHexPrefix(value: string): string {
  if (typeof value !== 'string') return '0x'
  const cleaned = value.trim()
  if (!cleaned) return '0x'
  const raw = cleaned.startsWith('0x') || cleaned.startsWith('0X') ? cleaned.slice(2) : cleaned
  if (!/^[0-9a-fA-F]*$/.test(raw)) {
    throw new Error('Invalid hexadecimal string')
  }
  return `0x${raw.toLowerCase()}`
}

export interface TypedDataField {
  name: string
  type: string
}

export function encodeEip712Type(
  primaryType: string,
  types: Record<string, TypedDataField[]>
): string {
  if (!primaryType || !types[primaryType]) {
    throw new Error(`Unknown primaryType: ${primaryType}`)
  }
  const deps = new Set<string>()
  const queue = [primaryType]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (deps.has(current)) continue
    deps.add(current)
    for (const field of types[current] ?? []) {
      const baseType = field.type.replace(/\[[^\]]*\]$/, '')
      if (types[baseType] && !deps.has(baseType)) {
        queue.push(baseType)
      }
    }
  }
  deps.delete(primaryType)
  const ordered = [primaryType, ...Array.from(deps).sort()]
  return ordered
    .map((typeName) => {
      const fields = (types[typeName] ?? [])
        .map((f) => `${f.type} ${f.name}`)
        .join(',')
      return `${typeName}(${fields})`
    })
    .join('')
}
