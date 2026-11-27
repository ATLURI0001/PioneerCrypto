import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ZkProofNonceRotary } from './zkproof_nonce_rotary.ts';

describe('ZkProofNonceRotary', () => {
  it('caps at capacity', () => {
    const r = new ZkProofNonceRotary(3);
    for (let i = 0; i < 5; i++) r.record(i);
    assert.equal(r.len(), 3);
  });
});
