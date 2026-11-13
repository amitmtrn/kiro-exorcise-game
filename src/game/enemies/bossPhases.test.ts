import { describe, it, expect } from 'vitest'
import {
  bossPhaseFor, isBossVulnerable, onBossHit, moveBoss, tickBoss, createMinion,
  PHASE_PARAMS, HIT_COOLDOWN_MS, hoverY,
} from './bossPhases'
import { createBoss, BOSS_HITS_NEEDED } from './boss'
import { createInitialState } from '../state'
import type { Enemy, GameState } from '../state'

const W = 1920
const H = 1080

/** Boss parked at its hover line, as if it had finished descending. */
function hovering(overrides: Partial<Enemy> = {}): Enemy {
  return { ...createBoss(W, H), x: W / 2, y: hoverY(H), ...overrides }
}

/** Hit the boss `n` times, ignoring i-frames. */
function hitTimes(boss: Enemy, n: number): Enemy {
  let b = boss
  for (let i = 0; i < n; i++) b = { ...onBossHit(b).boss, bossInvulnMs: 0 }
  return b
}

/** Run moveBoss for `ms` in 16 ms steps. */
function run(boss: Enemy, ms: number, step = 16): Enemy {
  let b = boss
  for (let t = 0; t < ms; t += step) b = moveBoss(b, Math.min(step, ms - t), W, H)
  return b
}

const play = (enemies: Enemy[], o: Partial<GameState> = {}): GameState =>
  ({ ...createInitialState(5), phase: 'playing', enemies, ...o }) as GameState

describe('bossPhaseFor', () => {
  it('thresholds at 66 % and 33 % (10 hits: phase 2 after 4, phase 3 after 7)', () => {
    const phases = Array.from({ length: 11 }, (_, h) => bossPhaseFor(h, 10))
    expect(phases).toEqual([1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3])
  })
})

describe('phase transitions', () => {
  it('starts in phase 1, idle', () => {
    const b = createBoss(W, H)
    expect(b.bossPhase).toBe(1)
    expect(b.bossAttack).toBe('idle')
    expect(b.hitsNeeded).toBe(BOSS_HITS_NEEDED)
  })

  it('1 → 2 on the 4th hit, not before', () => {
    const b3 = hitTimes(hovering(), 3)
    expect(b3.bossPhase).toBe(1)
    const r = onBossHit({ ...b3, bossInvulnMs: 0 })
    expect(r.boss.bossPhase).toBe(2)
    expect(r.phaseChanged).toBe(true)
    expect(r.defeated).toBe(false)
  })

  it('2 → 3 on the 7th hit, not before', () => {
    const b6 = hitTimes(hovering(), 6)
    expect(b6.bossPhase).toBe(2)
    const r = onBossHit(b6)
    expect(r.boss.bossPhase).toBe(3)
    expect(r.phaseChanged).toBe(true)
  })

  it('non-threshold hits do not change phase', () => {
    expect(onBossHit(hovering()).phaseChanged).toBe(false)
    expect(onBossHit(hitTimes(hovering(), 4)).phaseChanged).toBe(false)
  })

  it('10th hit defeats the boss', () => {
    expect(onBossHit(hitTimes(hovering(), 9)).defeated).toBe(true)
    expect(onBossHit(hitTimes(hovering(), 8)).defeated).toBe(false)
  })

  it('a phase change interrupts the attack, queues a summon and restarts the idle timer', () => {
    const winding = hitTimes(hovering(), 3)
    const r = onBossHit({ ...winding, bossAttack: 'windup', bossTimerMs: 100, bossInvulnMs: 0 })
    expect(r.boss.bossAttack).toBe('idle')
    expect(r.boss.bossTimerMs).toBe(PHASE_PARAMS[2].idleMs)
    expect(r.boss.summonTimerMs).toBe(0)
  })

  it('every hit flashes the boss and starts the hit cooldown', () => {
    const r = onBossHit(hovering())
    expect(r.boss.hitFlashFrames).toBe(1)
    expect(r.boss.bossInvulnMs).toBe(HIT_COOLDOWN_MS)
    expect(isBossVulnerable(r.boss)).toBe(false)
    expect(isBossVulnerable(run(r.boss, HIT_COOLDOWN_MS + 16))).toBe(true)
  })
})

