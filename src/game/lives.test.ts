/** One heart per event, grace, visible loss, death transition (playtest1-fixes R1). */
import { describe, it, expect } from 'vitest'
import {
  createInitialState, makeEnemy, decrementLife, tickTimer, tickLifeTimers, tickDeath,
  LIFE_GRACE_MS, LIFE_FX_MS, DEATH_MS,
} from './state'
import type { GameState, Enemy } from './state'
import { stepSimulation, tickEffects } from './step'
import { resolveHits } from './collision'
import { lifeFx } from '../ui/hud'

const W = 1280, H = 720

function playing(over: Partial<GameState> = {}): GameState {
  return { ...createInitialState(3), phase: 'playing', roundTimeMs: 40_000, ...over }
}
/** A ghost standing on its target: it reaches in the next step. */
function arrived(id: string): Enemy {
  return makeEnemy({
    id, type: 'ghost', x: W / 2, y: H / 2, targetX: W / 2, targetY: H / 2, speed: 0,
    hitbox: { x: W / 2 - 30, y: H / 2 - 30, w: 60, h: 60 }, spawnedAt: 0,
  })
}

describe('one heart per event (R1.1)', () => {
  it('three enemies reaching the target in one tick cost one heart, not three', () => {
    const s = stepSimulation(playing({ enemies: [arrived('a'), arrived('b'), arrived('c')] }), 16, W, H)
    expect(s.lives).toBe(2)
    expect(s.phase).toBe('playing')
    expect(s.stageMissed).toBe(3) // all three still count as missed
    expect(s.enemies.filter((e) => e.type === 'ghost' && e.x === W / 2)).toHaveLength(0)
  })

  it('with 1 heart left, the same tick is a game over', () => {
    const s = stepSimulation(playing({ lives: 1, enemies: [arrived('a'), arrived('b')] }), 16, W, H)
    expect(s.lives).toBe(0)
    expect(s.phase).toBe('gameover')
  })
})

describe('grace window (R1.2)', () => {
  it('a second life loss inside LIFE_GRACE_MS is ignored, one after it counts', () => {
    let s = decrementLife(playing())
    expect(s.lives).toBe(2)
    expect(s.invulnMs).toBe(LIFE_GRACE_MS)
    s = decrementLife(s)
    expect(s.lives).toBe(2)
    s = tickLifeTimers(s, LIFE_GRACE_MS - 1)
    expect(decrementLife(s).lives).toBe(2)
    s = tickLifeTimers(s, 1)
    expect(s.invulnMs).toBe(0)
    expect(decrementLife(s).lives).toBe(1)
  })

  it('an arrival in the tick after a skull hit costs nothing', () => {
    const afterHit = decrementLife(playing())
    const s = stepSimulation({ ...afterHit, enemies: [arrived('a')] }, 16, W, H)
    expect(s.lives).toBe(2)
  })

  it('a skull hit inside the grace sweeps the skull away without a flash or a heart', () => {
    const skull = makeEnemy({ id: 's', type: 'skull', x: 100, y: 100, targetX: 600, targetY: 300, speed: 0, hitbox: { x: 70, y: 70, w: 60, h: 60 }, spawnedAt: -10_000 })
    const s0 = decrementLife(playing({ enemies: [skull] }))
    // every sampled pixel changes between the two frames: full motion everywhere
    const w = 320, h = 180
    const cur = { data: new Uint8ClampedArray(w * h * 4).fill(255), width: w, height: h } as unknown as ImageData
    const prev = { data: new Uint8ClampedArray(w * h * 4).fill(0), width: w, height: h } as unknown as ImageData
    let s = s0
    for (let i = 0; i < 3; i++) s = resolveHits(s, cur, prev, W, H, 5000 + i * 16, true, 16)
    expect(s.enemies.find((e) => e.id === 's')).toBeUndefined()
    expect(s.lives).toBe(2)
    expect(s.flashEndTime).toBe(0)
  })

  it('the grace counts down in game time (deltaMs), not in ticks', () => {
    let a = decrementLife(playing()), b = a
    for (let i = 0; i < 10; i++) a = tickLifeTimers(a, 100)
    for (let i = 0; i < 100; i++) b = tickLifeTimers(b, 10)
    expect(a.invulnMs).toBe(0)
    expect(b.invulnMs).toBe(0)
  })
})

describe('visible loss (R1.3)', () => {
  it('the HUD effect lasts LIFE_FX_MS', () => {
    const s = decrementLife(playing())
    expect(s.lifeFxMs).toBe(LIFE_FX_MS)
    expect(tickLifeTimers(s, LIFE_FX_MS).lifeFxMs).toBe(0)
  })
  it('shakes and blinks normally; reduced flashing: smaller shake, never a blink', () => {
    const normal = Array.from({ length: 30 }, (_, i) => lifeFx(LIFE_FX_MS - i * 20, false))
    const reduced = Array.from({ length: 30 }, (_, i) => lifeFx(LIFE_FX_MS - i * 20, true))
    expect(Math.max(...normal.map((f) => Math.abs(f.dx)))).toBeGreaterThan(2)
    expect(normal.some((f) => f.blink)).toBe(true)
    expect(reduced.some((f) => f.blink)).toBe(false)
    expect(Math.max(...reduced.map((f) => Math.abs(f.dx)))).toBeLessThan(Math.max(...normal.map((f) => Math.abs(f.dx))))
    expect(lifeFx(0, false)).toEqual({ dx: 0, glow: 12, blink: false })
  })
})

describe('death transition (R1.4, R1.5)', () => {
  it('the last heart makes gameover with deathMs, which counts down on deltaMs', () => {
    let s = playing({ lives: 1 })
    s = decrementLife(s)
    expect(s.phase).toBe('gameover')
    expect(s.deathMs).toBe(DEATH_MS)
    s = tickEffects(s, 400)
    expect(s.deathMs).toBe(DEATH_MS - 400)
    expect(tickDeath(s, 10_000).deathMs).toBe(0)
  })
  it('the boss timeout is a game over with the same transition', () => {
    const boss = makeEnemy({ id: 'b', type: 'boss', x: 1, y: 1, targetX: 1, targetY: 1, speed: 0, hitbox: { x: 0, y: 0, w: 1, h: 1 } })
    const s = tickTimer(playing({ roundTimeMs: 10, enemies: [boss] }), 50)
    expect(s.phase).toBe('gameover')
    expect(s.deathMs).toBe(DEATH_MS)
  })
  it('no heart can be lost after the game is over', () => {
    const dead = decrementLife(playing({ lives: 1 }))
    expect(decrementLife({ ...dead, invulnMs: 0 })).toEqual({ ...dead, invulnMs: 0 })
  })
})
