/**
 * Recursive Length Prefix (RLP) & Transaction Serialization Benchmark Profiler.
 * 
 * Provides comprehensive throughput measurement, latency profiling (p50/p90/p99),
 * and memory profiling for Ethereum transaction serialization across Legacy,
 * EIP-2930, and EIP-1559 envelopes.
 */

import crypto from 'node:crypto';

export type TxEnvelopeType = 'LEGACY' | 'EIP2930' | 'EIP1559';

export interface AccessTuple {
  address: string;
  storageKeys: string[];
}

export interface TransactionPayload {
  type: TxEnvelopeType;
  chainId?: number;
  nonce: bigint;
  maxPriorityFeePerGas?: bigint;
  maxFeePerGas?: bigint;
  gasPrice?: bigint;
  gasLimit: bigint;
  to: string | null;
  value: bigint;
  data: Uint8Array;
  accessList?: AccessTuple[];
  v?: bigint;
  r?: Uint8Array;
  s?: Uint8Array;
}

export interface SerializationMetrics {
  operation: string;
  sampleCount: number;
  totalDurationMs: number;
  throughputOpsPerSec: number;
  meanLatencyUs: number;
  p50LatencyUs: number;
  p90LatencyUs: number;
  p99LatencyUs: number;
  bytesProcessed: number;
  megabytesPerSec: number;
}

export class RlpTransactionBenchmarkProfiler {
  /**
   * Encodes a single byte string or nested array into RLP bytes.
   */
  static encodeRLP(item: Uint8Array | string | bigint | number | any[]): Uint8Array {
    if (typeof item === 'bigint' || typeof item === 'number') {
      const hex = item === 0n || item === 0 ? '' : item.toString(16);
      const padded = hex.length % 2 === 1 ? '0' + hex : hex;
      const buf = padded.length === 0 ? Buffer.alloc(0) : Buffer.from(padded, 'hex');
      return RlpTransactionBenchmarkProfiler.encodeRLP(buf);
    }

    if (typeof item === 'string') {
      const hex = item.startsWith('0x') ? item.slice(2) : item;
      const buf = Buffer.from(hex, 'hex');
      return RlpTransactionBenchmarkProfiler.encodeRLP(buf);
    }

    if (Array.isArray(item)) {
      const encodedItems = item.map((sub) => RlpTransactionBenchmarkProfiler.encodeRLP(sub));
      const body = Buffer.concat(encodedItems);
      const len = body.length;
      if (len <= 55) {
        return Buffer.concat([Buffer.from([0xc0 + len]), body]);
      }
      const lenBuf = RlpTransactionBenchmarkProfiler.encodeLength(len, 0xf7);
      return Buffer.concat([lenBuf, body]);
    }

    const buf = Buffer.isBuffer(item) ? item : Buffer.from(item);
    const len = buf.length;
    if (len === 1 && buf[0] < 0x80) {
      return buf;
    }
    if (len <= 55) {
      return Buffer.concat([Buffer.from([0x80 + len]), buf]);
    }
    const lenBuf = RlpTransactionBenchmarkProfiler.encodeLength(len, 0xb7);
    return Buffer.concat([lenBuf, buf]);
  }

  /**
   * Helper to encode length prefix for payloads > 55 bytes.
   */
  private static encodeLength(length: number, offset: number): Buffer {
    const hex = length.toString(16);
    const padded = hex.length % 2 === 1 ? '0' + hex : hex;
    const buf = Buffer.from(padded, 'hex');
    const firstByte = Buffer.from([offset + buf.length]);
    return Buffer.concat([firstByte, buf]);
  }

  /**
   * Decodes an RLP-encoded buffer into raw item structures.
   */
  static decodeRLP(input: Uint8Array): any {
    const buf = Buffer.from(input);
    const { decoded } = RlpTransactionBenchmarkProfiler.decodeItem(buf, 0);
    return decoded;
  }