describe('phase 1 — summoner', () => {
  it('descends from above to the hover line and sways along the top', () => {
    let b = createBoss(W, H)
    expect(b.y).toBeLessThan(0)
    b = run(b, 3000)
    expect(b.y).toBeCloseTo(hoverY(H), 0)
    const xs = new Set<number>()
    for (let i = 0; i < 40; i++) { b = run(b, 250); xs.add(Math.round(b.x / 50)) }
    expect(xs.size).toBeGreaterThan(2)
    expect(b.y).toBeCloseTo(hoverY(H), 0)
  })

  it('never attacks and is always vulnerable', () => {
    let b = hovering()
    for (let i = 0; i < 20; i++) {
      b = run(b, 1000)
      expect(b.bossAttack).toBe('idle')
      expect(isBossVulnerable(b)).toBe(true)
    }
  })

  it('summons one ghost on the first tick it is due, then every 5 s', () => {
    let s = play([hovering({ summonTimerMs: 0 })])
    s = tickBoss(s, W, H)
    expect(s.enemies.filter((e) => e.type === 'ghost')).toHaveLength(1)
    expect(s.enemies.find((e) => e.type === 'boss')!.summonTimerMs).toBe(PHASE_PARAMS[1].summonEveryMs)
    // not due again immediately
    expect(tickBoss(s, W, H).enemies).toHaveLength(2)
  })

  it('caps minions at 3', () => {
    let s = play([hovering({ summonTimerMs: 0 })])
    for (let i = 0; i < 6; i++) {
      s = tickBoss(s, W, H)
      s = { ...s, enemies: s.enemies.map((e) => (e.type === 'boss' ? { ...e, summonTimerMs: 0 } : e)) }
    }
    expect(s.enemies.filter((e) => e.type === 'ghost')).toHaveLength(3)
  })

  it('minions are ghosts spawned at the boss and aimed at the centre', () => {
    const m = createMinion(hovering(), W, H)
    expect(m.type).toBe('ghost')
    expect(Math.abs(m.y - hoverY(H))).toBeLessThan(1)
    expect(Math.abs(m.targetX - W / 2)).toBeLessThanOrEqual(120)
  })

  it('does not summon outside the playing phase', () => {
    const s = play([hovering({ summonTimerMs: 0 })], { phase: 'summary' })
    expect(tickBoss(s, W, H).enemies).toHaveLength(1)
  })
})

describe('phase 2 — telegraphed lunge', () => {
  const p2 = (o: Partial<Enemy> = {}): Enemy =>
    ({ ...hitTimes(hovering(), 4), bossTimerMs: PHASE_PARAMS[2].idleMs, ...o })

  it('is shielded while idle', () => {
    const b = p2()
    expect(b.bossAttack).toBe('idle')
    expect(isBossVulnerable(b)).toBe(false)
  })

  it('idles 3 s, then winds up for 600 ms and is vulnerable', () => {
    let b = p2()
    b = run(b, 2900)
    expect(b.bossAttack).toBe('idle')
    b = run(b, 200)
    expect(b.bossAttack).toBe('windup')
    expect(isBossVulnerable(b)).toBe(true)
    const y = b.y
    b = run(b, 500)
    expect(b.bossAttack).toBe('windup')
    expect(b.y).toBe(y) // stationary telegraph
    b = run(b, 160)
    expect(b.bossAttack).toBe('lunge')
  })

  it('lunges to the centre, strikes once, recovers 1.2 s, then is shielded again', () => {
    let b = p2({ bossAttack: 'lunge' })
    let ms = 0
    while (!b.bossStrike && ms < 3000) { b = moveBoss(b, 16, W, H); ms += 16 }
    expect(ms).toBeLessThan(2000) // ~1 s of travel at 1.0 H/s
    expect(b.bossAttack).toBe('recover')
    expect(b.bossStrike).toBe(true)
    expect(Math.hypot(b.x - b.targetX, b.y - b.targetY)).toBeLessThanOrEqual(40)
    expect(isBossVulnerable(b)).toBe(true)
    b = { ...b, bossStrike: false }
    b = run(b, 1100)
    expect(b.bossAttack).toBe('recover')
    b = run(b, 200)
    expect(b.bossAttack).toBe('idle')
    expect(b.bossStrike).toBe(false)
    expect(isBossVulnerable(b)).toBe(false)
  })

  it('returns to the top after the strike', () => {
    let b = p2({ bossAttack: 'recover', bossTimerMs: 10, x: W / 2, y: H / 2 })
    b = run(b, 3000)
    expect(b.y).toBeCloseTo(hoverY(H), 0)
  })

  it('a strike costs exactly one life, resets the combo and shakes', () => {
    const struck = { ...p2({ bossAttack: 'recover' }), bossStrike: true }
    let s = play([struck], { combo: 3, streak: 7 })
    s = tickBoss(s, W, H)
    expect(s.lives).toBe(2)
    expect(s.combo).toBe(1)
    expect(s.shakeFrames).toBeGreaterThan(0)
    expect(s.enemies[0].bossStrike).toBe(false)
    expect(tickBoss(s, W, H).lives).toBe(2)
  })

  it('a strike on the last life ends the game', () => {
    const struck = { ...p2({ bossAttack: 'recover' }), bossStrike: true }
    const s = tickBoss(play([struck], { lives: 1 }), W, H)
    expect(s.phase).toBe('gameover')
  })

  it('a hit during wind-up staggers: attack cancelled, no strike', () => {
    const r = onBossHit({ ...p2({ bossAttack: 'windup', bossTimerMs: 300 }), bossHitsReceived: 4 })
    expect(r.phaseChanged).toBe(false)
    expect(r.boss.bossAttack).toBe('recover')
    expect(r.boss.bossTimerMs).toBe(PHASE_PARAMS[2].recoverMs)
  })

  it('a hit during the lunge staggers too', () => {
    const r = onBossHit({ ...p2({ bossAttack: 'lunge' }), bossHitsReceived: 4 })
    expect(r.boss.bossAttack).toBe('recover')
    expect(r.boss.bossStrike).toBe(false)
  })

  it('summons only while idle, every 6 s', () => {
    const b = p2({ summonTimerMs: 0, bossAttack: 'windup' })
    expect(tickBoss(play([b]), W, H).enemies).toHaveLength(1)
    const idle = p2({ summonTimerMs: 0 })
    const s = tickBoss(play([idle]), W, H)
    expect(s.enemies.filter((e) => e.type === 'ghost')).toHaveLength(1)
    expect(s.enemies.find((e) => e.type === 'boss')!.summonTimerMs).toBe(6000)
  })
})

