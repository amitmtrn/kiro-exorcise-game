import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'

vi.mock('../audio/index', () => ({ sfxLifeLost: vi.fn() }))

import { STAGES } from './stages'
import { createInitialState, makeEnemy } from './state'
import type { GameState, Enemy } from './state'
import { tickSpawners } from './enemies/spawn'
import { bossDue, withTip, withKingWarning, stageElapsedMs, TIPS, KING_BANNER, VARIANT_DEFER_MAX_MS } from './finale'
import { stepSimulation } from './step'
import { advanceToNextStage, spawnBoss } from './round'
import {
  FINALE_PARAMS, PHASE_PARAMS, paramsFor, finaleMinionKinds, tickBoss, hoverY, atHover, moveBoss, onBossHit,
} from './enemies/bossPhases'
import { createBoss } from './enemies/boss'
import { MIN_TELEGRAPH_MS, MIN_WINDOW_MS } from './enemies/variants'
import { stageHints } from '../ui/screens'
import { withSeededRandom } from '../test/prng'

const W = 1280, H = 720
const S6 = STAGES[5]
const at6 = (elapsed: number, o: Partial<GameState> = {}): GameState => ({
  ...createInitialState(6), phase: 'playing', roundTimeMs: S6.durationMs - elapsed,
  spawnTimers: { ghost: 1e9, bat: 1e9, skull: 1e9, lunger: 1e9, pumpkin: 1e9 }, ...o,
})

describe('stage 6 config (R5.1, R5.2)', () => {
  it('is the last stage, 60 s, after the stage-5 boss, with new ghosts and the finale', () => {
    expect(STAGES).toHaveLength(6)
    expect(S6.id).toBe(6)
    expect(S6.subtitle).toBe('The Midnight Finale')
    expect(S6.durationMs).toBeGreaterThanOrEqual(45_000)
    expect(S6.durationMs).toBeLessThanOrEqual(60_000)
    expect(S6.finale?.bossAtMs).toBe(22_000)
    expect(S6.maxEnemies).toBe(5)
    expect(STAGES[4].finale).toBeUndefined()
  })
  it('introduces each new ghost on its own first, and no scripted new ghost after 17 s', () => {
    const ev = S6.variantEvents!
    expect(ev.slice(0, 3).map((e) => e.kind)).toEqual(['wisp', 'mirror', 'blink'])
    expect(ev[0].atMs).toBe(2000)
    for (let i = 1; i < ev.length; i++) expect(ev[i].atMs).toBeGreaterThanOrEqual(ev[i - 1].atMs)
    expect(Math.max(...ev.map((e) => e.atMs))).toBeLessThanOrEqual(17_000)
  })
  it('has a hint line per new ghost with its icon', () => {
    expect(stageHints({ stage: 6, bonus: false })).toHaveLength(3)
    expect(stageHints({ stage: 6, bonus: false }).map((l) => l[0])).toEqual(['∞', '▮', '◆'])
    expect(stageHints({ stage: 5, bonus: false })).toEqual([])
  })
})

describe('scripted new ghosts (R5.2)', () => {
  it('fires the first event at 2 s with a wisp pair and a tip call-out', () => {
    const s = withSeededRandom(1, () => tickSpawners(at6(2000), 16, W, H))
    expect(s.enemies.filter((e) => e.type === 'wisp')).toHaveLength(2)
    expect(s.variantIndex).toBe(1)
    expect(s.callouts.map((c) => c.text)).toEqual([TIPS.wisp])
    expect(s.seenVariants).toContain('wisp')
  })
  it('waits for a free slot and drops events that are too late', () => {
    const full = Array.from({ length: 5 }, (_, i) => makeEnemy({ id: 'g' + i, type: 'ghost', x: 0, y: 0, targetX: 0, targetY: 0, speed: 0.1, hitbox: { x: 0, y: 0, w: 1, h: 1 } }))
    const waiting = tickSpawners(at6(2000, { enemies: full }), 16, W, H)
    expect(waiting.variantIndex).toBe(0)
    const late = withSeededRandom(2, () => tickSpawners(at6(2000 + VARIANT_DEFER_MAX_MS + 1), 16, W, H))
    expect(late.variantIndex).toBe(1)
    expect(late.enemies.filter((e) => e.type === 'wisp')).toHaveLength(0)
  })
  it('shows a tip only once per type', () => {
    let s = at6(0)
    s = withTip(s, 'blink', 100, 100, W, H)
    s = withTip(s, 'blink', 100, 100, W, H)
    expect(s.callouts).toHaveLength(1)
  })
  it('no skull spawns in the last 7 s before the boss', () => {
    const t = { ghost: 1e9, bat: 1e9, skull: 0, lunger: 1e9, pumpkin: 1e9 }
    const early = withSeededRandom(3, () => tickSpawners(at6(10_000, { spawnTimers: t, variantIndex: 99 }), 16, W, H))
    expect(early.enemies.some((e) => e.type === 'skull')).toBe(true)
    const late = withSeededRandom(3, () => tickSpawners(at6(15_000, { spawnTimers: t, variantIndex: 99 }), 16, W, H))
    expect(late.enemies.some((e) => e.type === 'skull')).toBe(false)
  })
})

