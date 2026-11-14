/**
 * Seeded PRNG for demo mode (demo-mode R4.1, R5.2). mulberry32: small, fast,
 * returns [0, 1). Production code does not import from src/test, so this is its own copy.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
