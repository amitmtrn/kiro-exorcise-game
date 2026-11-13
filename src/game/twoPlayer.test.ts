import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../audio/sfx', () => ({
  sfxGhostHit: vi.fn(), sfxBatHit: vi.fn(), sfxSkullHit: vi.fn(),
  sfxBossHit: vi.fn(), sfxBossDefeated: vi.fn(), sfxCombo: vi.fn(),
}))
vi.mock('../audio/index', () => ({ sfxLifeLost: vi.fn() }))

import {
  createTwoPlayer, tickTwoPlayer, advanceSession, seatStatus, winnerOf, isOut,
} from './twoPlayer'
import type { TwoPlayerState, MotionInput } from './twoPlayer'
import { makeEnemy, decrementLife, addScore, incrementCombo, STARTING_LIVES, SUMMARY_AUTO_ADVANCE_MS } from './state'
import type { GameState, Enemy } from './state'
import { MOTION_W, MOTION_H } from '../webcam/diff'
import { STAGES } from './stages'
import { withSeededRandom } from '../test/prng'

const W = 1280, H = 720

function frames(rects: Array<{ x: number; y: number; w: number; h: number }>): MotionInput {
  const cur = new Uint8ClampedArray(MOTION_W * MOTION_H * 4)
  const prev = new Uint8ClampedArray(MOTION_W * MOTION_H * 4)
  for (const r of rects) {
    for (let y = r.y; y < Math.min(MOTION_H, r.y + r.h); y++) {
      for (let x = r.x; x < Math.min(MOTION_W, r.x + r.w); x++) {
        const i = (y * MOTION_W + x) * 4
        cur[i] = cur[i + 1] = cur[i + 2] = 255
      }
    }
  }
  const mk = (d: Uint8ClampedArray) => ({ data: d, width: MOTION_W, height: MOTION_H }) as unknown as ImageData
  return { cur: mk(cur), prev: mk(prev), frameIsNew: true, now: 100_000 }
}
const STILL = frames([])

function playing(t0 = createTwoPlayer()): TwoPlayerState {
  let t = t0
  for (let i = 0; i < 300 && t.phase !== 'playing'; i++) t = tickTwoPlayer(t, 16, W, H, null)
  return t
}

/** A ghost parked in the middle of a half (half-local coordinates). */
function ghost(id: string, x: number, y: number, extra: Partial<Enemy> = {}): Enemy {
  return makeEnemy({
    id, type: 'ghost', x, y, targetX: W / 4, targetY: H / 2, speed: 0.0001, // parked far from the target so it never "reaches" it
    hitbox: { x: x - 40, y: y - 40, w: 80, h: 80 }, spawnedAt: 0, ...extra,
  })
}
function withSeat(t: TwoPlayerState, seat: 0 | 1, f: (s: GameState) => GameState): TwoPlayerState {
  const seats: [GameState, GameState] = [t.seats[0], t.seats[1]]
  seats[seat] = f(seats[seat])
  return { ...t, seats }
}

beforeEach(() => { vi.restoreAllMocks() })

describe('createTwoPlayer / title', () => {
  it('starts both seats on the stage-1 title with full lives and zero score', () => {
    const t = createTwoPlayer()
    expect(t.phase).toBe('stageTitle')
    for (const s of t.seats) {
      expect(s.phase).toBe('stageTitle')
      expect(s.lives).toBe(STARTING_LIVES)
      expect(s.score).toBe(0)
      expect(s.combo).toBe(1)
    }
  })

  it('both seats start playing on the same tick with the stage time as the shared clock', () => {
    const t = playing()
    expect(t.phase).toBe('playing')
    expect(t.seats.map((s) => s.phase)).toEqual(['playing', 'playing'])
    expect(t.roundTimeMs).toBe(STAGES[0].durationMs)
  })
})

