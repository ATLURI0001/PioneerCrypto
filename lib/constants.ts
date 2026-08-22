export const TOKEN_DEFAULTS = {
  decimals: 18,
  maxSupply: '1000000000000000000000000', // 1 quadrillion
  minNameLength: 2,
  maxNameLength: 50,
  minSymbolLength: 2,
  maxSymbolLength: 10,
  maxDescriptionLength: 500,
} as const

export const VALIDATION_RULES = {
  name: {
    required: true,
    minLength: TOKEN_DEFAULTS.minNameLength,
    maxLength: TOKEN_DEFAULTS.maxNameLength,
    pattern: /^[a-zA-Z0-9\s\-_]+$/,
  },
  symbol: {
    required: true,
    minLength: TOKEN_DEFAULTS.minSymbolLength,
    maxLength: TOKEN_DEFAULTS.maxSymbolLength,
    pattern: /^[A-Z0-9]+$/,
  },
  supply: {
    required: true,
    min: '1',
    max: TOKEN_DEFAULTS.maxSupply,
  },
  decimals: {
    required: true,
    min: 0,
    max: 18,
  },
  description: {
    required: false,
    maxLength: TOKEN_DEFAULTS.maxDescriptionLength,
  },
} as const

export const SIMULATED_NETWORKS = [
  { id: 'ethereum', name: 'Ethereum Mainnet', chainId: 1, explorer: 'https://etherscan.io', color: '#627EEA' },
  { id: 'polygon', name: 'Polygon', chainId: 137, explorer: 'https://polygonscan.com', color: '#8247E5' },
  { id: 'arbitrum', name: 'Arbitrum One', chainId: 42161, explorer: 'https://arbiscan.io', color: '#28A0F0' },
  { id: 'optimism', name: 'Optimism', chainId: 10, explorer: 'https://optimistic.etherscan.io', color: '#FF0420' },
  { id: 'base', name: 'Base', chainId: 8453, explorer: 'https://basescan.org', color: '#0052FF' },
] as const

export const PREDEFINED_ADDRESSES = [
  { label: 'Deployer Wallet', address: '0x742d35Cc6634C0532925a3b8D4C0532925a3b8D4' },
  { label: 'Alice', address: '0xA1B2C3D4E5F6789012345678901234567890ABCD' },
  { label: 'Bob', address: '0xB2C3D4E5F6789012345678901234567890ABCDEF' },
  { label: 'Charlie', address: '0xC3D4E5F6789012345678901234567890ABCDEF01' },
  { label: 'Treasury', address: '0xD4E5F6789012345678901234567890ABCDEF0123' },
  { label: 'Uniswap V2 Router', address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' },
] as const

export const ERC20_ABI = [
  { inputs: [{ internalType: 'string', name: 'name', type: 'string' }, { internalType: 'string', name: 'symbol', type: 'string' }, { internalType: 'uint256', name: 'initialSupply', type: 'uint256' }], stateMutability: 'nonpayable', type: 'constructor' },
  { anonymous: false, inputs: [{ indexed: true, internalType: 'address', name: 'from', type: 'address' }, { indexed: true, internalType: 'address', name: 'to', type: 'address' }, { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' }], name: 'Transfer', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, internalType: 'address', name: 'owner', type: 'address' }, { indexed: true, internalType: 'address', name: 'spender', type: 'address' }, { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' }], name: 'Approval', type: 'event' },
  { inputs: [{ internalType: 'address', name: 'owner', type: 'address' }, { internalType: 'address', name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ internalType: 'address', name: 'spender', type: 'address' }, { internalType: 'uint256', name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ internalType: 'address', name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ internalType: 'address', name: 'spender', type: 'address' }, { internalType: 'uint256', name: 'subtractedValue', type: 'uint256' }], name: 'decreaseAllowance', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ internalType: 'address', name: 'spender', type: 'address' }, { internalType: 'uint256', name: 'addedValue', type: 'uint256' }], name: 'increaseAllowance', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ internalType: 'string', name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ internalType: 'string', name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalSupply', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ internalType: 'address', name: 'to', type: 'address' }, { internalType: 'uint256', name: 'amount', type: 'uint256' }], name: 'transfer', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ internalType: 'address', name: 'from', type: 'address' }, { internalType: 'address', name: 'to', type: 'address' }, { internalType: 'uint256', name: 'amount', type: 'uint256' }], name: 'transferFrom', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
] as const