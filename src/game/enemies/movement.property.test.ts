import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { moveEnemies } from './movement'
import { makeEnemy } from '../state'
import type { Enemy } from '../state'

// The boss has its own state machine (bossPhases.property.test.ts).
const STRAIGHT = ['pumpkin', 'skull'] as const
const WOBBLY = ['ghost', 'bat'] as const

const scenarioArb = fc.record({
  speed: fc.double({ min: 0.05, max: 0.5, noNaN: true }),
  W: fc.integer({ min: 640, max: 3840 }),
  H: fc.integer({ min: 360, max: 2160 }),
  sine: fc.double({ min: 0, max: 20, noNaN: true }),
  startY: fc.double({ min: 0.1, max: 0.9, noNaN: true }),
  tx: fc.double({ min: -0.05, max: 0.05, noNaN: true }),
  ty: fc.double({ min: -0.05, max: 0.05, noNaN: true }),
  ms: fc.integer({ min: 1, max: 20 }).map((n) => n * 50), // 50–1000 ms
})
/** Enemy is still well short of its target at the end (arrival snaps/stops it, which is step-quantised). */
const stillTravelling = (c: Scenario): boolean => {
  const d = Math.hypot(c.W / 2 + c.tx * c.W + 40, (c.ty + 0.5 - c.startY) * c.H)
  return c.speed * c.H * (c.ms / 1000) < 0.5 * d
}
type Scenario = typeof scenarioArb extends fc.Arbitrary<infer T> ? T : never

function make(type: Enemy['type'], c: Scenario): Enemy {
  return makeEnemy({
    id: 'p', type,
    x: -40, y: c.startY * c.H,
    targetX: c.W / 2 + c.tx * c.W, targetY: c.H / 2 + c.ty * c.H,
    speed: c.speed, sineOffset: c.sine,
    hitbox: { x: 0, y: 0, w: 1, h: 1 },
  })
}

/** Simulate `totalMs` using fixed steps of 1000/hz ms. */
function simulate(e: Enemy, totalMs: number, hz: number, W: number, H: number): Enemy {
  const frames = Math.round((totalMs / 1000) * hz)
  const dt = totalMs / frames
  let cur = [e]
  for (let i = 0; i < frames; i++) cur = moveEnemies(cur, dt, W, H)
  return cur[0]
}

const dist = (a: Enemy, b: Enemy) => Math.hypot(a.x - b.x, a.y - b.y)
const toTarget = (e: Enemy) => Math.hypot(e.targetX - e.x, e.targetY - e.y)

describe('movement frame-rate independence (properties)', () => {
  const hzArb = fc.constantFrom(30, 60, 90, 120, 144, 240)
  const wobbleHzArb = fc.constantFrom(60, 90, 120, 144, 240)

  it('straight-line enemies end at the same position at any frame rate', () => {
    fc.assert(fc.property(fc.constantFrom(...STRAIGHT), scenarioArb, hzArb, hzArb, (type, c, hzA, hzB) => {
      const e = make(type, c)
      const a = simulate(e, c.ms, hzA, c.W, c.H)
      const b = simulate(e, c.ms, hzB, c.W, c.H)
      // movement.ts stops an enemy once it is within 0.5 px of its target, so
      // paths that arrive may differ by that sub-pixel stop distance.
      const arrived = toTarget(a) < 0.5 + 1e-6 || toTarget(b) < 0.5 + 1e-6
      expect(dist(a, b)).toBeLessThan(arrived ? 0.5 + 1e-6 : 1e-6 * Math.max(c.W, c.H))
    }))
  })

  it('wobbling enemies (ghost, bat) agree within 2 px at 1080p-equivalent scale', () => {
    fc.assert(fc.property(fc.constantFrom(...WOBBLY), scenarioArb, wobbleHzArb, wobbleHzArb, (type, c, hzA, hzB) => {
      fc.pre(stillTravelling(c))
      const e = make(type, c)
      const a = simulate(e, c.ms, hzA, c.W, c.H)
      const b = simulate(e, c.ms, hzB, c.W, c.H)
      expect(dist(a, b)).toBeLessThan(2 * (c.H / 1080))
      expect(Math.abs(a.sineOffset - b.sineOffset)).toBeLessThan(1e-9)
    }))
  })

  it('one step equals two half steps for straight-line enemies', () => {
    fc.assert(fc.property(fc.constantFrom(...STRAIGHT), scenarioArb, fc.integer({ min: 1, max: 100 }), (type, c, ms) => {
      const e = make(type, c)
      const [full] = moveEnemies([e], ms, c.W, c.H)
      const [half1] = moveEnemies([e], ms / 2, c.W, c.H)
      const [half2] = moveEnemies([half1], ms / 2, c.W, c.H)
      expect(dist(full, half2)).toBeLessThan(1e-6 * Math.max(c.W, c.H))
    }))
  })

  it('straight-line enemies never overshoot or move away from the target', () => {
    fc.assert(fc.property(
      fc.constantFrom(...STRAIGHT), scenarioArb, fc.array(fc.integer({ min: 1, max: 100 }), { maxLength: 60 }),
      (type, c, steps) => {
        let e = make(type, c)
        let d = toTarget(e)
        for (const ms of steps) {
          e = moveEnemies([e], ms, c.W, c.H)[0]
          // A skull retargets off-screen after ~4 s (exiting): the target jumps.
          if (e.exiting) break
          const nd = toTarget(e)
          expect(nd).toBeLessThanOrEqual(d + 1e-9)
          d = nd
        }
      },
    ))
  })

  it('a single step never moves an enemy further than speed × canvasH × dt (+ wobble)', () => {
    fc.assert(fc.property(
      fc.constantFrom(...STRAIGHT, ...WOBBLY), scenarioArb, fc.integer({ min: 1, max: 100 }),
      (type, c, ms) => {
        const e = make(type, c)
        const [m] = moveEnemies([e], ms, c.W, c.H)
        const forward = c.speed * c.H * ms / 1000
        const wobble = 0.16 * c.H * ms / 1000 // bat zigzag amplitude is the largest
        expect(dist(e, m)).toBeLessThanOrEqual(forward + wobble + 1e-9)
      },
    ))
  })

  it('doubling canvas height doubles straight-line travel', () => {
    fc.assert(fc.property(fc.constantFrom(...STRAIGHT), scenarioArb, (type, c) => {
      // Target far away so the step is never clamped.
      const mk = (): Enemy => makeEnemy({
        id: 'p', type, x: 0, y: 0, targetX: 1e7, targetY: 0, speed: c.speed,
        hitbox: { x: 0, y: 0, w: 1, h: 1 },
      })
      const [a] = moveEnemies([mk()], 100, c.W, c.H)
      const [b] = moveEnemies([mk()], 100, c.W, 2 * c.H)
      expect(b.x).toBeCloseTo(2 * a.x, 6)
    }))
  })
})
