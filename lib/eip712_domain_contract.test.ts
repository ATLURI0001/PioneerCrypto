import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEip712Domain } from './eip712_domain_contract.ts';

describe('eip712_domain_contract', () => {
  it('validates EIP-712 domain fields', () => {
    assert.doesNotThrow(() =>
      validateEip712Domain({
        name: 'App',
        version: '1',
        chainId: 1,
        verifyingContract: '0x1111111111111111111111111111111111111111',
      })
    );
    assert.throws(() =>
      validateEip712Domain({ name: '', version: '1', chainId: 0, verifyingContract: '0xbad' })
    );
  });
});
