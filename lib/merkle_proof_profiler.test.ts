import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkMerkleProof } from './merkle_proof_profiler.ts';

describe('merkle_proof_profiler', () => {
  it('measures positive opsPerSec', () => {
    assert.ok(benchmarkMerkleProof(8, 50).opsPerSec > 0);
  });
});