describe('shared clock (R3.1)', () => {
  it('counts down on real deltaMs and is identical in both seats', () => {
    let t = playing()
    const start = t.roundTimeMs
    t = tickTwoPlayer(t, 250, W, H, null)
    expect(t.roundTimeMs).toBe(start - 250)
    expect(t.seats[0].roundTimeMs).toBe(t.seats[1].roundTimeMs)
    expect(t.seats[0].roundTimeMs).toBe(t.roundTimeMs)
  })

  it('is not paused by one seat\'s hit-stop', () => {
    let t = playing()
    t = withSeat(t, 0, (s) => ({ ...s, hitStopMs: 60 }))
    const before = t.roundTimeMs
    t = tickTwoPlayer(t, 100, W, H, null)
    expect(t.roundTimeMs).toBe(before - 100)
    expect(t.seats[0].hitStopMs).toBe(0)
  })
})

describe('independent state (R2.1)', () => {
  it('a banish in the left half scores only player 1 and never touches player 2', () => {
    let t = playing()
    // ghost at the centre of each half; wave only over the LEFT half (motion cols 0-159)
    t = withSeat(t, 0, (s) => ({ ...s, enemies: [ghost('L', 150, 100, { hitCount: 1 })] }))
    t = withSeat(t, 1, (s) => ({ ...s, enemies: [ghost('R', 150, 100, { hitCount: 1 })] }))
    const m = frames([{ x: 0, y: 0, w: 160, h: MOTION_H }])
    const after = tickTwoPlayer(t, 16, W, H, m)
    expect(after.seats[0].score).toBe(100)
    expect(after.seats[0].streak).toBe(1)
    expect(after.seats[0].stageBanished).toBe(1)
    expect(after.seats[1].score).toBe(0)
    expect(after.seats[1].streak).toBe(0)
    expect(after.seats[1].enemies.some((e) => e.id === 'R')).toBe(true)
    expect(after.banished[0]).toHaveLength(1)
    expect(after.banished[1]).toHaveLength(0)
  })

  it('motion in the right half (mirrored view) scores player 2 only', () => {
    let t = playing()
    t = withSeat(t, 0, (s) => ({ ...s, enemies: [ghost('L', 150, 100, { hitCount: 1 })] }))
    t = withSeat(t, 1, (s) => ({ ...s, enemies: [ghost('R', 150, 100, { hitCount: 1 })] }))
    const after = tickTwoPlayer(t, 16, W, H, frames([{ x: 160, y: 0, w: 160, h: MOTION_H }]))
    expect(after.seats[1].score).toBe(100)
    expect(after.seats[0].score).toBe(0)
  })

  it('each seat has its own combo tier', () => {
    let t = playing()
    t = withSeat(t, 0, (s) => { for (let i = 0; i < 3; i++) s = incrementCombo(s); return s })
    expect(t.seats[0].combo).toBe(2)
    expect(t.seats[1].combo).toBe(1)
    t = tickTwoPlayer(t, 16, W, H, STILL)
    expect(t.seats[0].combo).toBe(2)
    expect(t.seats[1].combo).toBe(1)
  })

  it('a life lost by one player leaves the other\'s lives and combo alone', () => {
    let t = playing()
    t = withSeat(t, 1, (s) => decrementLife(s))
    expect(t.seats[0].lives).toBe(3)
    expect(t.seats[1].lives).toBe(2)
  })

  it('the skull penalty hits only the owner of the half', () => {
    let t = playing()
    const skull = makeEnemy({
      id: 'sk', type: 'skull', x: W / 4, y: H / 2, targetX: W / 4, targetY: H / 2, speed: 0.0001,
      hitbox: { x: W / 4 - 40, y: H / 2 - 40, w: 80, h: 80 }, spawnedAt: 0, hitCount: 1,
    })
    t = withSeat(t, 1, (s) => ({ ...s, enemies: [skull] }))
    const after = tickTwoPlayer(t, 16, W, H, frames([{ x: 160, y: 0, w: 160, h: MOTION_H }]))
    expect(after.seats[1].lives).toBe(2)
    expect(after.seats[0].lives).toBe(3)
  })
})

