import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GasPriceRotary } from './gas_price_rotary.ts';

describe('GasPriceRotary', () => {
  it('bounds gas price samples', () => {
    const r = new GasPriceRotary(2);
    r.push(20); r.push(30); r.push(40);
    assert.equal(r.count(), 2);
  });
});
