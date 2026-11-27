import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IpfsPinCircuitBreaker } from './ipfs_pin_circuit_breaker.ts';

describe('IpfsPinCircuitBreaker', () => {
  it('opens after threshold failures', () => {
    const cb = new IpfsPinCircuitBreaker(2, 5000);
    assert.throws(() => cb.call(() => { throw new Error('pin fail'); }));
    assert.throws(() => cb.call(() => { throw new Error('pin fail'); }));
    assert.throws(() => cb.call(() => 'cid'), /circuit open/);
  });
});
