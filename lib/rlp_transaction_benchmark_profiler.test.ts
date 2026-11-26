import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RlpTransactionBenchmarkProfiler,
  type TransactionPayload,
} from './rlp_transaction_benchmark_profiler.ts';

describe('RlpTransactionBenchmarkProfiler Test Suite', () => {
  it('correctly encodes primitive types and arrays into RLP', () => {
    // 0x00 single byte
    const r1 = RlpTransactionBenchmarkProfiler.encodeRLP(0);
    assert.deepEqual(r1, Buffer.from([0x80])); // Empty string / zero integer encoded as 0x80

    // Short string
    const r2 = RlpTransactionBenchmarkProfiler.encodeRLP('0x42');
    assert.deepEqual(r2, Buffer.from([0x42]));

    // Multi-byte string
    const r3 = RlpTransactionBenchmarkProfiler.encodeRLP(Buffer.from('cat', 'utf8'));
    assert.equal(r3[0], 0x83);
    assert.equal(Buffer.from(r3.subarray(1)).toString('utf8'), 'cat');

    // List encoding
    const list = [Buffer.from('cat', 'utf8'), Buffer.from('dog', 'utf8')];
    const encodedList = RlpTransactionBenchmarkProfiler.encodeRLP(list);
    assert.equal(encodedList[0], 0xc8); // 0xc0 + 8 bytes total
  });

  it('decodes RLP bytes back to nested structures', () => {
    const list = [Buffer.from('alpha', 'utf8'), Buffer.from('beta', 'utf8')];
    const encoded = RlpTransactionBenchmarkProfiler.encodeRLP(list);
    const decoded = RlpTransactionBenchmarkProfiler.decodeRLP(encoded);

    assert.ok(Array.isArray(decoded));
    assert.equal(decoded.length, 2);
    assert.equal(Buffer.from(decoded[0]).toString('utf8'), 'alpha');
    assert.equal(Buffer.from(decoded[1]).toString('utf8'), 'beta');
  });

  it('serializes Legacy, EIP-2930, and EIP-1559 transaction payloads', () => {
    const legacyTx = RlpTransactionBenchmarkProfiler.createMockTransaction('LEGACY', 64);
    const serializedLegacy = RlpTransactionBenchmarkProfiler.serializeTransaction(legacyTx);
    assert.ok(serializedLegacy.length > 0);
    // Legacy transactions start with RLP list prefix (>= 0xc0)
    assert.ok(serializedLegacy[0] >= 0xc0);

    const eip2930Tx = RlpTransactionBenchmarkProfiler.createMockTransaction('EIP2930', 64);
    const serialized2930 = RlpTransactionBenchmarkProfiler.serializeTransaction(eip2930Tx);
    assert.equal(serialized2930[0], 0x01); // EIP-2718 Type 1 envelope

    const eip1559Tx = RlpTransactionBenchmarkProfiler.createMockTransaction('EIP1559', 64);
    const serialized1559 = RlpTransactionBenchmarkProfiler.serializeTransaction(eip1559Tx);
    assert.equal(serialized1559[0], 0x02); // EIP-2718 Type 2 envelope
  });

  it('profiles transaction serialization throughput and percentiles', () => {
    const metrics = RlpTransactionBenchmarkProfiler.profileSerialization(
      () => RlpTransactionBenchmarkProfiler.createMockTransaction('EIP1559', 128),
      200,
      'benchmark_eip1559_throughput'
    );

    assert.equal(metrics.operation, 'benchmark_eip1559_throughput');
    assert.equal(metrics.sampleCount, 200);
    assert.ok(metrics.throughputOpsPerSec > 0);
    assert.ok(metrics.meanLatencyUs >= 0);
    assert.ok(metrics.p50LatencyUs >= 0);
    assert.ok(metrics.p90LatencyUs >= metrics.p50LatencyUs);
    assert.ok(metrics.p99LatencyUs >= metrics.p90LatencyUs);
    assert.ok(metrics.bytesProcessed > 0);
  });
});
