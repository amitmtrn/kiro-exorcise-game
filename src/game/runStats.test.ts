import { describe, it, expect } from 'vitest'
import { createRunStats, observeRun, totalBanished, momentRank, bossDefeatedSince } from './runStats'
import type { ObservedState } from './runStats'

const st = (o: Partial<ObservedState> = {}): ObservedState => ({
  phase: 'playing', stage: 1, stageBanished: 0, combo: 1, ...o,
})

describe('observeRun', () => {
  it('counts banishes within a stage', () => {
    let r = createRunStats()
    r = observeRun(r, st({ stageBanished: 3 })).stats
    expect(totalBanished(r)).toBe(3)
    r = observeRun(r, st({ stageBanished: 5 })).stats
    expect(totalBanished(r)).toBe(5)
  })

  it('banks a stage total when stageBanished resets for the next stage', () => {
    let r = createRunStats()
    r = observeRun(r, st({ stageBanished: 12 })).stats
    r = observeRun(r, st({ phase: 'summary', stageBanished: 12 })).stats
    r = observeRun(r, st({ phase: 'stageTitle', stage: 2, stageBanished: 0 })).stats
    r = observeRun(r, st({ stage: 2, stageBanished: 4 })).stats
    expect(totalBanished(r)).toBe(16)
    expect(r.stage).toBe(2)
  })

  it('keeps the run-best combo and stage when the stage state resets', () => {
    let r = createRunStats()
    r = observeRun(r, st({ combo: 3 })).stats
    r = observeRun(r, st({ stage: 2, combo: 1 })).stats
    expect(r.bestCombo).toBe(3)
    expect(r.stage).toBe(2)
  })

  it('reports a combo moment only for a new run-best tier >= x2', () => {
    let r = createRunStats()
    let o = observeRun(r, st({ combo: 1 })); expect(o.moment).toBeNull(); r = o.stats
    o = observeRun(r, st({ combo: 2 })); expect(o.moment).toEqual({ kind: 'combo', rank: 20 }); r = o.stats
    o = observeRun(r, st({ combo: 2 })); expect(o.moment).toBeNull(); r = o.stats
    o = observeRun(r, st({ combo: 1 })); expect(o.moment).toBeNull(); r = o.stats
    o = observeRun(r, st({ combo: 2 })); expect(o.moment).toBeNull(); r = o.stats
    o = observeRun(r, st({ combo: 4 })); expect(o.moment).toEqual({ kind: 'combo', rank: 40 })
  })

  it('reports a boss moment when entering victory and an end moment entering gameover', () => {
    let r = observeRun(createRunStats(), st()).stats
    let o = observeRun(r, st({ phase: 'victory' }))
    expect(o.moment).toEqual({ kind: 'boss', rank: 100 })
    o = observeRun(o.stats, st({ phase: 'victory' }))
    expect(o.moment).toBeNull()

    r = observeRun(createRunStats(), st()).stats
    o = observeRun(r, st({ phase: 'gameover' }))
    expect(o.moment).toEqual({ kind: 'end', rank: 0 })
    expect(observeRun(o.stats, st({ phase: 'gameover' })).moment).toBeNull()
  })

  it('does not mutate its input', () => {
    const r = createRunStats()
    const copy = { ...r }
    observeRun(r, st({ stageBanished: 9, combo: 3 }))
    expect(r).toEqual(copy)
  })
})

describe('momentRank', () => {
  it('2P: a boss defeat offers the boss moment at once (summary), and a later victory does not repeat it', () => {
    const r = observeRun(createRunStats(), st()).stats
    let o = observeRun(r, st({ phase: 'summary', bossDefeated: true }))
    expect(o.moment).toEqual({ kind: 'boss', rank: 100 })
    o = observeRun(o.stats, st({ phase: 'victory' }))
    expect(o.moment).toBeNull()
  })

  it('1P: a stage-5 boss defeat (summary) is the boss moment, even when stage 6 later ends in game over (R7.1)', () => {
    expect(bossDefeatedSince(true, 'summary')).toBe(true)
    expect(bossDefeatedSince(true, 'victory')).toBe(true)
    expect(bossDefeatedSince(true, 'gameover')).toBe(false) // timeout with the boss alive
    expect(bossDefeatedSince(true, 'playing')).toBe(false)
    expect(bossDefeatedSince(false, 'summary')).toBe(false) // an ordinary stage clear
    let o = observeRun(createRunStats(), st())
    const bossDefeated = bossDefeatedSince(true, 'summary')
    o = observeRun(o.stats, st({ phase: 'summary', ...(bossDefeated ? { bossDefeated } : {}) }))
    expect(o.moment).toEqual({ kind: 'boss', rank: 100 })
    o = observeRun(o.stats, st({ phase: 'gameover' }))
    expect(o.moment?.kind).toBe('end') // later moments are still offered, the boss one is not repeated
  })

  it('orders boss > combo tiers > end', () => {
    expect(momentRank('boss')).toBeGreaterThan(momentRank('combo', 4))
    expect(momentRank('combo', 4)).toBeGreaterThan(momentRank('combo', 2))
    expect(momentRank('combo', 2)).toBeGreaterThan(momentRank('end'))
  })
})

describe('observeRun: per-stage best combo (review fix)', () => {
  it('counts a combo tier gained and lost inside one tick', () => {
    const o = observeRun(createRunStats(), st({ combo: 1, bestCombo: 3 }))
    expect(o.stats.bestCombo).toBe(3)
    expect(o.moment).toEqual({ kind: 'combo', rank: momentRank('combo', 3) })
  })
})
