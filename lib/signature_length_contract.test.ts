import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSignatureContract } from './signature_length_contract.ts';

describe('signatureLengthContract', () => {
  it('validates 65-byte hex signature', () => {
    assert.equal(validateSignatureContract('0x' + 'a'.repeat(130)), true);
    assert.equal(validateSignatureContract('0x1234'), false);
  });
});
