import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateTxNonce } from './tx_nonce_contract.ts';

describe('tx_nonce_contract', () => {
  it('enforces exact sequential nonce', () => {
    assert.doesNotThrow(() => validateTxNonce(5, 5));
    assert.throws(() => validateTxNonce(5, 6));
  });
});
