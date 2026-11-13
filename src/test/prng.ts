/**
 * Seeded randomness for property tests (pbt R1.3).
 * Lets a failing fast-check counter-example be replayed exactly.
 */

/** mulberry32 — small, fast, good-enough 32-bit PRNG returning [0, 1). */
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

/** Runs `fn` with `Math.random` replaced by a seeded generator; always restores it. */
export function withSeededRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random
  Math.random = mulberry32(seed)
  try {
    return fn()
  } finally {
    Math.random = original
  }
}
