import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BlockSyncCircuitBreaker } from './block_sync_circuit_breaker.ts';

describe('BlockSyncCircuitBreaker', () => {
  it('opens after threshold failures', () => {
    const cb = new BlockSyncCircuitBreaker(2);
    assert.equal(cb.isOpen(), false);
    cb.recordFailure(); cb.recordFailure();
    assert.equal(cb.isOpen(), true);
  });
});
