export class GasRefundRotary {
  private readonly samples: number[] = [];
  private readonly cap: number;

  constructor(cap = 32) {
    this.cap = cap;
  }

  record(refund: number): void {
    if (refund < 0) throw new Error('refund must be non-negative');
    if (this.samples.length >= this.cap) this.samples.shift();
    this.samples.push(refund);
  }

  avgRefund(): number {
    if (!this.samples.length) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }
}
