import test from 'node:test';
import assert from 'node:assert/strict';
import { NonceGapSentinel } from './nonce_gap_sentinel.ts';

test('NonceGapSentinel - accepts sequential nonces cleanly', () => {
  const sentinel = new NonceGapSentinel();
  sentinel.registerConfirmedNonce('0xabc', 4);

  const res = sentinel.evaluateTransaction('0xabc', 5);
  assert.equal(res.accepted, true);
  assert.equal(res.gapDetected, false);
});

test('NonceGapSentinel - detects nonce gap and stale replay', () => {
  const sentinel = new NonceGapSentinel();
  sentinel.registerConfirmedNonce('0xabc', 4);

  // Stale nonce
  const resStale = sentinel.evaluateTransaction('0xabc', 4);
  assert.equal(resStale.accepted, false);
  assert.equal(resStale.reason, 'ERR_STALE_NONCE');

  // Gap nonce (skipping 5, sending 6)
  const resGap = sentinel.evaluateTransaction('0xabc', 6);
  assert.equal(resGap.accepted, true);
  assert.equal(resGap.gapDetected, true);
  assert.equal(resGap.reason, 'ERR_NONCE_GAP_DETECTED');
});
