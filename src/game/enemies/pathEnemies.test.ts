import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../test/prng'
import { makeEnemy } from '../state'
import type { Enemy } from '../state'
import { moveEnemies, cullExitedEnemies, hitboxFor } from './movement'
import { isThreat, splitReached, CENTER_THRESHOLD } from './reach'
import { spawnWave, rowHeights } from './waveSpawn'
import { makePath, pathDurationMs, pathExits, pathPosition, MIN_DROP_S } from '../paths'

const W = 960, H = 540
const opts = (extra = {}) => ({ W, H, speedMult: 1, rand: mulberry32(7), ...extra })

function flybyGhost(seed = 1): Enemy {
  return spawnWave('ghost', 'flyby', 1, opts({ rand: mulberry32(seed), height: 0.4 }))[0]
}

describe('spawnWave', () => {
  it('builds one enemy per count on independent paths', () => {
    const es = spawnWave('ghost', 'line', 3, opts())
    expect(es).toHaveLength(3)
    expect(es.every((e) => e.type === 'ghost' && e.path?.kind === 'line')).toBe(true)
    expect(new Set(es.map((e) => e.id)).size).toBe(3)
  })

  it('swarm is one cluster of flyby bats', () => {
    const es = spawnWave('bat', 'swarm', 4, opts())
    expect(es).toHaveLength(4)
    expect(es.every((e) => e.type === 'bat' && e.path?.kind === 'flyby' && e.harmless)).toBe(true)
  })

  it('a flyby row uses several heights and both directions', () => {
    const es = spawnWave('ghost', 'flyby', 3, opts())
    const ys = es.map((e) => e.path!.y0)
    expect(new Set(ys.map((y) => Math.round(y * 10))).size).toBe(3)
    expect(new Set(es.map((e) => Math.sign(e.path!.x1 - e.path!.x0))).size).toBe(2)
    expect(rowHeights(3)).toEqual([0.18, 0.48, 0.78])
  })

  it('starts the enemy at the path start (off screen) with a matching hitbox and target', () => {
    const [e] = spawnWave('ghost', 'arc', 1, opts())
    expect(e.x < 0 || e.x > W || e.y < 0 || e.y > H).toBe(true)
    expect(e.hitbox).toEqual(hitboxFor('ghost', e.x, e.y))
    expect(e.targetX).toBeCloseTo(e.path!.x1 * W, 9)
  })

  it('pumpkins need 2 hits normally and 1 hit, harmless, in the bonus round', () => {
    expect(spawnWave('pumpkin', 'drop', 1, opts())[0].hitsNeeded).toBe(2)
    const b = spawnWave('pumpkin', 'drop', 1, opts({ bonus: true }))[0]
    expect(b.hitsNeeded).toBe(1)
    expect(b.harmless).toBe(true)
    expect(pathExits(b.path!)).toBe(true) // falls through the bottom
  })

  it('candy is always harmless', () => {
    expect(spawnWave('candy', 'drop', 2, opts({ bonus: true })).every((e) => e.harmless && e.type === 'candy')).toBe(true)
  })

  it('speed scales with the multiplier', () => {
    const slow = spawnWave('ghost', 'line', 1, opts({ speedMult: 0.5 }))[0]
    const fast = spawnWave('ghost', 'line', 1, opts({ speedMult: 1 }))[0]
    expect(fast.path!.speed).toBeCloseTo(slow.path!.speed * 2, 9)
  })
})

