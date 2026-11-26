import { createHash } from 'node:crypto';

export class Sha256BatchProfiler {
  public hashBatch(inputs: string[]): string[] {
    return inputs.map((s) => createHash('sha256').update(s).digest('hex'));
  }

  public runBenchmark(count = 200): { count: number; elapsedMicros: number; throughputOpsSec: number } {
    const inputs = Array.from({ length: count }, (_, i) => `tx-payload-${i}`);
    const start = performance.now();
    this.hashBatch(inputs);
    const elapsedMicros = Math.max(1, (performance.now() - start) * 1000);
    return {
      count,
      elapsedMicros: Number(elapsedMicros.toFixed(2)),
      throughputOpsSec: Math.round((count / elapsedMicros) * 1_000_000),
    };
  }
}
