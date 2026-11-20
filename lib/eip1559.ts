/**
 * EIP-1559 Fee Market Calculation, Validation, and Transaction Cost Estimator.
 */

export interface Eip1559Parameters {
  baseFeeMaxChangeDenominator?: bigint
  elasticityMultiplier?: bigint
  targetGasLimit?: bigint
  minBaseFee?: bigint
}

export const DEFAULT_EIP1559_PARAMS: Required<Eip1559Parameters> = {
  baseFeeMaxChangeDenominator: 8n,
  elasticityMultiplier: 2n,
  targetGasLimit: 15_000_000n, // Default target block gas (half of 30M limit)
  minBaseFee: 1n,              // Minimum 1 wei
}

export interface FeeEstimateInput {
  parentBaseFee: bigint | string | number
  parentGasUsed: bigint | string | number
  parentGasLimit?: bigint | string | number
  customParams?: Eip1559Parameters
}

export interface TransactionFeeInput {
  baseFee: bigint | string | number
  maxFeePerGas: bigint | string | number
  maxPriorityFeePerGas: bigint | string | number
  gasLimit: bigint | string | number
  value?: bigint | string | number
}

export interface TransactionCostBreakdown {
  effectiveGasPrice: bigint
  priorityFeePerGas: bigint
  baseFeePerGas: bigint
  totalGasCost: bigint
  totalValue: bigint
  totalMaxCost: bigint
}

function toBigIntSafe(val: bigint | string | number | undefined, fieldName: string): bigint {
  if (typeof val === 'bigint') {
    if (val < 0n) throw new Error(`${fieldName} cannot be negative`)
    return val
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || val < 0) throw new Error(`${fieldName} must be a non-negative finite number`)
    return BigInt(Math.trunc(val))
  }
  if (typeof val === 'string') {
    const clean = val.replace(/,/g, '').trim()
    if (!clean || !/^\d+$/.test(clean)) throw new Error(`${fieldName} contains invalid characters`)
    return BigInt(clean)
  }
  throw new Error(`${fieldName} is missing or undefined`)
}

/**
 * Calculates the next block base fee according to EIP-1559 consensus specifications.
 */
export function calculateNextBaseFee(input: FeeEstimateInput): bigint {
  const params = { ...DEFAULT_EIP1559_PARAMS, ...(input.customParams ?? {}) }
  const parentBaseFee = toBigIntSafe(input.parentBaseFee, 'parentBaseFee')
  const parentGasUsed = toBigIntSafe(input.parentGasUsed, 'parentGasUsed')

  const targetGas = input.parentGasLimit
    ? toBigIntSafe(input.parentGasLimit, 'parentGasLimit') / params.elasticityMultiplier
    : params.targetGasLimit

  if (parentGasUsed === targetGas) {
    return parentBaseFee
  }

  if (parentGasUsed > targetGas) {
    const gasUsedDelta = parentGasUsed - targetGas
    const baseFeeDelta = (parentBaseFee * gasUsedDelta) / targetGas / params.baseFeeMaxChangeDenominator
    const adjustment = baseFeeDelta > 1n ? baseFeeDelta : 1n
    return parentBaseFee + adjustment
  } else {
    const gasUsedDelta = targetGas - parentGasUsed
    const baseFeeDelta = (parentBaseFee * gasUsedDelta) / targetGas / params.baseFeeMaxChangeDenominator
    const newBaseFee = parentBaseFee - baseFeeDelta
    return newBaseFee > params.minBaseFee ? newBaseFee : params.minBaseFee
  }
}

/**
 * Validates EIP-1559 fee fields and computes effective execution fee and total transaction cost.
 */
export function calculateTransactionCost(input: TransactionFeeInput): TransactionCostBreakdown {
  const baseFee = toBigIntSafe(input.baseFee, 'baseFee')
  const maxFeePerGas = toBigIntSafe(input.maxFeePerGas, 'maxFeePerGas')
  const maxPriorityFeePerGas = toBigIntSafe(input.maxPriorityFeePerGas, 'maxPriorityFeePerGas')
  const gasLimit = toBigIntSafe(input.gasLimit, 'gasLimit')
  const value = input.value !== undefined ? toBigIntSafe(input.value, 'value') : 0n

  if (maxPriorityFeePerGas > maxFeePerGas) {
    throw new Error('maxPriorityFeePerGas cannot exceed maxFeePerGas')
  }

  if (maxFeePerGas < baseFee) {
    throw new Error('maxFeePerGas is lower than current block baseFee; transaction will fail')
  }

  // Effective tip = min(maxPriorityFeePerGas, maxFeePerGas - baseFee)
  const tipAllowance = maxFeePerGas - baseFee
  const priorityFeePerGas = maxPriorityFeePerGas < tipAllowance ? maxPriorityFeePerGas : tipAllowance
  const effectiveGasPrice = baseFee + priorityFeePerGas

  const totalGasCost = gasLimit * effectiveGasPrice
  const totalMaxCost = value + (gasLimit * maxFeePerGas)

  return {
    effectiveGasPrice,
    priorityFeePerGas,
    baseFeePerGas: baseFee,
    totalGasCost,
    totalValue: value,
    totalMaxCost,
  }
}

/**
 * Validates whether a transaction satisfies EIP-1559 fee invariants.
 */
export function validateEip1559Fees(
  baseFee: bigint | string | number,
  maxFeePerGas: bigint | string | number,
  maxPriorityFeePerGas: bigint | string | number
): { valid: boolean; reason?: string } {
  try {
    const b = toBigIntSafe(baseFee, 'baseFee')
    const max = toBigIntSafe(maxFeePerGas, 'maxFeePerGas')
    const prio = toBigIntSafe(maxPriorityFeePerGas, 'maxPriorityFeePerGas')

    if (prio > max) {
      return { valid: false, reason: 'maxPriorityFeePerGas exceeds maxFeePerGas' }
    }
    if (max < b) {
      return { valid: false, reason: 'maxFeePerGas is below baseFee' }
    }
    return { valid: true }
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : String(err) }
  }
}