describe('moveEnemies with paths', () => {
  it('follows the path by accumulated time and keeps hitbox / target in sync', () => {
    const [e] = spawnWave('ghost', 'line', 1, opts())
    const [m] = moveEnemies([e], 1000, W, H)
    expect(m.pathMs).toBe(1000)
    expect(m.hitbox).toEqual(hitboxFor('ghost', m.x, m.y))
    expect(Math.hypot(m.x - e.x, m.y - e.y)).toBeGreaterThan(0)
  })

  it('does not mutate its input', () => {
    const e = flybyGhost()
    const before = JSON.stringify(e)
    moveEnemies([e], 500, W, H)
    expect(JSON.stringify(e)).toBe(before)
  })

  it('legacy enemies (no path) still head straight for their target', () => {
    const g = makeEnemy({
      id: 'g', type: 'ghost', x: 0, y: 270, targetX: 480, targetY: 270, speed: 0.2,
      hitbox: { x: -40, y: 230, w: 80, h: 80 },
    })
    const [m] = moveEnemies([g], 1000, W, H)
    expect(m.x).toBeGreaterThan(0)
    expect(m.pathMs).toBe(0)
  })
})

describe('cullExitedEnemies with paths', () => {
  it('culls a flyby once its path is complete, not before', () => {
    let e = flybyGhost()
    const dur = pathDurationMs(e.path!, W, H)
    e = moveEnemies([e], dur * 0.5, W, H)[0]
    expect(cullExitedEnemies([e], W, H)).toHaveLength(1)
    e = moveEnemies([e], dur * 0.5, W, H)[0]
    expect(cullExitedEnemies([e], W, H)).toHaveLength(0)
  })

  it('culls a flyby as soon as it is fully outside past half-way', () => {
    let e = flybyGhost()
    const dur = pathDurationMs(e.path!, W, H)
    e = moveEnemies([e], dur * 0.97, W, H)[0]
    const out = e.hitbox.x > W || e.hitbox.x + e.hitbox.w < 0
    expect(cullExitedEnemies([e], W, H).length).toBe(out ? 0 : 1)
  })

  it('does not cull an entering flyby that starts off screen', () => {
    expect(cullExitedEnemies([flybyGhost()], W, H)).toHaveLength(1)
  })

  it('does not cull converging path enemies (they end at their target)', () => {
    let [e] = spawnWave('ghost', 'line', 1, opts())
    e = moveEnemies([e], pathDurationMs(e.path!, W, H) + 1000, W, H)[0]
    expect(cullExitedEnemies([e], W, H)).toHaveLength(1)
  })

  it('still culls exiting skulls and keeps legacy enemies', () => {
    const skull = makeEnemy({
      id: 's', type: 'skull', x: -500, y: 100, targetX: -900, targetY: 100, speed: 0.1,
      hitbox: { x: -530, y: 70, w: 60, h: 60 }, exiting: true,
    })
    const ghost = makeEnemy({
      id: 'g', type: 'ghost', x: -500, y: 100, targetX: 400, targetY: 100, speed: 0.1,
      hitbox: { x: -540, y: 60, w: 80, h: 80 },
    })
    expect(cullExitedEnemies([skull, ghost], W, H).map((e) => e.id)).toEqual(['g'])
  })
})

describe('landing drops (fair reaction window)', () => {
  /** Simulates a lone ghost drop in 16 ms ticks; returns ms from spawn until it costs a life. */
  function timeToMiss(seed: number, w: number, h: number, speedMult: number): number {
    let es = spawnWave('ghost', 'drop', 1, { W: w, H: h, speedMult, rand: mulberry32(seed) })
    for (let t = 16; t < 20_000; t += 16) {
      es = cullExitedEnemies(moveEnemies(es, 16, w, h), w, h)
      if (splitReached(es, false, w, h).missed > 0) return t
    }
    return Infinity
  }

  it('never costs a life sooner than MIN_DROP_S, at any canvas size or speed', () => {
    for (const [w, h] of [[640, 360], [960, 540], [1920, 1080], [1000, 1080]]) {
      for (const speedMult of [1, 1.6, 3]) {
        for (let seed = 1; seed <= 30; seed++) {
          expect(timeToMiss(seed, w, h, speedMult)).toBeGreaterThanOrEqual(MIN_DROP_S * 1000 - 16)
        }
      }
    }
  })

  it('is not a miss while the drop is still falling, and is one once its time is up', () => {
    const [g] = spawnWave('ghost', 'drop', 1, opts())
    const dur = pathDurationMs(g.path!, W, H)
    expect(splitReached([moveEnemies([g], dur - 50, W, H)[0]], false, W, H).missed).toBe(0)
    expect(splitReached([moveEnemies([g], dur, W, H)[0]], false, W, H).missed).toBe(1)
  })

  it('a falling-through (bonus) drop keeps its pace: linear, not eased', () => {
    const p = makePath('drop', { W, H, speed: 0.3, rand: mulberry32(3), through: true })
    const half = pathPosition({ ...p, wobble: 0 }, pathDurationMs(p, W, H) / 2, W, H)
    expect(half.y).toBeCloseTo((p.y0 + p.y1) / 2 * H, 3)
  })

  it('a drop on a left/right-only stage becomes a flyby (R3.3)', () => {
    const es = spawnWave('ghost', 'drop', 3, opts({ edges: 'leftRight' }))
    expect(es.every((e) => e.path?.kind === 'flyby')).toBe(true)
  })
})

