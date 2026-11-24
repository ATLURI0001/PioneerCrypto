import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SignatureMalleabilitySentinel,
  SignatureErrorCode,
  SECP256K1_N,
  SECP256K1_HALF_N,
  type ECDSASignature,
} from './signature_malleability_sentinel.ts';

describe('SignatureMalleabilitySentinel Suite', () => {
  const sampleR = '0x4355a9dad39da1820b1757e102f4f2fa8fde954bae4e6097629e354921843722';
  const validLowS = '0x00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'; // << SECP256K1_HALF_N
  const malleableHighS = `0x${(SECP256K1_N - BigInt(validLowS)).toString(16)}`; // > SECP256K1_HALF_N
  const messageHash = '0x8898124976721598471209384710928437102938471209834710928374102938';

  const defaultDomain = {
    chainId: 1,
    verifyingContract: '0x1111111111111111111111111111111111111111',
  };

  it('accepts valid canonical low-s signature', () => {
    const sentinel = new SignatureMalleabilitySentinel({
      chainId: 1,
      verifyingContract: '0x1111111111111111111111111111111111111111',
    });

    const sig: ECDSASignature = { r: sampleR, s: validLowS, v: 27 };
    const res = sentinel.verifyAndConsume(sig, messageHash, defaultDomain);

    assert.equal(res.valid, true);
    assert.equal(res.isMalleable, false);
    assert.ok(res.canonicalSignatureHash.length > 0);
  });

  it('rejects malleable high-s signature when enforceLowS is enabled', () => {
    const sentinel = new SignatureMalleabilitySentinel({
      chainId: 1,
      verifyingContract: '0x1111111111111111111111111111111111111111',
      enforceLowS: true,
    });

    const highSig: ECDSASignature = { r: sampleR, s: malleableHighS, v: 28 };
    const res = sentinel.verifyAndConsume(highSig, messageHash, defaultDomain);

    assert.equal(res.valid, false);
    assert.equal(res.isMalleable, true);
    assert.equal(res.errorCode, SignatureErrorCode.MALLEABLE_HIGH_S);
    assert.ok(res.errorMessage?.includes('EIP-2'));
  });

  it('generates identical canonical hash for inverted s-values', () => {
    const sentinel = new SignatureMalleabilitySentinel();

    const lowSig: ECDSASignature = { r: sampleR, s: validLowS, v: 27 };
    const highSig: ECDSASignature = { r: sampleR, s: malleableHighS, v: 28 };

    const hashLow = sentinel.computeCanonicalHash(lowSig, messageHash);
    const hashHigh = sentinel.computeCanonicalHash(highSig, messageHash);

    assert.equal(hashLow, hashHigh);
  });

  it('prevents direct duplicate replay attack', () => {
    const sentinel = new SignatureMalleabilitySentinel({
      chainId: 1,
      verifyingContract: '0x1111111111111111111111111111111111111111',
    });

    const sig: ECDSASignature = { r: sampleR, s: validLowS, v: 27 };

    // 1st consumption: succeeds
    const first = sentinel.verifyAndConsume(sig, messageHash, defaultDomain);
    assert.equal(first.valid, true);

    // 2nd consumption: rejected as replayed
    const second = sentinel.verifyAndConsume(sig, messageHash, defaultDomain);
    assert.equal(second.valid, false);
    assert.equal(second.errorCode, SignatureErrorCode.SIGNATURE_REPLAYED);
  });

  it('detects replay even if relayer attempts high-s inversion bypass', () => {
    const sentinel = new SignatureMalleabilitySentinel({
      chainId: 1,
      verifyingContract: '0x1111111111111111111111111111111111111111',
      enforceLowS: false, // relax low-s to test replay catching inverted signature
    });

    const lowSig: ECDSASignature = { r: sampleR, s: validLowS, v: 27 };
    const highSig: ECDSASignature = { r: sampleR, s: malleableHighS, v: 28 };

    // Consume low-s signature
    const first = sentinel.verifyAndConsume(lowSig, messageHash, defaultDomain);
    assert.equal(first.valid, true);

    // Attempt double-spend using inverted high-s signature
    const invertedReplay = sentinel.verifyAndConsume(highSig, messageHash, defaultDomain);
    assert.equal(invertedReplay.valid, false);
    assert.equal(invertedReplay.errorCode, SignatureErrorCode.SIGNATURE_REPLAYED);
  });

  it('enforces EIP-712 domain chainId and contract address binding', () => {
    const sentinel = new SignatureMalleabilitySentinel({
      chainId: 1,
      verifyingContract: '0x1111111111111111111111111111111111111111',
    });

    const sig: ECDSASignature = { r: sampleR, s: validLowS, v: 27 };

    // Chain ID mismatch
    const badChain = sentinel.verifyAndConsume(sig, messageHash, {
      chainId: 137, // Polygon
      verifyingContract: '0x1111111111111111111111111111111111111111',
    });
    assert.equal(badChain.valid, false);
    assert.equal(badChain.errorCode, SignatureErrorCode.DOMAIN_CHAIN_MISMATCH);

    // Contract address mismatch
    const badContract = sentinel.verifyAndConsume(sig, messageHash, {
      chainId: 1,
      verifyingContract: '0x9999999999999999999999999999999999999999',
    });
    assert.equal(badContract.valid, false);
    assert.equal(badContract.errorCode, SignatureErrorCode.DOMAIN_CONTRACT_MISMATCH);
  });

  it('rejects out of bounds scalar values', () => {
    const sentinel = new SignatureMalleabilitySentinel();

    // R = 0 (invalid)
    const badR: ECDSASignature = { r: '0x0', s: validLowS, v: 27 };
    assert.equal(sentinel.verifyAndConsume(badR, messageHash).errorCode, SignatureErrorCode.INVALID_R_RANGE);

    // S = 0 (invalid)
    const badS: ECDSASignature = { r: sampleR, s: '0x0', v: 27 };
    assert.equal(sentinel.verifyAndConsume(badS, messageHash).errorCode, SignatureErrorCode.INVALID_S_RANGE);

    // V = 42 (invalid)
    const badV: ECDSASignature = { r: sampleR, s: validLowS, v: 42 };
    assert.equal(sentinel.verifyAndConsume(badV, messageHash).errorCode, SignatureErrorCode.INVALID_V_VALUE);
  });

  it('supports cache clearing and incident postmortem generation', () => {
    const sentinel = new SignatureMalleabilitySentinel();
    const sig: ECDSASignature = { r: sampleR, s: validLowS, v: 27 };

    assert.equal(sentinel.verifyAndConsume(sig, messageHash).valid, true);
    assert.equal(sentinel.verifyAndConsume(sig, messageHash).valid, false);

    sentinel.clearReplayCache();
    assert.equal(sentinel.verifyAndConsume(sig, messageHash).valid, true);

    const postmortem = sentinel.generateIncidentPostmortem('INC-2026-DEFI-5109');
    assert.ok(postmortem.includes('INC-2026-DEFI-5109'));
    assert.ok(postmortem.includes('EIP-2 Enforcement'));
  });
});
