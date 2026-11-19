import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPair,
  MerkleTree,
  sha256Hex,
  verifyMultisigBatchAuthorization,
} from "./merkle.ts";

test("hashPair is commutative and sorted", () => {
  const h1 = sha256Hex("alpha");
  const h2 = sha256Hex("beta");
  const pair1 = hashPair(h1, h2);
  const pair2 = hashPair(h2, h1);
  assert.equal(pair1, pair2, "hashPair must sort pair elements for commutative consensus");
});

test("MerkleTree calculates root and validates inclusion proofs", () => {
  const txs = [
    "tx:alice->bob:100",
    "tx:charlie->dave:50",
    "tx:eve->frank:200",
    "tx:grace->heidi:75",
  ];

  const tree = new MerkleTree(txs);
  const root = tree.getRoot();
  assert.ok(root.startsWith("0x"), "Root must be hex formatted");

  // Verify inclusion of all leaves
  for (const tx of txs) {
    const leaf = sha256Hex(tx);
    const proof = tree.getProof(leaf);
    const isValid = MerkleTree.verifyProof(leaf, proof, root);
    assert.ok(isValid, `Proof for leaf ${tx} should be valid against root`);
  }
});

test("MerkleTree handles odd number of leaves correctly", () => {
  const txs = [
    "tx:1",
    "tx:2",
    "tx:3",
  ];

  const tree = new MerkleTree(txs);
  const root = tree.getRoot();

  for (const tx of txs) {
    const leaf = sha256Hex(tx);
    const proof = tree.getProof(leaf);
    assert.ok(MerkleTree.verifyProof(leaf, proof, root));
  }
});

test("MerkleTree rejects unknown leaf and invalid proof", () => {
  const tree = new MerkleTree(["item1", "item2"]);
  const root = tree.getRoot();
  const unknownLeaf = sha256Hex("unknown");

  assert.throws(() => tree.getProof(unknownLeaf));

  const validLeaf = sha256Hex("item1");
  const proof = tree.getProof(validLeaf);
  const tamperedRoot = sha256Hex("tampered_root");
  assert.equal(MerkleTree.verifyProof(validLeaf, proof, tamperedRoot), false);
});

test("verifyMultisigBatchAuthorization enforces threshold and replay protection", () => {
  const consumed = new Set([1, 2, 3]);

  // Valid 2-of-3
  const res1 = verifyMultisigBatchAuthorization(
    {
      batchId: "batch-100",
      transactionsRoot: "0xabc",
      nonce: 4,
      signers: ["0xAlice", "0xBob"],
      threshold: 2,
    },
    consumed
  );
  assert.equal(res1.valid, true);

  // Insufficient signers (1 < 2)
  const res2 = verifyMultisigBatchAuthorization(
    {
      batchId: "batch-101",
      transactionsRoot: "0xabc",
      nonce: 5,
      signers: ["0xAlice"],
      threshold: 2,
    },
    consumed
  );
  assert.equal(res2.valid, false);
  assert.ok(res2.error?.includes("below threshold"));

  // Duplicate signers
  const res3 = verifyMultisigBatchAuthorization(
    {
      batchId: "batch-102",
      transactionsRoot: "0xabc",
      nonce: 6,
      signers: ["0xAlice", "0xalice"],
      threshold: 2,
    },
    consumed
  );
  assert.equal(res3.valid, false);
  assert.ok(res3.error?.includes("Duplicate signers"));

  // Consumed nonce replay
  const res4 = verifyMultisigBatchAuthorization(
    {
      batchId: "batch-103",
      transactionsRoot: "0xabc",
      nonce: 2,
      signers: ["0xAlice", "0xBob"],
      threshold: 2,
    },
    consumed
  );
  assert.equal(res4.valid, false);
  assert.ok(res4.error?.includes("already been consumed"));
});
