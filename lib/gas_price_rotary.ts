export class GasPriceRotary {
  private buf: number[] = [];
  private readonly max: number;

  constructor(max = 10) {
    this.max = max;
  }

  push(gwei: number): void {
    if (this.buf.length >= this.max) this.buf.shift();
    this.buf.push(gwei);
  }

  count(): number {
    return this.buf.length;
  }
}