describe('player out (R4.1, R4.5)', () => {
  function outLeft(): TwoPlayerState {
    let t = playing()
    for (let i = 0; i < 3; i++) t = withSeat(t, 0, (s) => decrementLife(s))
    return t
  }

  it('an out seat stops spawning while the other keeps going', () => {
    let t = outLeft()
    expect(seatStatus(t, 0)).toBe('out')
    expect(isOut(t.seats[0])).toBe(true)
    const rightPlaying = t.seats[1].phase
    withSeededRandom(5, () => {
      for (let i = 0; i < 600; i++) t = tickTwoPlayer(t, 16, W, H, STILL)
    })
    expect(t.seats[0].enemies).toHaveLength(0)
    expect(t.seats[0].phase).toBe('gameover')
    expect(rightPlaying).toBe('playing')
    expect(t.seats[1].enemies.length + t.seats[1].stageMissed).toBeGreaterThan(0) // right half still spawns
  })

  it('does not end the round while one player can continue', () => {
    const t = tickTwoPlayer(outLeft(), 16, W, H, STILL)
    expect(t.phase).toBe('playing')
  })

  it('ends the game when both players are out', () => {
    let t = outLeft()
    for (let i = 0; i < 3; i++) t = withSeat(t, 1, (s) => decrementLife(s))
    t = tickTwoPlayer(t, 16, W, H, STILL)
    expect(t.phase).toBe('final')
  })

  it('an out player keeps their score and stays out in later stages', () => {
    let t = outLeft()
    t = withSeat(t, 0, (s) => addScore(s, 700))
    // let the stage time run out for the surviving seat
    t = { ...t, roundTimeMs: 10 }
    t = tickTwoPlayer(t, 16, W, H, STILL)
    expect(t.phase).toBe('summary')
    t = advanceSession(t, W, H)
    expect(t.phase).toBe('stageTitle')
    expect(t.stage).toBe(2)
    expect(t.seats[0].phase).toBe('gameover')
    expect(t.seats[0].score).toBe(700)
    expect(t.seats[1].phase).toBe('stageTitle')
    t = playing(t)
    expect(t.seats[0].phase).toBe('gameover')
    expect(t.seats[1].phase).toBe('playing')
  })
})

describe('stage flow (R3.4)', () => {
  it('timer expiry sends both seats to the shared summary and auto-advances together', () => {
    let t = playing()
    t = { ...t, roundTimeMs: 10 }
    t = tickTwoPlayer(t, 16, W, H, STILL)
    expect(t.phase).toBe('summary')
    expect(t.seats.map((s) => s.phase)).toEqual(['summary', 'summary'])
    t = tickTwoPlayer(t, SUMMARY_AUTO_ADVANCE_MS, W, H, STILL)
    expect(t.phase).toBe('stageTitle')
    expect(t.stage).toBe(2)
    expect(t.seats.map((s) => s.stage)).toEqual([2, 2])
    expect(t.seats.map((s) => s.lives)).toEqual([3, 3])
  })

  it('advanceSession is a no-op outside the summary', () => {
    const t = playing()
    expect(advanceSession(t, W, H)).toBe(t)
  })

  it('lives and score carry across the stage change per seat', () => {
    let t = playing()
    t = withSeat(t, 0, (s) => addScore(decrementLife(s), 250))
    t = { ...t, roundTimeMs: 10 }
    t = tickTwoPlayer(t, 16, W, H, STILL)
    t = advanceSession(t, W, H)
    expect(t.seats[0].lives).toBe(2)
    expect(t.seats[0].score).toBe(250)
    expect(t.seats[1].lives).toBe(3)
    expect(t.seats[1].score).toBe(0)
  })
})

