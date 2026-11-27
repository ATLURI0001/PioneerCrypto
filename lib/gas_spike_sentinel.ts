export class GasSpikeSentinel {
  private readonly maxGwei: number;
  private alerts = 0;

  constructor(maxGwei = 200) {
    this.maxGwei = maxGwei;
  }

  check(gwei: number): boolean {
    if (gwei > this.maxGwei) {
      this.alerts++;
      return false;
    }
    return true;
  }

  alertCount(): number {
    return this.alerts;
  }
}
