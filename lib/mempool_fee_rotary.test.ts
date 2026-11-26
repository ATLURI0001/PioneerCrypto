import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MempoolFeeRotary } from './mempool_fee_rotary.ts';

describe('MempoolFeeRotary', () => {
  it('tracks bounded fee samples', () => {
    const r = new MempoolFeeRotary(2);
    r.record(10);
    r.record(20);
    r.record(30);
    assert.equal(r.averageGwei(), 25);
  });
});
