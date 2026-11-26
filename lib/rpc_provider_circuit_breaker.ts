export class RpcProviderCircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(threshold = 3, cooldownMs = 5000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  call<T>(fn: () => T): T {
    if (Date.now() < this.openUntil) throw new Error('RPC provider circuit open');
    try {
      const res = fn();
      this.failures = 0;
      return res;
    } catch (err) {
      this.failures++;
      if (this.failures >= this.threshold) {
        this.openUntil = Date.now() + this.cooldownMs;
        this.failures = 0;
      }
      throw err;
    }
  }
}
