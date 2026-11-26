export interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export function validateEip712Domain(d: Eip712Domain): void {
  if (!d.name || !d.version) throw new Error('Contract violation: name and version required');
  if (!Number.isInteger(d.chainId) || d.chainId <= 0) throw new Error('Contract violation: invalid chainId');
  if (!/^0x[a-fA-F0-9]{40}$/.test(d.verifyingContract)) {
    throw new Error('Contract violation: invalid verifyingContract');
  }
}
