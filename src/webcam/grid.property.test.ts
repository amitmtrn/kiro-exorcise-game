import { describe, it, expect, afterEach } from 'vitest'
import fc from 'fast-check'
import { GRID_LADDER, setMotionGrid, resetMotionGrid, type MotionGrid } from './grid'
import { computeFrameDiff, scaleHitbox } from './diff'
import { updateMotionPixels } from '../game/collision'
import { MotionButton, DWELL_MS } from '../ui/motionButton'

afterEach(() => resetMotionGrid())

const LUM_BG = 40
const LUM_BLOB = 200

/** Frames of a grid size: previous = flat grey, current = grey with a bright blob given in display space. */
function frames(g: MotionGrid, W: number, H: number, blob: { x: number; y: number; w: number; h: number } | null) {
  const mk = () => new Uint8ClampedArray(g.w * g.h * 4).fill(LUM_BG)
  const prev = mk(), cur = mk()
  if (blob) {
    const x0 = Math.floor(blob.x / W * g.w), x1 = Math.ceil((blob.x + blob.w) / W * g.w)
    const y0 = Math.floor(blob.y / H * g.h), y1 = Math.ceil((blob.y + blob.h) / H * g.h)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * g.w + x) * 4
      cur[i] = cur[i + 1] = cur[i + 2] = LUM_BLOB
    }
  }
  const wrap = (d: Uint8ClampedArray) => ({ data: d, width: g.w, height: g.h, colorSpace: 'srgb' }) as unknown as ImageData
  return { cur: wrap(cur), prev: wrap(prev) }
}

const display = fc.constantFrom<[number, number]>([640, 480], [1280, 720], [1920, 1080], [800, 600])
const blobArb = (W: number, H: number) => fc.record({
  w: fc.double({ min: 0.12 * W, max: 0.3 * W, noNaN: true }),
  h: fc.double({ min: 0.12 * W, max: 0.3 * W, noNaN: true }),
  fx: fc.double({ min: 0, max: 1, noNaN: true }),
  fy: fc.double({ min: 0, max: 1, noNaN: true }),
}).map(({ w, h, fx, fy }) => {
  const hh = Math.min(h, H)
  return { x: fx * (W - w), y: fy * (H - hh), w, h: hh }
})

describe('hit detection at every supported resolution (R2.5)', () => {
  it('a moving blob in its hitbox is a hit at every grid', () => {
    const scene = display.chain((dims) => blobArb(dims[0], dims[1]).map((blob) => ({ dims, blob })))
    fc.assert(fc.property(scene, ({ dims: [W, H], blob }) => {
      for (const g of GRID_LADDER) {
        setMotionGrid(g)
        const { cur, prev } = frames(g, W, H, blob)
        if (!computeFrameDiff(cur, prev, scaleHitbox(blob, W, H), g.w)) return false
      }
      return true
    }), { numRuns: 300 })
  })

  it('no blob is never a hit; a blob elsewhere does not hit a distant hitbox', () => {
    fc.assert(fc.property(display, fc.constantFrom(...GRID_LADDER), (dims, g) => {
      const [W, H] = dims
      setMotionGrid(g)
      const { cur, prev } = frames(g, W, H, null)
      expect(computeFrameDiff(cur, prev, scaleHitbox({ x: 0.3 * W, y: 0.3 * H, w: 0.2 * W, h: 0.2 * W }, W, H), g.w)).toBe(false)
      const far = frames(g, W, H, { x: 0, y: 0, w: 0.12 * W, h: 0.12 * W })
      expect(computeFrameDiff(far.cur, far.prev, scaleHitbox({ x: 0.7 * W, y: 0.6 * H, w: 0.2 * W, h: 0.2 * W }, W, H), g.w)).toBe(false)
    }))
  })
})

describe('motion buttons at every grid (R2.2)', () => {
  /** Lattice points of the grid inside a display circle, as the loop publishes them (grid coords). */
  function discPoints(g: MotionGrid, W: number, H: number, cx: number, cy: number, r: number) {
    const pts: Array<{ x: number; y: number }> = []
    for (let gy = 0; gy < g.h; gy += g.stride) for (let gx = 0; gx < g.w; gx += g.stride) {
      const dx = gx * W / g.w - cx, dy = gy * H / g.h - cy
      if (dx * dx + dy * dy <= r * r * 0.81) pts.push({ x: gx, y: gy })
    }
    return pts
  }

  it('fills with the same dwell at every grid (within one camera frame)', () => {
    fc.assert(fc.property(display, fc.double({ min: 0.2, max: 0.8, noNaN: true }), (dims, fx) => {
      const [W, H] = dims
      const r = Math.min(80, Math.max(20, 0.065 * H))
      const cx = fx * W, cy = 0.19 * H
      const triggerTimes = GRID_LADDER.map((g) => {
        setMotionGrid(g)
        const btn = new MotionButton(cx, cy, r, 'x')
        for (let t = 0; t < 3000; t += 33) {
          updateMotionPixels({ points: discPoints(g, W, H, cx, cy, r), sampled: 1, moved: 1, changed: true }, W, H)
          if (btn.update(t) === 'triggered') return t
        }
        return Infinity
      })
      const lo = Math.min(...triggerTimes), hi = Math.max(...triggerTimes)
      expect(lo).toBeGreaterThanOrEqual(DWELL_MS)
      expect(hi - lo).toBeLessThanOrEqual(33)
    }), { numRuns: 50 })
  })
})
