export function validateSignatureContract(sig: string): boolean {
  return sig.startsWith('0x') && sig.length === 132;
}
