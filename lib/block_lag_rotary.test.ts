import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BlockLagRotary } from './block_lag_rotary.ts';

describe('BlockLagRotary', () => {
  it('computes bounded average block lag', () => {
    const r = new BlockLagRotary(2);
    r.record(1);
    r.record(3);
    r.record(5);
    assert.equal(r.avgLag(), 4);
  });
});
