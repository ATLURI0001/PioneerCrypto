export class TxReplaySentinel {
  private readonly seen = new Set<string>();

  assertFresh(txHash: string): void {
    if (this.seen.has(txHash)) {
      throw new Error(`Sentinel violation: duplicate tx replay detected for ${txHash}`);
    }
    this.seen.add(txHash);
  }
}
