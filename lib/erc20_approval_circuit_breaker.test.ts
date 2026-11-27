import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recordApprovalFailure, isOpen, reset } from './erc20_approval_circuit_breaker.ts';

describe('erc20ApprovalCircuitBreaker', () => {
  it('opens after threshold failures', () => {
    reset();
    for (let i = 0; i < 5; i++) recordApprovalFailure();
    assert.equal(isOpen(), true);
  });
});
