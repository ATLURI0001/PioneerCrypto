import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GasSpikeSentinel } from './gas_spike_sentinel.ts';

describe('GasSpikeSentinel', () => {
  it('flags gas spikes', () => {
    const s = new GasSpikeSentinel(100);
    assert.equal(s.check(50), true);
    assert.equal(s.check(250), false);
    assert.equal(s.alertCount(), 1);
  });
});
