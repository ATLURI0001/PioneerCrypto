export interface Erc20TransferParams {
  from: string;
  to: string;
  amount: bigint;
  decimals?: number;
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

export function validateErc20Transfer(params: Erc20TransferParams): void {
  if (!ADDRESS_RE.test(params.from) || params.from === ZERO_ADDR) {
    throw new Error(`Invalid sender address: ${params.from}`);
  }
  if (!ADDRESS_RE.test(params.to) || params.to === ZERO_ADDR) {
    throw new Error(`Invalid recipient address: ${params.to}`);
  }
  if (params.from.toLowerCase() === params.to.toLowerCase()) {
    throw new Error('Self-transfer is not permitted');
  }
  if (params.amount <= 0n) {
    throw new Error('Transfer amount must be positive');
  }
  if (params.decimals !== undefined && (params.decimals < 0 || params.decimals > 18)) {
    throw new Error(`Decimals out of bounds [0, 18]: ${params.decimals}`);
  }
}
