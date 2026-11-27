export class BlockSyncCircuitBreaker {
  private failures = 0;
  private readonly threshold: number;
  private open = false;

  constructor(threshold = 3) {
    this.threshold = threshold;
  }

  recordFailure(): void {
    this.failures++;
    if (this.failures >= this.threshold) this.open = true;
  }

  isOpen(): boolean {
    return this.open;
  }
}
