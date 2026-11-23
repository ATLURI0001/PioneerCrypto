import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PermitContractSanitizer } from './permit_contract.ts';
import type { IngressPermitRequest } from './permit_contract.ts';

describe('PermitContractSanitizer Suite', () => {
  const validDomain = {
    name: 'PioneerUSD',
    version: '1',
    chainId: 1,
    verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  };

  const validSignature = {
    v: 28,
    r: '0x1234567890123456789012345678901234567890123456789012345678901234',
    s: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  };

  it('validates compliant EIP-2612 permit request', () => {
    const sanitizer = new PermitContractSanitizer();
    const now = 1700000000;

    const req: IngressPermitRequest = {
      domain: validDomain,
      message: {
        owner: '0x1111111111111111111111111111111111111111',
        spender: '0x2222222222222222222222222222222222222222',
        value: 1000000000n,
        nonce: 0,
        deadline: now + 3600,
      },
      signature: validSignature,
    };

    const res = sanitizer.validatePermit(req, now);
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
    assert.equal(res.sanitizedPermit?.message.value, 1000000000n);
    assert.equal(res.sanitizedPermit?.message.nonce, 0);
  });

  it('rejects expired permit requests', () => {
    const sanitizer = new PermitContractSanitizer();
    const now = 1700000000;

    const req: IngressPermitRequest = {
      domain: validDomain,
      message: {
        owner: '0x1111111111111111111111111111111111111111',
        spender: '0x2222222222222222222222222222222222222222',
        value: '500',
        nonce: 0,
        deadline: now - 100, // in the past
      },
      signature: validSignature,
    };

    const res = sanitizer.validatePermit(req, now);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('Permit expired')));
  });

  it('enforces sequential nonces and rejects replay attacks', () => {
    const sanitizer = new PermitContractSanitizer();
    const now = 1700000000;

    const req: IngressPermitRequest = {
      domain: validDomain,
      message: {
        owner: '0x1111111111111111111111111111111111111111',
        spender: '0x2222222222222222222222222222222222222222',
        value: '100',
        nonce: 0,
        deadline: now + 1000,
      },
      signature: validSignature,
    };

    // First time succeeds
    const res1 = sanitizer.validatePermit(req, now);
    assert.equal(res1.valid, true);

    // Replay with identical nonce 0 should fail
    const resReplay = sanitizer.validatePermit(req, now);
    assert.equal(resReplay.valid, false);
    assert.ok(resReplay.errors.some(e => e.includes('expected sequential nonce 1')));

    // Sequential nonce 1 succeeds
    const reqNext: IngressPermitRequest = {
      ...req,
      message: { ...req.message, nonce: 1 },
    };
    const resNext = sanitizer.validatePermit(reqNext, now);
    assert.equal(resNext.valid, true);
  });

  it('rejects zero address and self-permit', () => {
    const sanitizer = new PermitContractSanitizer();
    const now = 1700000000;

    const reqSelf: IngressPermitRequest = {
      domain: validDomain,
      message: {
        owner: '0x1111111111111111111111111111111111111111',
        spender: '0x1111111111111111111111111111111111111111',
        value: '100',
        nonce: 0,
        deadline: now + 1000,
      },
      signature: validSignature,
    };

    const res = sanitizer.validatePermit(reqSelf, now);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('Self-permit rejected')));
  });

  it('rejects invalid ECDSA signature v, r, s values', () => {
    const sanitizer = new PermitContractSanitizer();
    const now = 1700000000;

    const reqBadSig: IngressPermitRequest = {
      domain: validDomain,
      message: {
        owner: '0x1111111111111111111111111111111111111111',
        spender: '0x2222222222222222222222222222222222222222',
        value: '100',
        nonce: 0,
        deadline: now + 1000,
      },
      signature: {
        v: 29, // Invalid (only 27 or 28)
        r: 'not-a-32-byte-hex',
        s: '0xshort',
      },
    };

    const res = sanitizer.validatePermit(reqBadSig, now);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('Invalid signature v')));
    assert.ok(res.errors.some(e => e.includes('signature r must be a 32-byte hex string')));
  });
});
