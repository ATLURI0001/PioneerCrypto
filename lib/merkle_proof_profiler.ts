import { createHash } from 'node:crypto';

export function benchmarkMerkleProof(depth: number, iterations = 200): { opsPerSec: number } {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    let h = 'leaf';
    for (let d = 0; d < depth; d++) {
      h = createHash('sha256').update(h + 'sib').digest('hex');
    }
  }
  const sec = Math.max((performance.now() - start) / 1000, 1e-6);
  return { opsPerSec: Math.round(iterations / sec) };
}
