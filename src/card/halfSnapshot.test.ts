import { describe, it, expect } from 'vitest'
import {
  halfSnapshotGeometry, grabHalfSnapshot, rawFractionToDisplayX, displayXToSnapshotX, releaseSnapshot,
} from './halfSnapshot'
import { SNAPSHOT_MAX_H, SNAPSHOT_MAX_W } from './snapshot'

type Op = [string, unknown[]]
/** A canvas whose context records the ops and composes the transform like a real 2D context. */
function fakeCanvas() {
  const ops: Op[] = []
  let m = { a: 1, d: 1, e: 0 } // x' = a·x + e (no skew / vertical shift needed here)
  const stack: Array<typeof m> = []
  const canvas = { width: 0, height: 0 } as unknown as HTMLCanvasElement
  const ctx = {
    canvas,
    save: () => { stack.push({ ...m }) },
    restore: () => { m = stack.pop()! },
    scale: (sx: number, sy: number) => { ops.push(['scale', [sx, sy]]); m = { a: m.a * sx, d: m.d * sy, e: m.e } },
    translate: (tx: number) => { ops.push(['translate', [tx]]); m = { a: m.a, d: m.d, e: m.e + m.a * tx } },
    drawImage: (...a: unknown[]) => { ops.push(['drawImage', [...a, { ...m }]]) },
  }
  ;(canvas as unknown as { getContext: () => unknown }).getContext = () => ctx
  return { canvas, ops }
}

describe('halfSnapshotGeometry (two-player-card R2.3)', () => {
  it('covers exactly one half, the left half for seat 0 and the right half for seat 1', () => {
    const a = halfSnapshotGeometry(0, 1280, 720)
    const b = halfSnapshotGeometry(1, 1280, 720)
    expect(a.offsetX).toBe(0)
    expect(b.offsetX).toBe(640)
    expect(a.halfW).toBe(640)
    expect(a.w / a.h).toBeCloseTo(640 / 720, 1)
  })

  it('caps the snapshot at 640 × 480 and keeps the half aspect ratio', () => {
    const g = halfSnapshotGeometry(1, 3840, 2160)
    expect(g.w).toBeLessThanOrEqual(SNAPSHOT_MAX_W)
    expect(g.h).toBeLessThanOrEqual(SNAPSHOT_MAX_H)
    expect(g.w / g.h).toBeCloseTo(1920 / 2160, 1)
  })

  it('uses integer halves on odd widths', () => {
    expect(halfSnapshotGeometry(1, 1001, 600).offsetX).toBe(500)
    expect(halfSnapshotGeometry(0, 1001, 600).halfW).toBe(500)
  })
})

describe('mirror mapping (two-player-card R2.4)', () => {
  const W = 1280
  const inCanvas = (x: number, seat: 0 | 1) => {
    const g = halfSnapshotGeometry(seat, W, 720)
    const sx = displayXToSnapshotX(x, g)
    return sx >= 0 && sx < g.w
  }

  it('the right half of the raw sensor image is player 1 (left on screen), the left half is player 2', () => {
    for (const u of [0.6, 0.75, 0.95]) {
      const x = rawFractionToDisplayX(u, W)
      expect(inCanvas(x, 0)).toBe(true)
      expect(inCanvas(x, 1)).toBe(false)
    }
    for (const u of [0.05, 0.25, 0.4]) {
      const x = rawFractionToDisplayX(u, W)
      expect(inCanvas(x, 1)).toBe(true)
      expect(inCanvas(x, 0)).toBe(false)
    }
  })

  it('the draw call applies the mirrored transform: raw columns land where the live view shows them', () => {
    for (const seat of [0, 1] as const) {
      const { canvas, ops } = fakeCanvas()
      const video = {} as HTMLVideoElement
      grabHalfSnapshot(video, seat, W, 720, () => canvas)
      const draw = ops.find(([n]) => n === 'drawImage')![1]
      expect(draw[0]).toBe(video)
      expect(draw.slice(1, 5)).toEqual([0, 0, W, 720]) // one draw of the full view; the canvas clips it
      const m = draw[5] as { a: number; e: number }
      const g = halfSnapshotGeometry(seat, W, 720)
      expect(m.a).toBeLessThan(0) // mirrored
      for (const u of [0, 0.1, 0.5, 0.9, 1]) {
        const rawX = u * W // drawImage destination x of the raw column
        const sx = m.a * rawX + m.e
        expect(sx).toBeCloseTo(displayXToSnapshotX(rawFractionToDisplayX(u, W), g), 6)
      }
    }
  })

  it('the canvas is only one half wide, so the other half is never stored', () => {
    const { canvas } = fakeCanvas()
    grabHalfSnapshot({} as HTMLVideoElement, 0, 1280, 720, () => canvas)
    expect(canvas.width).toBeLessThanOrEqual(640)
    expect(canvas.width / canvas.height).toBeLessThan(1) // portrait half, not the full 16:9 view
  })

  it('release frees the pixels', () => {
    const { canvas } = fakeCanvas()
    grabHalfSnapshot({} as HTMLVideoElement, 1, 800, 600, () => canvas)
    releaseSnapshot(canvas)
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })
})