describe('boss stage (R3.3, R4.2, R4.3)', () => {
  function bossStage(): TwoPlayerState {
    const base = createTwoPlayer()
    const seats = base.seats.map((s) => ({ ...s, stage: 5 })) as [GameState, GameState]
    return playing({ ...base, stage: 5, seats })
  }

  it('each seat spawns its own boss centred in its own half', () => {
    let t = bossStage()
    t = tickTwoPlayer(t, 16, W, H, STILL)
    for (const s of t.seats) {
      const bosses = s.enemies.filter((e) => e.type === 'boss')
      expect(bosses).toHaveLength(1)
      expect(Math.abs(bosses[0].x - W / 4)).toBeLessThan(W / 4) // inside its half's width
    }
  })

  it('defeating one boss clears that seat only; the other keeps fighting', () => {
    let t = bossStage()
    t = tickTwoPlayer(t, 16, W, H, STILL)
    // one hit away, vulnerable, motion in the right half only
    t = withSeat(t, 1, (s) => ({
      ...s,
      enemies: s.enemies.map((e) => (e.type === 'boss'
        ? {
            ...e, x: 200, y: 200, hitbox: { x: 120, y: 120, w: 160, h: 160 },
            bossHitsReceived: e.hitsNeeded - 1, bossPhase: 3 as const, bossAttack: 'windup' as const,
            bossTimerMs: 600, hitCount: 1, spawnedAt: 0, bossInvulnMs: 0,
          }
        : e)),
    }))
    const bossBox = t.seats[1].enemies.find((e) => e.type === 'boss')!.hitbox
    const mx = Math.round((bossBox.x + bossBox.w / 2) * 160 / (W / 2)) + 160
    const my = Math.round((bossBox.y + bossBox.h / 2) * MOTION_H / H)
    const after = tickTwoPlayer(t, 16, W, H, frames([{ x: mx - 15, y: my - 15, w: 30, h: 30 }]))
    expect(after.seats[1].phase).toBe('victory')
    expect(after.seats[1].score).toBeGreaterThanOrEqual(1000)
    expect(after.seats[0].phase).toBe('playing')
    expect(after.seats[0].score).toBe(0)
    expect(after.phase).toBe('playing')
  })

  it('timer expiry with a live boss makes that player out; the game ends when no one can continue', () => {
    let t = bossStage()
    t = tickTwoPlayer(t, 16, W, H, STILL)
    t = { ...t, roundTimeMs: 10 }
    t = tickTwoPlayer(t, 16, W, H, STILL)
    expect(t.seats.map((s) => s.phase)).toEqual(['gameover', 'gameover'])
    expect(t.phase).toBe('final')
  })

  it('the final stage finished with a win ends the game', () => {
    let t = bossStage()
    t = { ...t, seats: [{ ...t.seats[0], phase: 'victory' }, { ...t.seats[1], phase: 'gameover' }] as [GameState, GameState] }
    t = tickTwoPlayer(t, 16, W, H, STILL)
    expect(t.phase).toBe('final')
  })
})

describe('winner (R5.1)', () => {
  it('higher score wins, equal scores tie', () => {
    let t = createTwoPlayer()
    t = withSeat(t, 0, (s) => addScore(s, 300))
    t = withSeat(t, 1, (s) => addScore(s, 200))
    expect(winnerOf(t)).toBe(0)
    t = withSeat(t, 1, (s) => addScore(s, 200))
    expect(winnerOf(t)).toBe(1)
    t = withSeat(t, 0, (s) => addScore(s, 100))
    expect(winnerOf(t)).toBe('tie')
  })

  it('an out player with the higher score still wins', () => {
    let t = playing()
    t = withSeat(t, 0, (s) => addScore(s, 900))
    for (let i = 0; i < 3; i++) t = withSeat(t, 0, (s) => decrementLife(s))
    t = withSeat(t, 1, (s) => addScore(s, 100))
    expect(winnerOf(t)).toBe(0)
  })
})
