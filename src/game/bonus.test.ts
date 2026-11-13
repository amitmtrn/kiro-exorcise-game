import { describe, it, expect, vi, beforeEach } from 'vitest'
import { advanceToNextStage, tickRound, retryStage } from './round'
import { tickSpawners } from './enemies/spawn'
import { createInitialState, makeEnemy, tickTimer, STAGE_TITLE_DURATION_MS } from './state'
import type { GameState, Enemy } from './state'
import { STAGES, stageLabel } from './stages'
import { BONUS_ROUND } from './waves'
import { withSeededRandom } from '../test/prng'

vi.mock('../webcam/diff', () => ({
  computeFrameDiff: vi.fn(),
  scaleHitbox: vi.fn((hb: unknown) => hb),
  MOTION_W: 320,
  MOTION_H: 180,
}))
vi.mock('../audio/sfx', () => ({
  sfxGhostHit: vi.fn(), sfxBatHit: vi.fn(), sfxSkullHit: vi.fn(),
  sfxBossHit: vi.fn(), sfxBossDefeated: vi.fn(), sfxCombo: vi.fn(),
}))

import { computeFrameDiff } from '../webcam/diff'
import { resolveHits } from './collision'
const mockDiff = computeFrameDiff as ReturnType<typeof vi.fn>

const W = 960, H = 540
const gs = (o: Partial<GameState>): GameState => ({ ...createInitialState(), ...o }) as GameState

describe('bonus round flow', () => {
  it('stage 2 summary → bonus title card on the same stage, lives and score carried', () => {
    const s = advanceToNextStage(gs({ stage: 2, lives: 2, score: 900, highScore: 900, phase: 'summary' }), W, H)
    expect(s.phase).toBe('stageTitle')
    expect(s.bonus).toBe(true)
    expect(s.stage).toBe(2)
    expect(s.lives).toBe(2)
    expect(s.score).toBe(900)
    expect(s.stageTitleMs).toBe(STAGE_TITLE_DURATION_MS)
    expect(stageLabel(s).name).toBe('Bonus Round')
  })

  it('the title card counts down into a playing bonus round with its own duration and slots', () => {
    let s = advanceToNextStage(gs({ stage: 2, phase: 'summary' }), W, H)
    s = tickRound(s, STAGE_TITLE_DURATION_MS, W, H)
    expect(s.phase).toBe('playing')
    expect(s.bonus).toBe(true)
    expect(s.roundTimeMs).toBe(BONUS_ROUND.durationMs)
    expect(s.spawnTimers.ghost).toBeGreaterThanOrEqual(99999)
    expect(s.spawnTimers.skull).toBeGreaterThanOrEqual(99999)
    expect(s.spawnTimers.lunger).toBeGreaterThanOrEqual(99999)
    expect(s.spawnTimers.bat).toBe(BONUS_ROUND.spawnIntervalMs.bat)
    expect(s.waveIndex).toBe(0)
  })

  it('the bonus round ends in the summary, then stage 3 (bonus off)', () => {
    let s = advanceToNextStage(gs({ stage: 2, lives: 3, score: 100, phase: 'summary' }), W, H)
    s = tickRound(s, STAGE_TITLE_DURATION_MS, W, H)
    s = tickTimer(s, BONUS_ROUND.durationMs)
    expect(s.phase).toBe('summary')
    expect(s.bonus).toBe(true)
    s = advanceToNextStage(s, W, H)
    expect(s.stage).toBe(3)
    expect(s.bonus).toBe(false)
    expect(s.phase).toBe('stageTitle')
    expect(s.lives).toBe(3)
    expect(s.score).toBe(100)
    expect(stageLabel(s).name).toBe('Stage 3')
  })

  it('only stage 2 is followed by a bonus round', () => {
    for (const stage of [1, 3, 4]) {
      const s = advanceToNextStage(gs({ stage, phase: 'summary' }), W, H)
      expect(s.bonus).toBe(false)
      expect(s.stage).toBe(stage + 1)
    }
    expect(STAGES.filter((c) => c.bonusAfter).map((c) => c.id)).toEqual([2])
  })

  it('retrying after a game over never starts in a bonus round', () => {
    const r = retryStage(gs({ stage: 2, bonus: true, phase: 'gameover' }))
    expect(r.bonus).toBe(false)
    expect(r.phase).toBe('stageTitle')
  })

  it('the next stage after the bonus round starts its wave script from the top', () => {
    const s = advanceToNextStage(gs({ stage: 2, bonus: true, waveIndex: 3, phase: 'summary' }), W, H)
    expect(s.waveIndex).toBe(0)
  })
})

