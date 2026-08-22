export interface Token {
  id: string
  name: string
  symbol: string
  totalSupply: string
  decimals: number
  description: string
  logo: string | null
  createdAt: number
  deployedAt: number | null
  contractAddress: string | null
  txHash: string | null
  blockNumber: number | null
  gasUsed: number | null
  network: string
}

export interface Transaction {
  id: string
  type: 'deploy' | 'transfer' | 'approve' | 'transferFrom' | 'mint' | 'burn'
  from: string
  to: string
  amount: string
  spender?: string
  owner?: string
  txHash: string
  blockNumber: number
  timestamp: number
  status: 'pending' | 'success' | 'failed'
  gasUsed: number
}

export interface TokenMetadata {
  name: string
  symbol: string
  description: string
  image: string | null
  decimals: number
  totalSupply: string
}

export interface WalletState {
  addresses: string[]
  selectedAddress: string
  balances: Record<string, string>
}

export interface ContractState {
  totalSupply: string
  balances: Record<string, string>
  allowances: Record<string, Record<string, string>>
  name: string
  symbol: string
  decimals: number
}

export interface FormErrors {
  name?: string
  symbol?: string
  supply?: string
  totalSupply?: string
  decimals?: string
  description?: string
  logo?: string
}

export interface DeploySimulation {
  contractAddress: string
  txHash: string
  blockNumber: number
  gasUsed: number
  network: string
}