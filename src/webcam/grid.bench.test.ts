import { describe, it, expect, afterEach } from 'vitest'
import { GRID_LADDER, setMotionGrid, resetMotionGrid } from './grid'
import { computeMotionMask, computeFrameDiff, scaleHitbox } from './diff'

/**
 * Micro-benchmark (playtest-polish R4.2): analysis cost per frame at each grid size =
 * whole-frame motion mask + 6 enemy hitbox diffs on a 1280 x 720 display, on moving synthetic frames.
 * Prints a table; only the deterministic columns are asserted (timings vary by machine).
 * The camera-side getImageData / drawImage cost cannot be measured in Node, so the bytes of
 * ImageData read per frame are reported as its proxy.
 */
const HITBOXES = [
  { x: 100, y: 100, w: 90, h: 90 }, { x: 400, y: 200, w: 90, h: 90 }, { x: 700, y: 300, w: 120, h: 120 },
  { x: 900, y: 120, w: 90, h: 90 }, { x: 200, y: 500, w: 90, h: 90 }, { x: 560, y: 260, w: 160, h: 160 },
]

function makeFrames(w: number, h: number) {
  const a = new Uint8ClampedArray(w * h * 4), b = new Uint8ClampedArray(w * h * 4)
  let s = 12345
  for (let i = 0; i < a.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; a[i] = s >>> 24; b[i] = (s >>> 16) & 255 }
  const wrap = (d: Uint8ClampedArray) => ({ data: d, width: w, height: h, colorSpace: 'srgb' }) as unknown as ImageData
  return { cur: wrap(a), prev: wrap(b) }
}

function median(xs: number[]): number { return [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)] }

afterEach(() => resetMotionGrid())

describe('analysis cost per frame by resolution', () => {
  it('shrinks with the grid (samples, bytes) and prints the measured timings', () => {
    const rows: Array<{ grid: string; stride: number; maskSamples: number; imageDataKB: number; usPerFrame: number }> = []
    for (const g of GRID_LADDER) {
      setMotionGrid(g)
      const { cur, prev } = makeFrames(g.w, g.h)
      const boxes = HITBOXES.map((hb) => scaleHitbox(hb, 1280, 720))
      const once = () => {
        const m = computeMotionMask(cur, prev, g.w, g.h)
        let hits = 0
        for (const b of boxes) if (computeFrameDiff(cur, prev, b, g.w)) hits++
        return m.sampled + hits
      }
      for (let i = 0; i < 200; i++) once() // warm up
      const runs: number[] = []
      for (let r = 0; r < 9; r++) {
        const t0 = performance.now()
        for (let i = 0; i < 300; i++) once()
        runs.push(((performance.now() - t0) / 300) * 1000)
      }
      rows.push({
        grid: `${g.w}x${g.h}`, stride: g.stride,
        maskSamples: computeMotionMask(cur, prev, g.w, g.h).sampled,
        imageDataKB: Math.round((2 * g.w * g.h * 4) / 1024),
        usPerFrame: Math.round(median(runs) * 10) / 10,
      })
    }
    console.log('\nanalysis cost per frame (mask + 6 hitbox diffs), median of 9 x 300 runs\n' +
      rows.map((r) => `${r.grid.padEnd(8)} stride ${r.stride}  mask samples ${String(r.maskSamples).padStart(5)}  ImageData ${String(r.imageDataKB).padStart(4)} KB  ${String(r.usPerFrame).padStart(7)} us/frame`).join('\n'))
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].imageDataKB).toBeLessThan(rows[i - 1].imageDataKB)
    }
    // The mask sample count is deterministic: it documents (and pins) the table in the README. 96 x 54 samples
    // more than any other grid because it uses stride 1, so its JS analysis is the most expensive step.
    expect(rows.map((r) => [r.grid, r.maskSamples])).toEqual([['320x180', 3600], ['160x90', 3600], ['128x72', 2304], ['96x54', 5184]])
    expect(rows[3].maskSamples).toBe(Math.max(...rows.map((r) => r.maskSamples)))
    // 96 x 54 uses stride 1 (more samples than 128 x 72) but copies far less data; the analysis stays within 2x of the full grid.
    expect(rows[rows.length - 1].usPerFrame).toBeLessThan(rows[0].usPerFrame * 2)
  })
})
