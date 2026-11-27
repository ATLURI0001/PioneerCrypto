export class BlockLagRotary {
  private readonly samples: number[] = [];
  private readonly cap: number;

  constructor(cap = 32) {
    this.cap = cap;
  }

  record(blocksBehind: number): void {
    if (blocksBehind < 0) throw new Error('blocksBehind must be non-negative');
    if (this.samples.length >= this.cap) this.samples.shift();
    this.samples.push(blocksBehind);
  }

  avgLag(): number {
    if (!this.samples.length) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }
}