describe('reach rule', () => {
  const at = (e: Enemy): Enemy => ({ ...e, x: e.targetX, y: e.targetY })

  it('a converging ghost that reaches its target is missed', () => {
    const [g] = spawnWave('ghost', 'arc', 1, opts())
    expect(isThreat(g)).toBe(true)
    const r = splitReached([at(g)], false, W, H)
    expect(r.missed).toBe(1)
    expect(r.survivors).toHaveLength(0)
  })

  it('a ghost still far from its target survives', () => {
    const [g] = spawnWave('ghost', 'line', 1, opts())
    const r = splitReached([g], false, W, H)
    expect(r.missed).toBe(0)
    expect(r.survivors).toEqual([g])
  })

  it('reaches within CENTER_THRESHOLD px', () => {
    const [g] = spawnWave('ghost', 'line', 1, opts())
    const near = { ...g, x: g.targetX + CENTER_THRESHOLD - 1, y: g.targetY }
    expect(splitReached([near], false, W, H).missed).toBe(1)
    const far = { ...g, x: g.targetX + CENTER_THRESHOLD + 1, y: g.targetY }
    expect(splitReached([far], false, W, H).missed).toBe(0)
  })

  it('a flyby at its off-screen end point is not a miss', () => {
    const g = at(flybyGhost())
    expect(isThreat(g)).toBe(false)
    expect(splitReached([g], false, W, H).missed).toBe(0)
  })

  it('bats and candy never cost a life', () => {
    const bat = at(spawnWave('bat', 'flyby', 1, opts())[0])
    const candy = at(spawnWave('candy', 'drop', 1, opts({ bonus: true }))[0])
    expect(splitReached([bat, candy], false, W, H).missed).toBe(0)
  })

  it('skulls and the boss are never "reached"', () => {
    const skull = makeEnemy({ id: 's', type: 'skull', x: 100, y: 100, targetX: 100, targetY: 100, speed: 0.1, hitbox: { x: 0, y: 0, w: 1, h: 1 } })
    const boss = { ...skull, id: 'b', type: 'boss' as const }
    expect(splitReached([skull, boss], false, W, H)).toEqual({ survivors: [skull, boss], missed: 0 })
  })

  it('legacy ghosts (no path) are still missed at their target', () => {
    const g = makeEnemy({ id: 'g', type: 'ghost', x: 480, y: 270, targetX: 480, targetY: 270, speed: 0.1, hitbox: { x: 0, y: 0, w: 1, h: 1 } })
    expect(splitReached([g], false, W, H).missed).toBe(1)
  })

  it('bonus: nothing is ever missed, even a converging ghost on its target', () => {
    const [g] = spawnWave('ghost', 'line', 1, opts())
    const r = splitReached([at(g)], true, W, H)
    expect(r.missed).toBe(0)
    expect(r.survivors).toHaveLength(1)
  })

  it('converging line paths ends inside the canvas', () => {
    expect(pathExits(makePath('line', { W, H, speed: 0.2, rand: mulberry32(1) }))).toBe(false)
  })
})
