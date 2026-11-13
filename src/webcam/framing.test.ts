import { describe, it, expect } from 'vitest'
import {
  checkFraming, tickFraming, isFramingStable, FRAMING_STABLE_MS, FRAMING_HINTS,
  type FramingFrame,
} from './framing'

const W = 32, H = 18

function frame(fn: (x: number, y: number) => [number, number, number]): FramingFrame {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = fn(x, y)
    const i = (y * W + x) * 4
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
  }
  return { data, width: W, height: H }
}

/** Grey checkerboard of 2×2 blocks: plenty of local contrast. */
const checker = (lo: number, hi: number) => (x: number, y: number): [number, number, number] => {
  const v = ((x >> 1) + (y >> 1)) % 2 === 0 ? lo : hi
  return [v, v, v]
}

describe('checkFraming', () => {
  it('flags a black frame as too-dark', () => {
    expect(checkFraming(frame(() => [0, 0, 0]))).toBe('too-dark')
  })

  it('flags a dim textured frame as too-dark', () => {
    expect(checkFraming(frame(checker(5, 40)))).toBe('too-dark')
  })

  it('flags a frame filled with skin tone as too-close', () => {
    expect(checkFraming(frame(() => [200, 140, 110]))).toBe('too-close')
  })

  it('does not flag a small skin patch in a textured room', () => {
    const f = frame((x, y) => (x >= 12 && x < 16 && y >= 6 && y < 10 ? [200, 140, 110] : checker(60, 200)(x, y)))
    expect(checkFraming(f)).toBe('ok')
  })

  it('flags a flat mid-grey frame as low-detail', () => {
    expect(checkFraming(frame(() => [128, 128, 128]))).toBe('low-detail')
  })

  it('flags a blown-out white frame as low-detail', () => {
    expect(checkFraming(frame(() => [255, 255, 255]))).toBe('low-detail')
  })

  it('accepts a textured, well-lit frame', () => {
    expect(checkFraming(frame(checker(60, 200)))).toBe('ok')
  })

  it('evaluates dark before close before low-detail', () => {
    // dark skin-ish flat frame: dark wins
    expect(checkFraming(frame(() => [30, 20, 15]))).toBe('too-dark')
    // bright flat skin frame: too-close wins over low-detail
    expect(checkFraming(frame(() => [200, 140, 110]))).toBe('too-close')
  })

  it('treats an empty or short buffer as not ok', () => {
    expect(checkFraming({ data: [], width: 0, height: 0 })).toBe('too-dark')
    expect(checkFraming({ data: new Uint8ClampedArray(8), width: 4, height: 4 })).toBe('too-dark')
  })

  it('has a hint for every status', () => {
    for (const s of ['ok', 'too-dark', 'too-close', 'low-detail'] as const) {
      expect(FRAMING_HINTS[s].length).toBeGreaterThan(0)
    }
  })
})

describe('tickFraming', () => {
  it('accumulates deltaMs while ok and resets otherwise', () => {
    let ms = 0
    ms = tickFraming(ms, 'ok', 400)
    ms = tickFraming(ms, 'ok', 400)
    expect(ms).toBe(800)
    expect(isFramingStable(ms)).toBe(false)
    ms = tickFraming(ms, 'ok', 200)
    expect(isFramingStable(ms)).toBe(true)
    expect(tickFraming(ms, 'too-close', 16)).toBe(0)
  })

  it('is independent of how the time is sliced', () => {
    let a = 0
    for (let i = 0; i < 100; i++) a = tickFraming(a, 'ok', 10)
    expect(a).toBe(tickFraming(0, 'ok', 1000))
    expect(a).toBe(FRAMING_STABLE_MS)
  })

  it('ignores negative deltas', () => {
    expect(tickFraming(100, 'ok', -50)).toBe(100)
  })
})