  private static decodeItem(buf: Buffer, offset: number): { decoded: any; nextOffset: number } {
    if (offset >= buf.length) {
      throw new Error('RLP decoding underflow');
    }
    const prefix = buf[offset];

    if (prefix < 0x80) {
      return { decoded: buf.subarray(offset, offset + 1), nextOffset: offset + 1 };
    }
    if (prefix <= 0xb7) {
      const strLen = prefix - 0x80;
      const end = offset + 1 + strLen;
      if (end > buf.length) throw new Error('RLP string out of bounds');
      return { decoded: buf.subarray(offset + 1, end), nextOffset: end };
    }
    if (prefix <= 0xbf) {
      const lenOfLen = prefix - 0xb7;
      const lenEnd = offset + 1 + lenOfLen;
      if (lenEnd > buf.length) throw new Error('RLP length prefix out of bounds');
      const strLen = parseInt(buf.subarray(offset + 1, lenEnd).toString('hex'), 16);
      const dataEnd = lenEnd + strLen;
      if (dataEnd > buf.length) throw new Error('RLP long string data out of bounds');
      return { decoded: buf.subarray(lenEnd, dataEnd), nextOffset: dataEnd };
    }
    if (prefix <= 0xf7) {
      const listLen = prefix - 0xc0;
      const listEnd = offset + 1 + listLen;
      if (listEnd > buf.length) throw new Error('RLP list out of bounds');
      let curr = offset + 1;
      const items: any[] = [];
      while (curr < listEnd) {
        const res = RlpTransactionBenchmarkProfiler.decodeItem(buf, curr);
        items.push(res.decoded);
        curr = res.nextOffset;
      }
      return { decoded: items, nextOffset: listEnd };
    }
    {
      const lenOfLen = prefix - 0xf7;
      const lenEnd = offset + 1 + lenOfLen;
      if (lenEnd > buf.length) throw new Error('RLP long list length out of bounds');
      const listLen = parseInt(buf.subarray(offset + 1, lenEnd).toString('hex'), 16);
      const listEnd = lenEnd + listLen;
      if (listEnd > buf.length) throw new Error('RLP long list data out of bounds');
      let curr = lenEnd;
      const items: any[] = [];
      while (curr < listEnd) {
        const res = RlpTransactionBenchmarkProfiler.decodeItem(buf, curr);
        items.push(res.decoded);
        curr = res.nextOffset;
      }
      return { decoded: items, nextOffset: listEnd };
    }
  }

  /**
   * Serializes a structured Ethereum transaction according to EIP-2718 envelopes.
   */
  static serializeTransaction(tx: TransactionPayload): Uint8Array {
    if (tx.type === 'LEGACY') {
      const fields = [
        tx.nonce,
        tx.gasPrice ?? 0n,
        tx.gasLimit,
        tx.to ?? '',
        tx.value,
        tx.data,
        tx.v ?? 27n,
        tx.r ?? Buffer.alloc(0),
        tx.s ?? Buffer.alloc(0),
      ];
      return RlpTransactionBenchmarkProfiler.encodeRLP(fields);
    }

    if (tx.type === 'EIP2930') {
      const accessListFormatted = (tx.accessList ?? []).map((acc) => [
        acc.address,
        acc.storageKeys,
      ]);
      const payload = [
        tx.chainId ?? 1,
        tx.nonce,
        tx.gasPrice ?? 0n,
        tx.gasLimit,
        tx.to ?? '',
        tx.value,
        tx.data,
        accessListFormatted,
        tx.v ?? 0n,
        tx.r ?? Buffer.alloc(0),
        tx.s ?? Buffer.alloc(0),
      ];
      const encoded = RlpTransactionBenchmarkProfiler.encodeRLP(payload);
      return Buffer.concat([Buffer.from([0x01]), Buffer.from(encoded)]);
    }

    // EIP-1559
    const accessListFormatted = (tx.accessList ?? []).map((acc) => [
      acc.address,
      acc.storageKeys,
    ]);
    const payload = [
      tx.chainId ?? 1,
      tx.nonce,
      tx.maxPriorityFeePerGas ?? 0n,
      tx.maxFeePerGas ?? 0n,
      tx.gasLimit,
      tx.to ?? '',
      tx.value,
      tx.data,
      accessListFormatted,
      tx.v ?? 0n,
      tx.r ?? Buffer.alloc(0),
      tx.s ?? Buffer.alloc(0),
    ];
    const encoded = RlpTransactionBenchmarkProfiler.encodeRLP(payload);
    return Buffer.concat([Buffer.from([0x02]), Buffer.from(encoded)]);
  }

