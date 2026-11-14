import { describe, it, expect } from 'vitest'
import { RANKS, rankForScore, rankIndexForScore } from './rank'

describe('rankForScore', () => {
  it('starts as Apprentice Exorcist and ends as Grand Exorcist', () => {
    expect(rankForScore(0)).toBe('Apprentice Exorcist')
    expect(rankForScore(1_000_000)).toBe('Grand Exorcist')
  })

  it('switches exactly at each threshold', () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(rankForScore(RANKS[i].minScore - 1)).toBe(RANKS[i - 1].title)
      expect(rankForScore(RANKS[i].minScore)).toBe(RANKS[i].title)
    }
  })

  it('gives the lowest rank for negative, NaN and -Infinity, the top for +Infinity', () => {
    expect(rankIndexForScore(-50)).toBe(0)
    expect(rankIndexForScore(NaN)).toBe(0)
    expect(rankIndexForScore(-Infinity)).toBe(0)
    expect(rankIndexForScore(Infinity)).toBe(RANKS.length - 1)
  })

  it('has ascending thresholds starting at 0 and unique titles', () => {
    expect(RANKS[0].minScore).toBe(0)
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].minScore).toBeGreaterThan(RANKS[i - 1].minScore)
    expect(new Set(RANKS.map((r) => r.title)).size).toBe(RANKS.length)
  })
})
