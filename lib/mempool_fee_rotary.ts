export class MempoolFeeRotary {
  private readonly samples: number[] = [];
  private readonly capacity: number;

  constructor(capacity = 32) {
    this.capacity = capacity;
  }

  record(gwei: number): void {
    if (gwei < 0) throw new Error('gwei must be non-negative');
    if (this.samples.length >= this.capacity) this.samples.shift();
    this.samples.push(gwei);
  }

  averageGwei(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }
}
