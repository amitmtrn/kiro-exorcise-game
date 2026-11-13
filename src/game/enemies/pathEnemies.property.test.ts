import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { mulberry32 } from '../../test/prng'
import { moveEnemies, cullExitedEnemies } from './movement'
import { spawnWave } from './waveSpawn'
import { pathDurationMs } from '../paths'
import type { WavePath } from '../paths'
import type { WaveKind } from '../waves'

const pathArb = fc.constantFrom<WavePath>('line', 'arc', 'flyby', 'drop', 'swarm')
const kindArb = fc.constantFrom<WaveKind>('ghost', 'bat', 'pumpkin', 'candy')
const sizeArb = fc.record({ W: fc.integer({ min: 640, max: 2000 }), H: fc.integer({ min: 360, max: 1100 }) })
const seedArb = fc.integer({ min: 1, max: 1e6 })

/** Splits `total` ms into the given fractions (normalised) — any slicing of the same total. */
function slices(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  return weights.map((w) => (total * w) / sum)
}

describe('path enemies — properties', () => {
  it('position depends only on total elapsed time, not on how it is sliced (R6.1)', () => {
    fc.assert(fc.property(
      pathArb, kindArb, sizeArb, seedArb,
      fc.integer({ min: 100, max: 12_000 }),
      fc.array(fc.double({ min: 0.05, max: 1, noNaN: true }), { minLength: 1, maxLength: 60 }),
      (path, kind, { W, H }, seed, total, weights) => {
        const start = spawnWave(kind, path, 3, { W, H, speedMult: 1, rand: mulberry32(seed) })
        const once = moveEnemies(start, total, W, H)
        let stepped = start
        for (const ms of slices(total, weights)) stepped = moveEnemies(stepped, ms, W, H)
        stepped.forEach((e, i) => {
          expect(Math.abs(e.x - once[i].x)).toBeLessThan(1e-6 * W)
          expect(Math.abs(e.y - once[i].y)).toBeLessThan(1e-6 * H)
          expect(e.pathMs).toBeCloseTo(once[i].pathMs, 6)
        })
      },
    ))
  })

  it('flyby enemies exit and are culled, and are never culled while still visible', () => {
    fc.assert(fc.property(
      fc.constantFrom<WavePath>('flyby', 'swarm'), kindArb, sizeArb, seedArb,
      fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 4000 }),
      (path, kind, { W, H }, seed, deltas) => {
        let es = spawnWave(kind, path, 4, { W, H, speedMult: 1, rand: mulberry32(seed), edges: 'all' })
        const durations = es.map((e) => pathDurationMs(e.path!, W, H))
        const ids = es.map((e) => e.id)
        let elapsed = 0
        const culledAt = new Map<string, number>()
        for (const d of deltas) {
          es = cullExitedEnemies(moveEnemies(es, d, W, H), W, H)
          elapsed += d
          for (const id of ids) if (!culledAt.has(id) && !es.some((e) => e.id === id)) culledAt.set(id, elapsed)
          // Whatever is still alive overlaps the canvas or has not yet reached half its path.
          for (const e of es) {
            const { x, y, w, h } = e.hitbox
            const visible = x + w >= 0 && x <= W && y + h >= 0 && y <= H
            if (!visible) expect(e.pathMs).toBeLessThan(durations[ids.indexOf(e.id)])
          }
        }
        ids.forEach((id, i) => {
          // Removed no later than its path duration (one tick of slack), never earlier than it left the screen.
          const t = culledAt.get(id)
          if (elapsed >= durations[i] + 100) expect(t).toBeDefined()
          if (t !== undefined) expect(t).toBeLessThanOrEqual(durations[i] + 100)
        })
      },
    ), { numRuns: 40 })
  })

  it('a culled flyby is gone for good: after its duration nothing path-exiting remains', () => {
    fc.assert(fc.property(
      kindArb, sizeArb, seedArb, fc.integer({ min: 1, max: 100 }),
      (kind, { W, H }, seed, step) => {
        let es = spawnWave(kind, 'flyby', 3, { W, H, speedMult: 1.2, rand: mulberry32(seed) })
        const longest = Math.max(...es.map((e) => pathDurationMs(e.path!, W, H)))
        for (let t = 0; t < longest + step; t += step) {
          es = cullExitedEnemies(moveEnemies(es, step, W, H), W, H)
        }
        expect(es).toHaveLength(0)
      },
    ), { numRuns: 30 })
  })
})
