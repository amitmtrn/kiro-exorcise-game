import { describe, it, expect } from 'vitest'
import { tickRound, startGame, retryStage, advanceToNextStage } from './round'
import { createInitialState, STAGE_TITLE_DURATION_MS } from './state'
import type { GameState } from './state'

const W = 640
const H = 480

/** Cast helper so spread phase overrides compile cleanly. */
const gs = (overrides: Partial<GameState>): GameState =>
  ({ ...createInitialState(), ...overrides }) as GameState

describe('startGame', () => {
  it('transitions from start to stageTitle', () => {
    const s = startGame(createInitialState())
    expect(s.phase).toBe('stageTitle')
    expect(s.stageTitleMs).toBe(STAGE_TITLE_DURATION_MS)
    expect(s.stage).toBe(1)
  })
})

describe('tickRound — stageTitle', () => {
  it('stays in stageTitle while countdown > 0', () => {
    let s = gs({ phase: 'stageTitle', stageTitleMs: 1000 })
    s = tickRound(s, 500, W, H)
    expect(s.phase).toBe('stageTitle')
    expect(s.stageTitleMs).toBe(500)
  })

  it('transitions to playing when countdown reaches 0', () => {
    let s = gs({ phase: 'stageTitle', stageTitleMs: 100 })
    s = tickRound(s, 200, W, H)
    expect(s.phase).toBe('playing')
    expect(s.stageTitleMs).toBe(0)
    expect(s.enemies).toHaveLength(0)
  })

  it('sets roundTimeMs from stage config when entering playing', () => {
    let s = gs({ phase: 'stageTitle', stageTitleMs: 50, stage: 1 })
    s = tickRound(s, 100, W, H)
    expect(s.roundTimeMs).toBe(45_000)
  })
})

describe('tickRound — summary', () => {
  it('accumulates summaryShownMs', () => {
    let s = gs({ phase: 'summary', summaryShownMs: 0 })
    s = tickRound(s, 500, W, H)
    expect(s.summaryShownMs).toBe(500)
    expect(s.phase).toBe('summary')
  })

  it('advances to next stage after SUMMARY_AUTO_ADVANCE_MS', () => {
    let s = gs({ phase: 'summary', summaryShownMs: 4900, stage: 1 })
    s = tickRound(s, 200, W, H)
    expect(s.phase).toBe('stageTitle')
    expect(s.stage).toBe(2)
  })

  it('wraps back to stage 1 after stage 5', () => {
    let s = gs({ phase: 'summary', summaryShownMs: 4900, stage: 5 })
    s = tickRound(s, 200, W, H)
    expect(s.stage).toBe(1)
  })
})

describe('retryStage', () => {
  it('resets to stageTitle for the same stage with fresh lives', () => {
    let s = gs({ stage: 3, lives: 0, phase: 'gameover' })
    s = retryStage(s)
    expect(s.phase).toBe('stageTitle')
    expect(s.stage).toBe(3)
    expect(s.lives).toBe(3)
  })
})

describe('advanceToNextStage', () => {
  it('carries lives and score', () => {
    let s = gs({ stage: 2, lives: 2, score: 500, highScore: 500, phase: 'summary', summaryShownMs: 0 })
    s = advanceToNextStage(s, W, H)
    expect(s.stage).toBe(3)
    expect(s.lives).toBe(2)
    expect(s.score).toBe(500)
  })
})
