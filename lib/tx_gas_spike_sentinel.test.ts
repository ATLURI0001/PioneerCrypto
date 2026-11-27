import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertGasPriceWithinCap } from './tx_gas_spike_sentinel.ts';

describe('tx_gas_spike_sentinel', () => {
  it('blocks gas spikes above cap', () => {
    assert.doesNotThrow(() => assertGasPriceWithinCap(40, 500));
    assert.throws(() => assertGasPriceWithinCap(900, 500));
  });
});
