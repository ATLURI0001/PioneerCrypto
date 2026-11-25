import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MerklePatriciaBenchmarkProfiler,
  type TrieProofNode,
} from './merkle_patricia_benchmark_profiler.ts';

describe('MerklePatriciaBenchmarkProfiler Suite', () => {
  it('correctly encodes strings and byte arrays to RLP', () => {
    // Single byte < 0x80
    const b1 = MerklePatriciaBenchmarkProfiler.encodeRLP('0x00');
    assert.deepEqual(b1, Buffer.from([0x00]));

    // Short string
    const str = Buffer.from('dog', 'utf-8');
    const b2 = MerklePatriciaBenchmarkProfiler.encodeRLP(str);
    assert.equal(b2[0], 0x80 + 3); // 0x83
    assert.equal(Buffer.from(b2.subarray(1)).toString('utf-8'), 'dog');

    // List encoding: ['0x01', '0x02']
    const list = MerklePatriciaBenchmarkProfiler.encodeRLP(['0x01', '0x02']);
    assert.equal(list[0], 0xc0 + 2); // 0xc2
  });

  it('encodes nibbles using hex-prefix format', () => {
    // Even length extension
    assert.equal(MerklePatriciaBenchmarkProfiler.hexPrefixEncode('1234', false), '001234');
    // Odd length extension
    assert.equal(MerklePatriciaBenchmarkProfiler.hexPrefixEncode('123', false), '1123');
    // Even length leaf
    assert.equal(MerklePatriciaBenchmarkProfiler.hexPrefixEncode('abcd', true), '20abcd');
    // Odd length leaf
    assert.equal(MerklePatriciaBenchmarkProfiler.hexPrefixEncode('abc', true), '3abc');
  });

  it('verifies valid and invalid Merkle Patricia proofs', () => {
    const root = '0x1111'.padEnd(66, '0');
    const leafHash = '0x2222'.padEnd(66, '0');

    const leafNode: TrieProofNode = {
      type: 'LEAF',
      pathNibbles: 'bc',
      value: '0xdeadbeef',
      nodeHash: leafHash,
    };

    const branchChildren = new Array(16).fill('0'.repeat(64));
    branchChildren[0xa] = leafHash; // nibble 'a' -> 10

    const branchNode: TrieProofNode = {
      type: 'BRANCH',
      pathNibbles: 'a',
      children: branchChildren,
      nodeHash: root,
    };

    // Valid path 'abc' (branch 'a' -> leaf 'bc')
    assert.ok(
      MerklePatriciaBenchmarkProfiler.verifyProof(root, 'abc', [branchNode, leafNode])
    );

    // Invalid path 'abd'
    assert.equal(
      MerklePatriciaBenchmarkProfiler.verifyProof(root, 'abd', [branchNode, leafNode]),
      false
    );

    // Tampered root hash
    assert.equal(
      MerklePatriciaBenchmarkProfiler.verifyProof('0xbad'.padEnd(66, '0'), 'abc', [branchNode, leafNode]),
      false
    );
  });

  it('runs benchmark suite and produces valid markdown report', () => {
    const { metrics, report } = MerklePatriciaBenchmarkProfiler.runBenchmarkSuite(500);
    assert.equal(metrics.length, 3);

    for (const m of metrics) {
      assert.ok(m.opsPerSec > 0);
      assert.ok(m.meanLatencyUs >= 0);
      assert.ok(m.p50LatencyUs >= 0);
      assert.ok(m.p90LatencyUs >= 0);
      assert.ok(m.p99LatencyUs >= 0);
    }

    assert.ok(report.includes('# Merkle Patricia Trie & Cryptographic Proof Benchmark Report'));
    assert.ok(report.includes('| **MerklePatriciaProofVerify** |'));
    assert.ok(report.includes('| **RLPListEncoding** |'));
    assert.ok(report.includes('| **HexPrefixNibbleEncoding** |'));
  });
});
