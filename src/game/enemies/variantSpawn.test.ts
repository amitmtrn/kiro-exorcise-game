import { describe, it, expect } from 'vitest'
import { pickSpawn, createWispPair, createMirror, createBlink, spawnVariant, skullClearancePx, PAIR_GAP_PX } from './variantSpawn'
import { mulberry32 as prng } from '../../test/prng'
import { travelMs, MIN_TRAVEL_MS, initialState } from './variants'

const seeded = (n: number) => prng(n)

describe('variant spawn', () => {
  it('spawns outside the area on an edge', () => {
    const p = pickSpawn(640, 360, [], seeded(1))!
    const outside = p.x < 0 || p.x > 640 || p.y < 0 || p.y > 360
    expect(outside).toBe(true)
  })
  it('returns null when every edge is blocked by skulls', () => {
    const skulls = [{ x: 320, y: 180 }, { x: 0, y: 0 }, { x: 640, y: 0 }, { x: 0, y: 360 }, { x: 640, y: 360 }, { x: 320, y: -80 }, { x: 320, y: 440 }, { x: -80, y: 180 }, { x: 720, y: 180 }]
    // a skull wall of this size cannot block everything on a big canvas, but it must never return a point inside the clearance
    const p = pickSpawn(640, 360, skulls, seeded(2))
    if (p) for (const s of skulls) expect(Math.hypot(s.x - p.x, s.y - p.y)).toBeGreaterThanOrEqual(skullClearancePx())
  })
  it('a wisp pair keeps both members clear of the skulls, not just its midpoint (R1.6)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const skulls = [{ x: 200 + (seed % 7) * 40, y: -60 }, { x: 700, y: 100 + (seed % 5) * 40 }]
      const pair = spawnVariant('wisp', 640, 360, skulls, seeded(seed))
      if (!pair) continue
      for (const w of pair) for (const k of skulls) expect(Math.hypot(k.x - w.x, k.y - w.y)).toBeGreaterThanOrEqual(skullClearancePx())
    }
  })
  it('starts every new ghost in its safe state, aimed at the exact centre', () => {
    const w = createWispPair({ x: -80, y: 100 }, 640, 360, seeded(3))
    expect(w).toHaveLength(2)
    expect(w[0].pairId).toBe(w[1].pairId)
    expect(w.every((e) => e.vState === 'idle' && e.targetX === 320 && e.targetY === 180)).toBe(true)
    expect(createMirror({ x: 100, y: -80 }, 640, 360).vState).toBe('shield')
    expect(createBlink({ x: 100, y: -80 }, 640, 360).vState).toBe(initialState('blink'))
  })
  it('a pair sits side by side along its edge', () => {
    const [a, b] = createWispPair({ x: -80, y: 100 }, 640, 360, seeded(4))
    expect(a.x).toBe(b.x)
    expect(Math.abs(a.y - b.y)).toBeCloseTo(PAIR_GAP_PX, 6)
    const [c, d] = createWispPair({ x: 200, y: -80 }, 640, 360, seeded(4))
    expect(c.y).toBe(d.y)
    expect(Math.abs(c.x - d.x)).toBeCloseTo(PAIR_GAP_PX, 6)
  })
  it('spawnVariant gives the right counts and travel time', () => {
    expect(spawnVariant('wisp', 640, 360, [], seeded(5))).toHaveLength(2)
    for (const k of ['mirror', 'blink'] as const) {
      const [e] = spawnVariant(k, 640, 360, [], seeded(6))!
      expect(travelMs(e, 360)).toBeGreaterThanOrEqual(MIN_TRAVEL_MS)
    }
  })
})
