import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GasRefundRotary } from './gas_refund_rotary.ts';

describe('GasRefundRotary', () => {
  it('computes bounded average gas refund', () => {
    const r = new GasRefundRotary(2);
    r.record(100);
    r.record(200);
    r.record(400);
    assert.equal(r.avgRefund(), 300);
  });
});
