import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TxReplaySentinel } from './tx_replay_sentinel.ts';

describe('TxReplaySentinel', () => {
  it('blocks duplicate transaction hashes', () => {
    const s = new TxReplaySentinel();
    s.assertFresh('0xabc');
    assert.throws(() => s.assertFresh('0xabc'), /replay/);
  });
});