describe('the Hollow King (R6)', () => {
  it('bossDue: stage 5 at once, stage 6 at 22 s, never twice', () => {
    expect(bossDue({ stage: 5, roundTimeMs: 60_000, bossActive: false, bonus: false })).toBe(true)
    expect(bossDue({ stage: 6, roundTimeMs: 60_000 - 21_999, bossActive: false, bonus: false })).toBe(false)
    expect(bossDue({ stage: 6, roundTimeMs: 60_000 - 22_000, bossActive: false, bonus: false })).toBe(true)
    expect(bossDue({ stage: 6, roundTimeMs: 10_000, bossActive: true, bonus: false })).toBe(false)
    expect(bossDue({ stage: 4, roundTimeMs: 10_000, bossActive: false, bonus: false })).toBe(false)
  })
  it('the simulation spawns a finale boss at 22 s and shows the banner 3 s before', () => {
    let s = at6(19_000, { variantIndex: 99 })
    s = stepSimulation(s, 200, W, H)
    expect(s.callouts.map((c) => c.text)).toContain(KING_BANNER)
    expect(s.bossActive).toBe(false)
    s = stepSimulation({ ...s, roundTimeMs: S6.durationMs - 22_000 }, 16, W, H)
    const boss = s.enemies.find((e) => e.type === 'boss')!
    expect(boss.finale).toBe(true)
    expect(withKingWarning(s, W, H).callouts.filter((c) => c.text === KING_BANNER)).toHaveLength(1)
  })
  it('spawnBoss on stage 5 is the normal boss', () => {
    expect(spawnBoss(createInitialState(5), W, H).enemies[0].finale).toBe(false)
  })
  it('every finale wind-up lasts at least 400 ms and lunges are slower than stage 5', () => {
    for (const p of [2, 3] as const) {
      expect(FINALE_PARAMS[p].windupMs).toBeGreaterThanOrEqual(MIN_TELEGRAPH_MS)
      expect(FINALE_PARAMS[p].lungeSpeed).toBeLessThan(PHASE_PARAMS[p].lungeSpeed)
      // vulnerable per cycle: wind-up + recover (the lunge adds more)
      expect(FINALE_PARAMS[p].windupMs + FINALE_PARAMS[p].recoverMs).toBeGreaterThanOrEqual(MIN_WINDOW_MS)
      // R6.4: at least 1800 ms vulnerable per attack cycle after every phase change
      expect(FINALE_PARAMS[p].windupMs + FINALE_PARAMS[p].recoverMs).toBeGreaterThanOrEqual(1800)
    }
    expect(paramsFor(createBoss(W, H, true), 2)).toBe(FINALE_PARAMS[2])
    expect(paramsFor(createBoss(W, H), 2)).toBe(PHASE_PARAMS[2])
  })
  it('the wind-up of a finale boss uses its own timing', () => {
    let b: Enemy = { ...createBoss(W, H, true), x: W / 2, y: hoverY(H), bossPhase: 2, bossAttack: 'idle', bossTimerMs: 0, bossHitsReceived: 4 }
    b = moveBoss(b, 16, W, H)
    expect(b.bossAttack).toBe('windup')
    expect(b.bossTimerMs).toBeCloseTo(700 - 16, 6)
    const hit = onBossHit({ ...b, bossInvulnMs: 0 })
    expect(hit.boss.bossTimerMs).toBe(FINALE_PARAMS[2].recoverMs)
  })
  it('minion kinds per phase: blink, wisp pair, mirror (+ blink every other summon)', () => {
    expect(finaleMinionKinds(1, 0)).toEqual(['blink'])
    expect(finaleMinionKinds(2, 3)).toEqual(['wisp'])
    expect(finaleMinionKinds(3, 0)).toEqual(['mirror'])
    expect(finaleMinionKinds(3, 1)).toEqual(['mirror', 'blink'])
  })
  it('a phase change restarts the summon count, so the first phase-3 summon has no blink (R6.3)', () => {
    const b: Enemy = { ...createBoss(W, H, true), bossPhase: 2, bossHitsReceived: 6, vHits: 5, bossInvulnMs: 0 }
    const hit = onBossHit(b)
    expect(hit.phaseChanged).toBe(true)
    expect(hit.boss.bossPhase).toBe(3)
    expect(hit.boss.vHits).toBe(0)
    expect(finaleMinionKinds(3, hit.boss.vHits)).toEqual(['mirror'])
  })
  it('summons at the hover line, respecting the cap (a pair counts 2)', () => {
    const boss = (phase: 1 | 2 | 3): Enemy => ({ ...createBoss(W, H, true), x: W / 2, y: hoverY(H), bossPhase: phase, summonTimerMs: 0 })
    const play = (b: Enemy, extra: Enemy[] = []) => ({ ...createInitialState(6), phase: 'playing' as const, enemies: [b, ...extra] })
    const p1 = tickBoss(play(boss(1)), W, H)
    expect(p1.enemies.filter((e) => e.type === 'blink')).toHaveLength(1)
    const p2 = tickBoss(play(boss(2)), W, H)
    expect(p2.enemies.filter((e) => e.type === 'wisp')).toHaveLength(2)
    const blinks = [0, 1, 2].map((i) => makeEnemy({ id: 'b' + i, type: 'blink', x: 0, y: 0, targetX: 0, targetY: 0, speed: 0.1, hitbox: { x: 0, y: 0, w: 1, h: 1 } }))
    const capped = tickBoss(play(boss(2), blinks), W, H)
    expect(capped.enemies.filter((e) => e.type === 'wisp')).toHaveLength(0) // 3 + 2 > cap 4
    expect(capped.enemies.find((e) => e.type === 'boss')!.summonTimerMs).toBeGreaterThan(0)
    const away = tickBoss(play({ ...boss(1), y: hoverY(H) + 100 }), W, H)
    expect(away.enemies).toHaveLength(1)
  })
  it('a king summon shows the first-sighting tip of each summoned type once (R5.4)', () => {
    const b: Enemy = { ...createBoss(W, H, true), x: W / 2, y: hoverY(H), bossPhase: 3, summonTimerMs: 0 }
    const s = tickBoss({ ...createInitialState(6), phase: 'playing', enemies: [b] }, W, H)
    expect(s.seenVariants).toEqual(expect.arrayContaining(['mirror']))
    expect(s.callouts.some((c) => c.text === TIPS.mirror)).toBe(true)
    const again = tickBoss({ ...s, enemies: s.enemies.map((e) => (e.type === 'boss' ? { ...e, summonTimerMs: 0 } : e)) }, W, H)
    expect(again.callouts.filter((c) => c.text === TIPS.mirror)).toHaveLength(s.callouts.filter((c) => c.text === TIPS.mirror).length)
  })
  it('minions spawn inside their grace, in their safe state', () => {
    const b: Enemy = { ...createBoss(W, H, true), x: W / 2, y: hoverY(H), bossPhase: 3, summonTimerMs: 0 }
    const s = tickBoss({ ...createInitialState(6), phase: 'playing', enemies: [b] }, W, H)
    const m = s.enemies.find((e) => e.type === 'mirror')!
    expect(m.vState).toBe('shield')
    expect(m.targetX).toBe(W / 2)
  })
  it('fight budget: the boss can be beaten in the time left, entry flight included (R6.4)', () => {
    const left = S6.durationMs - S6.finale!.bossAtMs
    // entry flight: simulate the boss from spawn to its hover line
    let b: Enemy = createBoss(W, H, true)
    let flightMs = 0
    while (!atHover(b, H) && flightMs < 20_000) { b = moveBoss(b, 16, W, H); flightMs += 16 }
    expect(atHover(b, H)).toBe(true)
    // phase 1: i-frames between hits; phases 2 and 3: a vulnerable window of >= 1800 ms
    // takes two hits (1000 ms apart), so phase 3's three hits need two cycles; phase 2 is charged one cycle per hit
    const p2 = FINALE_PARAMS[2], p3 = FINALE_PARAMS[3]
    const cycle2 = p2.idleMs + p2.windupMs + p2.recoverMs + 1500
    const cycle3 = p3.idleMs + p3.windupMs + p3.recoverMs + 1200
    const worst = flightMs + 4 * 1000 + 3 * cycle2 + 2 * cycle3
    expect(worst).toBeLessThan(left - 2000) // at least 2 s of slack
  })
})

describe('flow (R7.1)', () => {
  it('stage 5 → stage 6 title, stage 6 → victory', () => {
    const s5 = advanceToNextStage({ ...createInitialState(5), phase: 'summary', score: 9000, lives: 2 }, W, H)
    expect([s5.stage, s5.phase, s5.score, s5.lives]).toEqual([6, 'stageTitle', 9000, 2])
    const s6 = advanceToNextStage({ ...createInitialState(6), phase: 'summary' }, W, H)
    expect(s6.phase).toBe('victory')
  })
  it('stage clock helper', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 60_000 }), (t) => {
      expect(stageElapsedMs({ stage: 6, roundTimeMs: 60_000 - t })).toBe(t)
    }))
  })
})
