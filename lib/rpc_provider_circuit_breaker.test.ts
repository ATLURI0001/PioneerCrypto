import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RpcProviderCircuitBreaker } from './rpc_provider_circuit_breaker.ts';

describe('RpcProviderCircuitBreaker', () => {
  it('opens after threshold failures', () => {
    const cb = new RpcProviderCircuitBreaker(2, 5000);
    assert.throws(() => cb.call(() => { throw new Error('rpc down'); }));
    assert.throws(() => cb.call(() => { throw new Error('rpc down'); }));
    assert.throws(() => cb.call(() => 1), /circuit open/);
  });
});
