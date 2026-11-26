import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkAbiEncode } from './abi_encode_profiler.ts';

describe('abi_encode_profiler', () => {
  it('measures positive opsPerSec', () => {
    const res = benchmarkAbiEncode(4, 100);
    assert.ok(res.opsPerSec > 0);
  });
});
