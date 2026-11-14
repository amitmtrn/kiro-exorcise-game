/** Skull placement invariants (playtest2-fixes R2, R3): body zone, HUD rects, entry edges, spawn grace. */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { createSkull, SKULL_GRACE_MS } from './enemies/skull'
import { moveEnemies, cullExitedEnemies } from './enemies/movement'
import { bodyZone, hudRects, rectsIntersect } from './zones'
import { mulberry32 } from '../test/prng'
import type { Enemy } from './state'

/** Canvas sizes: 2P halves of the smallest canvas up to the operator's ultra-wide window. */
const sizes = fc.constantFrom<[number, number]>([320, 360], [640, 360], [960, 540], [1280, 720], [1920, 1080], [3024, 1364], [1000, 1000], [360, 640])
const seeds = fc.integer({ min: 1, max: 2 ** 31 - 1 })
const mk = (W: number, H: number, seed: number): Enemy => createSkull(W, H, 1, mulberry32(seed))

describe('skull placement (R2, R3)', () => {
  it('spawns outside the left or right edge, between the HUD rows, never top or bottom', () => {
    fc.assert(fc.property(sizes, seeds, ([W, H], seed) => {
      const s = mk(W, H, seed)
      expect(s.x < 0 || s.x > W).toBe(true)
      expect(s.y).toBeGreaterThan(0)
      expect(s.y).toBeLessThan(H)
      for (const r of hudRects(W, H)) expect(s.y > r.y && s.y < r.y + r.h && s.x > r.x && s.x < r.x + r.w).toBe(false)
    }), { numRuns: 300 })
  })

  it('its whole flight, hover and exit never touch the body zone or a HUD rect', () => {
    fc.assert(fc.property(sizes, seeds, fc.constantFrom(8, 16, 33, 100), ([W, H], seed, dt) => {
      let list = [mk(W, H, seed)]
      const body = bodyZone(W, H), huds = hudRects(W, H)
      for (let t = 0; t < 14_000 && list.length > 0; t += dt) {
        list = cullExitedEnemies(moveEnemies(list, dt, W, H), W, H)
        for (const e of list) {
          expect(rectsIntersect(e.hitbox, body)).toBe(false)
          for (const r of huds) expect(rectsIntersect(e.hitbox, r)).toBe(false)
        }
      }
    }), { numRuns: 120 })
  })

  it('the target is beside the body zone, inside the screen', () => {
    fc.assert(fc.property(sizes, seeds, ([W, H], seed) => {
      const s = mk(W, H, seed)
      const half = s.hitbox.w / 2
      const box = { x: s.targetX - half, y: s.targetY - half, w: 2 * half, h: 2 * half }
      expect(rectsIntersect(box, bodyZone(W, H))).toBe(false)
      expect(s.targetX).toBeGreaterThan(0)
      expect(s.targetX).toBeLessThan(W)
    }), { numRuns: 300 })
  })

  it('grace is at least 800 ms and only counts while the whole hitbox is on screen', () => {
    expect(SKULL_GRACE_MS).toBeGreaterThanOrEqual(800)
    fc.assert(fc.property(sizes, seeds, fc.constantFrom(8, 16, 33, 100), ([W, H], seed, dt) => {
      let e = mk(W, H, seed)
      expect(e.graceMs).toBe(SKULL_GRACE_MS)
      let onScreenMs = 0
      for (let t = 0; t < 8000; t += dt) {
        const b = e.hitbox
        const full = b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H
        if (onScreenMs === 0) expect(e.graceMs).toBe(SKULL_GRACE_MS) // untouched until fully visible
        if (full) onScreenMs += dt
        e = moveEnemies([e], dt, W, H)[0]
        // grace never ends before it has had SKULL_GRACE_MS of fully visible time
        if (e.graceMs === 0) expect(onScreenMs).toBeGreaterThanOrEqual(SKULL_GRACE_MS - dt)
      }
    }), { numRuns: 100 })
  })
})
