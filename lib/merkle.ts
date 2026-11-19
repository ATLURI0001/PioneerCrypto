import { createHash } from "node:crypto";

/**
 * SHA-256 hash helper returning a 32-byte hex string (prefixed with 0x).
 */
export function sha256Hex(data: string | Buffer): string {
  const hash = createHash("sha256");
  hash.update(data);
  return `0x${hash.digest("hex")}`;
}

/**
 * Combined sorted pair hash to prevent second-preimage vulnerabilities (RFC 6962).
 */
export function hashPair(left: string, right: string): string {
  const l = left.toLowerCase();
  const r = right.toLowerCase();
  const [first, second] = l <= r ? [l, r] : [r, l];
  return sha256Hex(Buffer.concat([
    Buffer.from(first.replace(/^0x/, ""), "hex"),
    Buffer.from(second.replace(/^0x/, ""), "hex"),
  ]));
}

export interface MerkleProofStep {
  sibling: string;
  isRight: boolean;
}

/**
 * Standard Merkle Tree supporting cryptographic inclusion proofs.
 */
export class MerkleTree {
  private readonly leaves: string[];
  private readonly layers: string[][];

  constructor(elements: (string | Buffer)[]) {
    if (!elements || elements.length === 0) {
      throw new Error("Cannot create MerkleTree with empty elements");
    }

    // Hash raw elements to leaves
    this.leaves = elements.map((e) => (typeof e === "string" && e.startsWith("0x") && e.length === 66 ? e.toLowerCase() : sha256Hex(e)));
    this.layers = [this.leaves];

    this.buildTree();
  }

  private buildTree(): void {
    let currentLayer = this.leaves;
    while (currentLayer.length > 1) {
      const nextLayer: string[] = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        if (i + 1 < currentLayer.length) {
          nextLayer.push(hashPair(currentLayer[i]!, currentLayer[i + 1]!));
        } else {
          // Odd leaf: propagate up without duplication to preserve balance
          nextLayer.push(currentLayer[i]!);
        }
      }
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }
  }

  public getRoot(): string {
    const top = this.layers[this.layers.length - 1];
    return top && top[0] ? top[0] : sha256Hex("");
  }

  public getProof(leaf: string): MerkleProofStep[] {
    const normalizedLeaf = leaf.toLowerCase();
    let index = this.leaves.indexOf(normalizedLeaf);
    if (index === -1) {
      throw new Error(`Leaf ${leaf} not found in Merkle tree`);
    }

    const proof: MerkleProofStep[] = [];
    for (let l = 0; l < this.layers.length - 1; l++) {
      const layer = this.layers[l]!;
      const isRight = index % 2 === 1;
      const pairIndex = isRight ? index - 1 : index + 1;

      if (pairIndex < layer.length) {
        proof.push({
          sibling: layer[pairIndex]!,
          isRight: !isRight,
        });
      }

      index = Math.floor(index / 2);
    }

    return proof;
  }

  public static verifyProof(leaf: string, proof: MerkleProofStep[], root: string): boolean {
    let current = leaf.toLowerCase();
    for (const step of proof) {
      current = hashPair(current, step.sibling.toLowerCase());
    }
    return current.toLowerCase() === root.toLowerCase();
  }
}

export interface MultisigBatchPayload {
  batchId: string;
  transactionsRoot: string;
  nonce: number;
  signers: string[];
  threshold: number;
}

/**
 * Validates M-of-N multisig threshold authorization over a Merkle batch root.
 */
export function verifyMultisigBatchAuthorization(
  payload: MultisigBatchPayload,
  consumedNonces: Set<number>,
): { valid: boolean; error?: string } {
  if (payload.threshold <= 0) {
    return { valid: false, error: "Threshold must be greater than zero" };
  }
  if (payload.signers.length < payload.threshold) {
    return {
      valid: false,
      error: `Signer count (${payload.signers.length}) is below threshold (${payload.threshold})`,
    };
  }

  // Check unique signers
  const uniqueSigners = new Set(payload.signers.map((s) => s.toLowerCase()));
  if (uniqueSigners.size < payload.threshold) {
    return { valid: false, error: "Duplicate signers detected in authorization payload" };
  }

  // Replay prevention
  if (consumedNonces.has(payload.nonce)) {
    return { valid: false, error: `Nonce ${payload.nonce} has already been consumed` };
  }

  return { valid: true };
}
