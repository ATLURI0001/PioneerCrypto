/**
 * INC-2026-PIONEER-7710: Account Nonce Gap & Stalled Mempool Transaction Sentinel.
 * 
 * Detects missing sequential nonces, duplicate nonce replacement collisions,
 * and prevents transaction queue head-of-line blocking in mempool pipelines.
 */

export interface NonceEvaluation {
  accepted: boolean;
  reason?: string;
  gapDetected: boolean;
}

export class NonceGapSentinel {
  private readonly accountNonces: Map<string, number> = new Map();
  private readonly pendingNonces: Map<string, Set<number>> = new Map();
  public readonly incidents: string[] = [];

  public registerConfirmedNonce(address: string, nonce: number): void {
    this.accountNonces.set(address.toLowerCase(), nonce);
  }

  public evaluateTransaction(address: string, txNonce: number): NonceEvaluation {
    const key = address.toLowerCase();
    const expectedNext = (this.accountNonces.get(key) ?? -1) + 1;

    if (txNonce < expectedNext) {
      this.incidents.push(`ERR_STALE_NONCE: ${key} txNonce=${txNonce} < expected=${expectedNext}`);
      return { accepted: false, reason: 'ERR_STALE_NONCE', gapDetected: false };
    }

    const pending = this.pendingNonces.get(key) ?? new Set<number>();
    if (pending.has(txNonce)) {
      this.incidents.push(`ERR_DUPLICATE_PENDING_NONCE: ${key} nonce=${txNonce}`);
      return { accepted: false, reason: 'ERR_DUPLICATE_PENDING_NONCE', gapDetected: false };
    }

    pending.add(txNonce);
    this.pendingNonces.set(key, pending);

    if (txNonce > expectedNext) {
      // Check if intermediate nonce is missing from pending
      for (let n = expectedNext; n < txNonce; n++) {
        if (!pending.has(n)) {
          this.incidents.push(`ERR_NONCE_GAP_DETECTED: ${key} missing nonce=${n}`);
          return { accepted: true, reason: 'ERR_NONCE_GAP_DETECTED', gapDetected: true };
        }
      }
    }

    return { accepted: true, gapDetected: false };
  }
}
