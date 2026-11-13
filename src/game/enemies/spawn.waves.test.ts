import { describe, it, expect } from 'vitest'
import { tickSpawners } from './spawn'
import { STAGES } from '../stages'
import { createInitialState, makeEnemy } from '../state'
import type { GameState, Enemy } from '../state'
import { withSeededRandom } from '../../test/prng'

const W = 960, H = 540
const NEVER = 1e9

/** A playing state `elapsedMs` into the stage, with spawn timers parked so only scripted events can fire. */
function at(stage: number, elapsedMs: number, over: Partial<GameState> = {}): GameState {
  const cfg = STAGES[stage - 1]
  return {
    ...createInitialState(stage),
    phase: 'playing',
    roundTimeMs: cfg.durationMs - elapsedMs,
    spawnTimers: { ghost: NEVER, bat: NEVER, skull: NEVER, lunger: NEVER, pumpkin: NEVER },
    ...over,
  }
}

function filler(i: number): Enemy {
  return makeEnemy({
    id: `f${i}`, type: 'ghost', x: -40, y: 100 + i, targetX: 480, targetY: 270, speed: 0.1,
    hitbox: { x: -60, y: 80 + i, w: 40, h: 40 },
  })
}

describe('wave-driven spawner', () => {
  it('stage 1 spawns path enemies whose end points are spread out, not one point', () => {
    withSeededRandom(11, () => {
      let s = at(1, 0, { spawnTimers: { ghost: 0, bat: NEVER, skull: NEVER, lunger: NEVER, pumpkin: NEVER } })
      const ends = new Set<string>()
      for (let i = 0; i < 40; i++) {
        s = { ...s, enemies: [], spawnTimers: { ...s.spawnTimers, ghost: 0 } }
        s = tickSpawners(s, 16, W, H)
        for (const e of s.enemies) {
          expect(e.path).toBeDefined()
          ends.add(`${Math.round(e.targetX / 40)},${Math.round(e.targetY / 40)}`)
        }
      }
      expect(ends.size).toBeGreaterThan(8)
    })
  })

  it('stage 1 (leftRight) enemies enter from the left or right edge only', () => {
    withSeededRandom(5, () => {
      let s = at(1, 0)
      for (let i = 0; i < 60; i++) {
        s = { ...s, enemies: [], spawnTimers: { ...s.spawnTimers, ghost: 0 } }
        s = tickSpawners(s, 16, W, H)
        for (const e of s.enemies) expect(e.x < 0 || e.x > W).toBe(true)
      }
    })
  })

  /** Number of timer-driven ghost/bat spawns over `ms` with the clock parked at `elapsedMs`. */
  function spawnsParkedAt(stage: number, elapsedMs: number, ms: number): number {
    return withSeededRandom(3, () => {
      let s = at(stage, elapsedMs, { spawnTimers: { ghost: 500, bat: 500, skull: NEVER, lunger: NEVER, pumpkin: NEVER } })
      let n = 0
      for (let t = 0; t < ms; t += 20) {
        s = tickSpawners({ ...s, enemies: [] }, 20, W, H)
        n += s.enemies.length
        s = { ...s, waveIndex: 99 } // ignore scripted events: only the random spawner is measured
      }
      return n
    })
  }

  it('spawns more near the peak than at the calm start (R4.2)', () => {
    const cfg = STAGES[2]
    const calm = spawnsParkedAt(3, 0, 120_000)
    const peak = spawnsParkedAt(3, cfg.durationMs * cfg.waves!.intensity.peakAt, 120_000)
    expect(peak).toBeGreaterThan(calm * 1.3)
  })

  it('new enemies are faster at the peak than at the start', () => {
    const speedAt = (elapsed: number) => withSeededRandom(9, () => {
      const s = tickSpawners(at(2, elapsed, { spawnTimers: { ghost: 0, bat: NEVER, skull: NEVER, lunger: NEVER, pumpkin: NEVER }, waveIndex: 99 }), 16, W, H)
      return s.enemies[0].speed
    })
    expect(speedAt(STAGES[1].durationMs * 0.8)).toBeGreaterThan(speedAt(0))
  })

  it('fires a scripted event once when the stage clock passes it', () => {
    withSeededRandom(1, () => {
      const ev = STAGES[1].waves!.events[0] // stage 2: bat swarm of 3 at 10 s
      let s = tickSpawners(at(2, ev.atMs - 1), 1, W, H)
      expect(s.enemies).toHaveLength(0)
      expect(s.waveIndex).toBe(0)
      s = tickSpawners({ ...s, roundTimeMs: STAGES[1].durationMs - ev.atMs }, 1, W, H)
      expect(s.enemies).toHaveLength(ev.count)
      expect(s.enemies.every((e) => e.type === 'bat' && e.path?.kind === 'flyby')).toBe(true)
      expect(s.waveIndex).toBe(1)
      const again = tickSpawners(s, 16, W, H)
      expect(again.waveIndex).toBe(1)
      expect(again.enemies).toHaveLength(ev.count)
    })
  })

  it('fires every overdue event in order within one tick', () => {
    withSeededRandom(2, () => {
      const events = STAGES[1].waves!.events
      const s = tickSpawners(at(2, STAGES[1].durationMs), 16, W, H)
      expect(s.waveIndex).toBe(events.length)
    })
  })

  it('truncates a scripted group to the free capacity, never exceeding the cap (R3.4)', () => {
    withSeededRandom(4, () => {
      const cfg = STAGES[1]
      const ev = cfg.waves!.events[0]
      const pre = Array.from({ length: cfg.maxEnemies - 1 }, (_, i) => filler(i))
      const s = tickSpawners(at(2, ev.atMs, { enemies: pre }), 16, W, H)
      expect(s.enemies.filter((e) => e.type !== 'boss').length).toBe(cfg.maxEnemies)
      expect(s.waveIndex).toBe(1)
    })
  })

  it('skips an event while the stage is full (consumed, nothing spawned)', () => {
    withSeededRandom(4, () => {
      const cfg = STAGES[1]
      const pre = Array.from({ length: cfg.maxEnemies }, (_, i) => filler(i))
      const s = tickSpawners(at(2, cfg.waves!.events[0].atMs, { enemies: pre }), 16, W, H)
      expect(s.enemies).toHaveLength(cfg.maxEnemies)
      expect(s.waveIndex).toBe(1)
    })
  })

  it('the boss stage keeps its own spawning: no script, no paths, no scripted events', () => {
    withSeededRandom(6, () => {
      let s = at(5, 30_000, { spawnTimers: { ghost: 0, bat: 0, skull: 0, lunger: 0, pumpkin: 0 } })
      for (let i = 0; i < 30; i++) s = tickSpawners(s, 100, W, H)
      expect(s.enemies).toHaveLength(0)
      expect(s.waveIndex).toBe(0)
    })
  })

  it('skulls stay legacy (no path) and still obey the one-at-a-time rule', () => {
    withSeededRandom(8, () => {
      let s = at(3, 20_000, { waveIndex: 99, spawnTimers: { ghost: NEVER, bat: NEVER, skull: 0, lunger: NEVER, pumpkin: NEVER } })
      for (let i = 0; i < 20; i++) {
        s = tickSpawners({ ...s, spawnTimers: { ...s.spawnTimers, skull: 0 } }, 16, W, H)
      }
      const skulls = s.enemies.filter((e) => e.type === 'skull')
      expect(skulls).toHaveLength(1)
      expect(skulls[0].path).toBeUndefined()
    })
  })
})
