import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { SyntheticCamera, BG_LUM, HAND_LUM } from './camera'
import { computeMotionMask, computeFrameDiff, scaleHitbox, MOTION_W, MOTION_H, DIFF_THRESHOLD } from '../webcam/diff'
import { DEMO } from './params'

const W = 1280, H = 720, R = 40
const F = DEMO.frameMs

function lum(img: ImageData, x: number, y: number): number {
  const i = (y * MOTION_W + x) * 4
  return (img.data[i] * 77 + img.data[i + 1] * 150 + img.data[i + 2] * 29) >> 8
}

describe('SyntheticCamera frame format (demo-mode R3.1)', () => {
  it('returns MOTION_W × MOTION_H RGBA frames with grey, opaque pixels', () => {
    const cam = new SyntheticCamera({ x: 600, y: 300 }, R, W, H)
    const { cur, prev } = cam.step(F, { x: 640, y: 300 }, R, W, H)
    for (const f of [cur, prev]) {
      expect(f.width).toBe(MOTION_W); expect(f.height).toBe(MOTION_H)
      expect(f.data.length).toBe(MOTION_W * MOTION_H * 4)
      for (let i = 0; i < f.data.length; i += 4 * 997) {
        expect(f.data[i]).toBe(f.data[i + 1]); expect(f.data[i]).toBe(f.data[i + 2]); expect(f.data[i + 3]).toBe(255)
      }
    }
  })

  it('draws the hand as a bright disc at the display position (scaled to motion space)', () => {
    const cam = new SyntheticCamera({ x: 640, y: 360 }, R, W, H)
    const { cur } = cam.step(F, { x: 640, y: 360 }, R, W, H)
    expect(lum(cur, 160, 90)).toBe(HAND_LUM) // 640 * 320/1280, 360 * 180/720
    expect(lum(cur, 4, 4)).toBeLessThan(BG_LUM + 5)
  })
})

describe('duplicate ticks and new frames (R3.2)', () => {
  it('a tick between camera frames returns the same frame as cur and prev, changed = false', () => {
    const cam = new SyntheticCamera({ x: 300, y: 300 }, R, W, H)
    cam.step(F, { x: 320, y: 300 }, R, W, H) // new frame
    const dup = cam.step(F / 2, { x: 400, y: 300 }, R, W, H)
    expect(dup.isNew).toBe(false)
    expect(dup.cur).toBe(dup.prev)
    expect(computeMotionMask(dup.cur, dup.prev, MOTION_W, MOTION_H).changed).toBe(false)
  })

  it('at 60 fps ticks every other tick is a new frame', () => {
    const cam = new SyntheticCamera({ x: 300, y: 300 }, R, W, H)
    const flags = Array.from({ length: 10 }, () => cam.step(1000 / 60, { x: 300, y: 300 }, R, W, H).isNew)
    expect(flags.filter(Boolean).length).toBe(5)
    expect(flags[0]).toBe(false); expect(flags[1]).toBe(true)
  })

  it('at 30 fps ticks (time scale 2) every tick is a new frame', () => {
    const cam = new SyntheticCamera({ x: 300, y: 300 }, R, W, H)
    for (let i = 0; i < 20; i++) expect(cam.step(DEMO.stepMs * 2, { x: 300, y: 300 }, R, W, H).isNew).toBe(true)
  })

  it('a long stall delivers one frame, not a burst', () => {
    const cam = new SyntheticCamera({ x: 300, y: 300 }, R, W, H)
    expect(cam.step(500, { x: 300, y: 300 }, R, W, H).isNew).toBe(true)
    expect(cam.step(1, { x: 300, y: 300 }, R, W, H).isNew).toBe(false)
  })

  it('a new frame is not byte-identical to the previous one even for a resting hand (sensor noise)', () => {
    const cam = new SyntheticCamera({ x: 300, y: 300 }, R, W, H)
    const a = cam.step(F, { x: 300, y: 300 }, R, W, H)
    const mask = computeMotionMask(a.cur, a.prev, MOTION_W, MOTION_H)
    expect(mask.changed).toBe(true)
    expect(mask.points).toHaveLength(0) // noise stays below DIFF_THRESHOLD: a resting hand moves nothing
    expect(mask.moved).toBe(0)
  })
})

