// PioneerCrypto: zkproof nonce rotary telemetry
export class ZkProofNonceRotary {
  #buf: number[] = [];
  #cap: number;
  constructor(cap = 8) { this.#cap = cap; }
  record(nonce: number) {
    if (this.#buf.length >= this.#cap) this.#buf.shift();
    this.#buf.push(nonce);
  }
  len() { return this.#buf.length; }
}
