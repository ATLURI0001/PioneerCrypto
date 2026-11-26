import test from 'node:test';
import assert from 'node:assert/strict';
import { Sha256BatchProfiler } from './sha256_batch_profiler.ts';

test('Sha256BatchProfiler - hashes batch and reports throughput', () => {
  const profiler = new Sha256BatchProfiler();
  const hashes = profiler.hashBatch(['abc']);
  assert.equal(hashes[0].length, 64);

  const res = profiler.runBenchmark(100);
  assert.equal(res.count, 100);
  assert.ok(res.throughputOpsSec > 0);
});