describe('mask of a moving hand (R3.1, real computeMotionMask)', () => {
  it('a moving hand yields points on the 4 px grid inside the two discs', () => {
    const cam = new SyntheticCamera({ x: 400, y: 360 }, R, W, H)
    cam.step(F, { x: 400, y: 360 }, R, W, H)
    const { cur, prev } = cam.step(F, { x: 520, y: 360 }, R, W, H)
    const mask = computeMotionMask(cur, prev, MOTION_W, MOTION_H)
    expect(mask.changed).toBe(true)
    expect(mask.moved).toBeGreaterThan(20)
    expect(mask.sampled).toBe((MOTION_W / 4) * (MOTION_H / 4))
    for (const p of mask.points) {
      expect(p.x % 4).toBe(0); expect(p.y % 4).toBe(0)
      const dxA = p.x * (W / MOTION_W) - 400, dxB = p.x * (W / MOTION_W) - 520
      const dy = p.y * (H / MOTION_H) - 360
      const inA = Math.hypot(dxA, dy) <= R + 6, inB = Math.hypot(dxB, dy) <= R + 6
      expect(inA || inB).toBe(true)
    }
  })

  it('feeds the real hit test: motion through a hitbox over two new frames passes the 2-frame gate', () => {
    const cam = new SyntheticCamera({ x: 300, y: 360 }, R, W, H)
    cam.step(F, { x: 300, y: 360 }, R, W, H)
    const box = scaleHitbox({ x: 600, y: 330, w: 70, h: 70 }, W, H)
    const hits: boolean[] = []
    for (const x of [340, 380, 420, 460, 500, 540, 580, 620, 660, 700]) {
      const { cur, prev } = cam.step(F, { x, y: 360 }, R, W, H)
      hits.push(computeFrameDiff(cur, prev, box, MOTION_W))
    }
    let run = 0, best = 0
    for (const h of hits) { run = h ? run + 1 : 0; best = Math.max(best, run) }
    expect(best).toBeGreaterThanOrEqual(2)
  })

  it('a hand far from a hitbox never moves a pixel inside it', () => {
    const cam = new SyntheticCamera({ x: 100, y: 100 }, R, W, H)
    const box = scaleHitbox({ x: 900, y: 500, w: 80, h: 80 }, W, H)
    let x = 100
    for (let i = 0; i < 30; i++) {
      x += 30
      const { cur, prev } = cam.step(F, { x: Math.min(x, 500), y: 100 + i }, R, W, H)
      expect(computeFrameDiff(cur, prev, box, MOTION_W)).toBe(false)
    }
  })

  it('the threshold the game may calibrate to (≤ 60) still sees the hand and ignores the noise', () => {
    expect(HAND_LUM - BG_LUM).toBeGreaterThan(60)
    expect(DIFF_THRESHOLD).toBeLessThanOrEqual(60)
  })
})

describe('determinism (R3.4)', () => {
  it('the same positions give byte-identical frames', () => {
    const path = Array.from({ length: 40 }, (_, i) => ({ x: 200 + i * 17, y: 300 + (i % 7) * 9 }))
    const run = () => {
      const cam = new SyntheticCamera(path[0], R, W, H)
      const out: number[] = []
      for (const p of path) {
        const f = cam.step(F, p, R, W, H)
        let h = 0
        for (let i = 0; i < f.cur.data.length; i += 4) h = (h * 31 + f.cur.data[i]) >>> 0
        out.push(h)
      }
      return out
    }
    expect(run()).toEqual(run())
  })
})

describe('mask points stay near the hand (property)', () => {
  it('every moved pixel is within a disc of the previous or the new hand position, plus one cell', () => {
    fc.assert(fc.property(
      fc.array(fc.record({ x: fc.integer({ min: -50, max: W + 50 }), y: fc.integer({ min: -50, max: H + 50 }) }), { minLength: 2, maxLength: 12 }),
      fc.integer({ min: 28, max: 60 }),
      (path, r) => {
        const cam = new SyntheticCamera(path[0], r, W, H)
        let last = path[0]
        for (const p of path) {
          const { cur, prev, isNew } = cam.step(F, p, r, W, H)
          const mask = computeMotionMask(cur, prev, MOTION_W, MOTION_H)
          if (!isNew) { if (mask.points.length) return false; continue }
          for (const m of mask.points) {
            const px = m.x * (W / MOTION_W), py = m.y * (H / MOTION_H)
            const slack = r + 4 * (W / MOTION_W) + 2
            if (Math.hypot(px - last.x, py - last.y) > slack && Math.hypot(px - p.x, py - p.y) > slack) return false
          }
          last = p
        }
        return true
      },
    ), { numRuns: 60 })
  })
})

describe('SyntheticCamera.resetPhase (demo-mode R4.8, R5.2)', () => {
  it('restarts the camera clock: the same ticks after a reset give the same new / duplicate pattern', () => {
    const hand = { x: 640, y: 360 }
    const pattern = (cam: SyntheticCamera) => Array.from({ length: 8 }, () => cam.step(F * 0.4, hand, R, W, H).isNew)
    const cam = new SyntheticCamera(hand, R, W, H)
    const first = pattern(cam)
    cam.step(F * 0.3, hand, R, W, H) // leaves a partial frame banked
    cam.resetPhase()
    expect(pattern(cam)).toEqual(first)
  })
})