  /**
   * Runs an isolated benchmark profiling loop over transaction serialization.
   */
  static profileSerialization(
    txFactory: () => TransactionPayload,
    sampleCount: number = 5000,
    operationName: string = 'tx_serialize_eip1559'
  ): SerializationMetrics {
    const latenciesUs: number[] = new Array(sampleCount);
    let totalBytes = 0;

    const startHr = process.hrtime.bigint();

    for (let i = 0; i < sampleCount; i++) {
      const tx = txFactory();
      const iterStart = process.hrtime.bigint();
      const serialized = RlpTransactionBenchmarkProfiler.serializeTransaction(tx);
      const iterEnd = process.hrtime.bigint();

      totalBytes += serialized.length;
      let durUs = Number(iterEnd - iterStart) / 1000;
      if (durUs <= 0) durUs = 0.1; // Timer resolution fallback
      latenciesUs[i] = durUs;
    }

    const endHr = process.hrtime.bigint();
    const totalNs = Number(endHr - startHr);
    const totalDurationMs = Math.max(1, totalNs / 1_000_000);

    latenciesUs.sort((a, b) => a - b);
    const meanLatencyUs = latenciesUs.reduce((sum, v) => sum + v, 0) / sampleCount;
    const p50LatencyUs = latenciesUs[Math.floor(sampleCount * 0.50)];
    const p90LatencyUs = latenciesUs[Math.floor(sampleCount * 0.90)];
    const p99LatencyUs = latenciesUs[Math.floor(sampleCount * 0.99)];

    const throughputOpsPerSec = Math.round((sampleCount / totalDurationMs) * 1000);
    const megabytesPerSec = Number(((totalBytes / (1024 * 1024)) / (totalDurationMs / 1000)).toFixed(2));

    return {
      operation: operationName,
      sampleCount,
      totalDurationMs,
      throughputOpsPerSec,
      meanLatencyUs: Number(meanLatencyUs.toFixed(2)),
      p50LatencyUs: Number(p50LatencyUs.toFixed(2)),
      p90LatencyUs: Number(p90LatencyUs.toFixed(2)),
      p99LatencyUs: Number(p99LatencyUs.toFixed(2)),
      bytesProcessed: totalBytes,
      megabytesPerSec,
    };
  }

  /**
   * Generates synthetic mock transaction payloads for profiling.
   */
  static createMockTransaction(type: TxEnvelopeType = 'EIP1559', calldataSize: number = 256): TransactionPayload {
    const calldata = crypto.randomBytes(calldataSize);
    return {
      type,
      chainId: 1,
      nonce: 42n,
      maxPriorityFeePerGas: 2_000_000_000n,
      maxFeePerGas: 45_000_000_000n,
      gasPrice: 45_000_000_000n,
      gasLimit: 250_000n,
      to: '0x71C841832049987c9B3E256C8Fa72f2E28F8b049',
      value: 1_500_000_000_000_000_000n,
      data: new Uint8Array(calldata),
      accessList: [
        {
          address: '0x0000000000000000000000000000000000000001',
          storageKeys: [
            '0x0000000000000000000000000000000000000000000000000000000000000001',
          ],
        },
      ],
      v: 0n,
      r: new Uint8Array(crypto.randomBytes(32)),
      s: new Uint8Array(crypto.randomBytes(32)),
    };
  }
}
