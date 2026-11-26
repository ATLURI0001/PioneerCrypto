export function benchmarkAbiEncode(argCount: number, iterations = 500): { opsPerSec: number } {
  const start = performance.now();
  let len = 0;
  for (let i = 0; i < iterations; i++) {
    let encoded = '';
    for (let a = 0; a < argCount; a++) encoded += a.toString(16).padStart(64, '0');
    len += encoded.length;
  }
  const sec = Math.max((performance.now() - start) / 1000, 1e-6);
  return { opsPerSec: Math.round((iterations + (len & 0)) / sec) };
}
