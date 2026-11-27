export function validateTxNonce(expected: number, actual: number): void {
  if (!Number.isInteger(expected) || !Number.isInteger(actual) || actual < 0) {
    throw new Error('Contract violation: nonces must be non-negative integers');
  }
  if (actual !== expected) {
    throw new Error(`Contract violation: nonce mismatch expected ${expected}, got ${actual}`);
  }
}