describe('phase 3 — enrage', () => {
  const p3 = (o: Partial<Enemy> = {}) => ({
    ...hitTimes(hovering(), 7), bossTimerMs: PHASE_PARAMS[3].idleMs, ...o,
  })

  it('is shielded while idle and idles only 1.5 s', () => {
    let b = p3()
    expect(b.bossPhase).toBe(3)
    expect(isBossVulnerable(b)).toBe(false)
    b = run(b, 1400)
    expect(b.bossAttack).toBe('idle')
    b = run(b, 200)
    expect(b.bossAttack).toBe('windup')
  })

  it('winds up for a shorter 350 ms (but still telegraphed)', () => {
    let b = p3({ bossAttack: 'windup', bossTimerMs: PHASE_PARAMS[3].windupMs })
    b = run(b, 300)
    expect(b.bossAttack).toBe('windup')
    b = run(b, 100)
    expect(b.bossAttack).toBe('lunge')
    expect(PHASE_PARAMS[3].windupMs).toBeLessThan(PHASE_PARAMS[2].windupMs)
    expect(PHASE_PARAMS[3].windupMs).toBeGreaterThanOrEqual(300)
  })

  it('lunges faster and recovers faster than phase 2', () => {
    expect(PHASE_PARAMS[3].lungeSpeed).toBeGreaterThan(PHASE_PARAMS[2].lungeSpeed)
    expect(PHASE_PARAMS[3].recoverMs).toBeLessThan(PHASE_PARAMS[2].recoverMs)
    let b = p3({ bossAttack: 'recover', bossTimerMs: PHASE_PARAMS[3].recoverMs })
    b = run(b, 800)
    expect(b.bossAttack).toBe('idle')
  })

  it('summons 2 minions every 3.5 s, capped at 5', () => {
    let s = play([p3({ summonTimerMs: 0 })])
    s = tickBoss(s, W, H)
    expect(s.enemies.filter((e) => e.type === 'ghost')).toHaveLength(2)
    expect(s.enemies.find((e) => e.type === 'boss')!.summonTimerMs).toBe(3500)
    for (let i = 0; i < 4; i++) {
      s = { ...s, enemies: s.enemies.map((e) => (e.type === 'boss' ? { ...e, summonTimerMs: 0 } : e)) }
      s = tickBoss(s, W, H)
    }
    expect(s.enemies.filter((e) => e.type === 'ghost')).toHaveLength(5)
  })
})