describe('bonus spawner', () => {
  const bonusState = (elapsedMs: number): GameState => ({
    ...createInitialState(2),
    phase: 'playing',
    bonus: true,
    roundTimeMs: BONUS_ROUND.durationMs - elapsedMs,
    spawnTimers: { ghost: 0, bat: 0, skull: 0, lunger: 0, pumpkin: 0 },
  })

  it('spawns candy and one-hit pumpkins only, all harmless, on exiting paths', () => {
    withSeededRandom(21, () => {
      let s = bonusState(0)
      const seen = new Set<string>()
      for (let t = 0; t < BONUS_ROUND.durationMs; t += 50) {
        s = tickSpawners({ ...s, roundTimeMs: BONUS_ROUND.durationMs - t }, 50, W, H)
        for (const e of s.enemies) {
          seen.add(e.type)
          expect(['candy', 'pumpkin']).toContain(e.type)
          expect(e.harmless).toBe(true)
          expect(e.path).toBeDefined()
          expect(e.hitsNeeded).toBe(1)
          expect(e.path!.y1 > 1 || e.path!.x1 < 0 || e.path!.x1 > 1).toBe(true)
        }
        s = { ...s, enemies: s.enemies.slice(0, 7) }
        expect(s.enemies.length).toBeLessThanOrEqual(BONUS_ROUND.maxEnemies)
      }
      expect(seen.has('candy')).toBe(true)
      expect(seen.has('pumpkin')).toBe(true)
    })
  })

  it('fires its scripted events (candy swarm at 3 s)', () => {
    withSeededRandom(2, () => {
      const ev = BONUS_ROUND.script.events[0]
      const s = tickSpawners({ ...bonusState(ev.atMs), spawnTimers: { ghost: 1e9, bat: 1e9, skull: 1e9, lunger: 1e9, pumpkin: 1e9 } }, 16, W, H)
      expect(s.enemies).toHaveLength(ev.count)
      expect(s.enemies.every((e) => e.type === 'candy')).toBe(true)
      expect(s.waveIndex).toBe(1)
    })
  })
})

describe('bonus scoring', () => {
  beforeEach(() => mockDiff.mockReset())

  const target = (type: Enemy['type'], over: Partial<Enemy> = {}): Enemy => makeEnemy({
    id: 'x', type, x: 480, y: 270, targetX: 480, targetY: 270, speed: 0.1,
    hitbox: { x: 440, y: 230, w: 80, h: 80 }, spawnedAt: 0, hitCount: 1, harmless: true, ...over,
  })

  it('candy scores 75 × combo and extends the combo', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(2), bonus: true, combo: 2, enemies: [target('candy')] }
    const r = resolveHits(s, {} as ImageData, {} as ImageData, W, H, 1000)
    expect(r.score).toBe(150)
    expect(r.streak).toBe(1)
    expect(r.enemies).toHaveLength(0)
    expect(r.lives).toBe(3)
  })

  it('a bonus pumpkin falls to one hit and scores 200 × combo', () => {
    mockDiff.mockReturnValue(true)
    const s = { ...createInitialState(2), bonus: true, enemies: [target('pumpkin', { hitsNeeded: 1 })] }
    const r = resolveHits(s, {} as ImageData, {} as ImageData, W, H, 1000)
    expect(r.score).toBe(200)
    expect(r.enemies).toHaveLength(0)
    expect(r.lives).toBe(3)
  })
})

describe('bonus round: candy slot reserve (R5.3a)', () => {
  const fill = (n: number): Enemy[] => Array.from({ length: n }, (_, i) => makeEnemy({
    id: `x${i}`, type: 'pumpkin', x: 100, y: 100 + i, targetX: 480, targetY: 270, speed: 0.1,
    hitbox: { x: 80, y: 80 + i, w: 40, h: 40 },
  }))
  const NEVER = 1e9
  const bonusAt = (enemies: Enemy[], timers: Partial<GameState['spawnTimers']>): GameState => ({
    ...createInitialState(2),
    phase: 'playing',
    bonus: true,
    roundTimeMs: BONUS_ROUND.durationMs - 1, // before the first scripted event
    spawnTimers: { ghost: NEVER, bat: NEVER, skull: NEVER, lunger: NEVER, pumpkin: NEVER, ...timers },
    enemies,
  })
  /** Math.random pinned high: pickPath → the last mix entry (swarm for candy), swarm size 5. */
  const withRandom = <T,>(v: number, fn: () => T): T => {
    const orig = Math.random
    Math.random = () => v
    try { return fn() } finally { Math.random = orig }
  }
  const count = (s: GameState) => s.enemies.filter((e) => e.type !== 'boss' && !e.exiting).length
  const max = BONUS_ROUND.maxEnemies

  it('a random candy swarm never takes the last slot', () => {
    for (const present of [3, 4, 5, 6]) {
      const s = withRandom(0.99, () => tickSpawners(bonusAt(fill(present), { bat: 0 }), 16, W, H))
      expect(count(s)).toBeLessThanOrEqual(max - 1)
    }
  })

  it('random candy stops spawning at maxEnemies − 1', () => {
    const s = withRandom(0.5, () => tickSpawners(bonusAt(fill(max - 1), { bat: 0 }), 16, W, H))
    expect(count(s)).toBe(max - 1)
  })

  it('a random bonus pumpkin may use the last slot', () => {
    const s = withRandom(0.5, () => tickSpawners(bonusAt(fill(max - 1), { pumpkin: 0 }), 16, W, H))
    expect(count(s)).toBe(max)
  })

  it('a scripted event may use the last slot', () => {
    const s0 = { ...bonusAt(fill(max - 1), {}), waveIndex: 1 } // the 3 s swarm already fired
    const s = withRandom(0.5, () => tickSpawners({ ...s0, roundTimeMs: BONUS_ROUND.durationMs - 8_000 }, 16, W, H))
    expect(count(s)).toBe(max) // the 8 s flyby of 4 candy is truncated to the single free slot
  })
})
