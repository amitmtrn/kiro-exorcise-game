import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../test/prng'
import { makeEnemy } from '../state'
import type { Enemy } from '../state'
import { moveEnemies, cullExitedEnemies, hitboxFor } from './movement'
import { isThreat, splitReached, CENTER_THRESHOLD } from './reach'
import { spawnWave, rowHeights } from './waveSpawn'
import { makePath, pathDurationMs, pathExits } from '../paths'

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

describe('reach rule', () => {
  const at = (e: Enemy): Enemy => ({ ...e, x: e.targetX, y: e.targetY })

  it('a converging ghost that reaches its target is missed', () => {
    const [g] = spawnWave('ghost', 'arc', 1, opts())
    expect(isThreat(g)).toBe(true)
    const r = splitReached([at(g)], false)
    expect(r.missed).toBe(1)
    expect(r.survivors).toHaveLength(0)
  })

  it('a ghost still far from its target survives', () => {
    const [g] = spawnWave('ghost', 'line', 1, opts())
    const r = splitReached([g], false)
    expect(r.missed).toBe(0)
    expect(r.survivors).toEqual([g])
  })

  it('reaches within CENTER_THRESHOLD px', () => {
    const [g] = spawnWave('ghost', 'line', 1, opts())
    const near = { ...g, x: g.targetX + CENTER_THRESHOLD - 1, y: g.targetY }
    expect(splitReached([near], false).missed).toBe(1)
    const far = { ...g, x: g.targetX + CENTER_THRESHOLD + 1, y: g.targetY }
    expect(splitReached([far], false).missed).toBe(0)
  })

  it('a flyby at its off-screen end point is not a miss', () => {
    const g = at(flybyGhost())
    expect(isThreat(g)).toBe(false)
    expect(splitReached([g], false).missed).toBe(0)
  })

  it('bats and candy never cost a life', () => {
    const bat = at(spawnWave('bat', 'flyby', 1, opts())[0])
    const candy = at(spawnWave('candy', 'drop', 1, opts({ bonus: true }))[0])
    expect(splitReached([bat, candy], false).missed).toBe(0)
  })

  it('skulls and the boss are never "reached"', () => {
    const skull = makeEnemy({ id: 's', type: 'skull', x: 100, y: 100, targetX: 100, targetY: 100, speed: 0.1, hitbox: { x: 0, y: 0, w: 1, h: 1 } })
    const boss = { ...skull, id: 'b', type: 'boss' as const }
    expect(splitReached([skull, boss], false)).toEqual({ survivors: [skull, boss], missed: 0 })
  })

  it('legacy ghosts (no path) are still missed at their target', () => {
    const g = makeEnemy({ id: 'g', type: 'ghost', x: 480, y: 270, targetX: 480, targetY: 270, speed: 0.1, hitbox: { x: 0, y: 0, w: 1, h: 1 } })
    expect(splitReached([g], false).missed).toBe(1)
  })

  it('bonus: nothing is ever missed, even a converging ghost on its target', () => {
    const [g] = spawnWave('ghost', 'line', 1, opts())
    const r = splitReached([at(g)], true)
    expect(r.missed).toBe(0)
    expect(r.survivors).toHaveLength(1)
  })

  it('converging line paths ends inside the canvas', () => {
    expect(pathExits(makePath('line', { W, H, speed: 0.2, rand: mulberry32(1) }))).toBe(false)
  })
})
