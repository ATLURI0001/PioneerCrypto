export function assertGasPriceWithinCap(gwei: number, maxGwei = 500): void {
  if (gwei < 0 || gwei > maxGwei) {
    throw new Error(`Sentinel violation: gas price ${gwei} gwei exceeds cap ${maxGwei}`);
  }
}
