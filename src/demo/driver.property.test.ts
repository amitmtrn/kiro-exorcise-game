import { describe, it } from 'vitest'
import fc from 'fast-check'
import { DemoDriver, handRadius, stepSafe } from './driver'
import type { DemoView } from './driver'
import { makeEnemy } from '../game/state'
import type { Enemy } from '../game/state'
import type { Pt } from './camera'

const DT = 1000 / 30

const arbEnemy = (i: number) => fc.record({
  type: fc.constantFrom('ghost', 'bat', 'skull', 'skull', 'pumpkin', 'candy'),
  x: fc.integer({ min: -100, max: 1380 }),
  y: fc.integer({ min: -100, max: 820 }),
  vx: fc.integer({ min: -4, max: 4 }),
  vy: fc.integer({ min: -4, max: 4 }),
}).map((e) => ({ ...e, id: `e${i}` }))

type Spec = { type: 'ghost' | 'bat' | 'skull' | 'pumpkin' | 'candy'; x: number; y: number; vx: number; vy: number; id: string }

function build(specs: Spec[], tick: number): Enemy[] {
  return specs.map((s) => {
    const x = s.x + s.vx * tick, y = s.y + s.vy * tick
    const size = s.type === 'skull' ? 56 : 80
    return makeEnemy({
      id: s.id, type: s.type, x, y, targetX: 640, targetY: 360,
      speed: s.type === 'skull' ? 0.148 : 0.1, hitbox: { x: x - size / 2, y: y - size / 2, w: size, h: size },
      spawnedAt: 0,
    })
  })
}

function simulate(seed: number, w: number, h: number, specs: Spec[], ticks: number): { path: Pt[]; skullsAt: Enemy[][] } {
  const d = new DemoDriver(seed, w, h)
  const path: Pt[] = [{ ...d.hand }]
  const skullsAt: Enemy[][] = []
  for (let i = 0; i < ticks; i++) {
    const enemies = build(specs, i)
    const v: DemoView = { phase: 'playing', stage: 3, bonus: false, enemies, w, h, now: 50000 + i * DT, cardOpen: false, hasPhoto: true, noPhoto: false }
    const p = d.update(DT, v)
    path.push({ x: p.x, y: p.y })
    skullsAt.push(enemies.filter((e) => e.type === 'skull'))
  }
  return { path, skullsAt }
}

describe('driver properties (demo-mode R4.1, R4.5)', () => {
  it('every step of the hand keeps both discs clear of every skull (the skull rule)', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 1000 }),
      fc.constantFrom([1280, 720], [960, 540], [1920, 1080], [640, 480]),
      fc.array(fc.nat({ max: 5 }), { minLength: 1, maxLength: 6 }).chain((xs) => fc.tuple(...xs.map((_, i) => arbEnemy(i)))),
      (seed, [w, h], specs) => {
        const { path, skullsAt } = simulate(seed, w, h, specs as Spec[], 150)
        const R = handRadius(h)
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1], b = path[i]
          if (a.x === b.x && a.y === b.y) continue // a still hand cannot hit
          if (!stepSafe(a, b, R, skullsAt[i - 1], w, h, DT)) return false
        }
        return true
      },
    ), { numRuns: 120 })
  })

  it('the hand stays on screen', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 1000 }),
      fc.array(fc.nat({ max: 5 }), { minLength: 1, maxLength: 5 }).chain((xs) => fc.tuple(...xs.map((_, i) => arbEnemy(i)))),
      (seed, specs) => {
        const { path } = simulate(seed, 1280, 720, specs as Spec[], 120)
        return path.every((p) => p.x >= 0 && p.x <= 1280 && p.y >= 0 && p.y <= 720)
      },
    ), { numRuns: 80 })
  })

  it('same seed and inputs give the same path', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 1000 }),
      fc.array(fc.nat({ max: 5 }), { minLength: 1, maxLength: 5 }).chain((xs) => fc.tuple(...xs.map((_, i) => arbEnemy(i)))),
      (seed, specs) => {
        const a = simulate(seed, 1280, 720, specs as Spec[], 80).path
        const b = simulate(seed, 1280, 720, specs as Spec[], 80).path
        return JSON.stringify(a) === JSON.stringify(b)
      },
    ), { numRuns: 40 })
  })

  it('per-step movement is bounded (no teleporting) at the demo frame rate', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 1000 }),
      fc.array(fc.nat({ max: 5 }), { minLength: 1, maxLength: 5 }).chain((xs) => fc.tuple(...xs.map((_, i) => arbEnemy(i)))),
      (seed, specs) => {
        const { path } = simulate(seed, 1280, 720, specs as Spec[], 120)
        for (let i = 1; i < path.length; i++) if (Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y) > 150) return false
        return true
      },
    ), { numRuns: 60 })
  })
})
