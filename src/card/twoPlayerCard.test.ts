import { describe, it, expect } from 'vitest'
import { badgeFor, cardFileName, seatLabel } from './twoPlayerCard'
import { winnerOf, createTwoPlayer } from '../game/twoPlayer'
import { buildCardTexts, layoutCard } from './layout'
import { CARD_FILENAME } from './download'

describe('two-player card helpers (two-player-card R3)', () => {
  it('gives the winner WINNER and the loser nothing', () => {
    expect(badgeFor(0, 0)).toBe('WINNER')
    expect(badgeFor(0, 1)).toBeUndefined()
    expect(badgeFor(1, 1)).toBe('WINNER')
    expect(badgeFor(1, 0)).toBeUndefined()
  })

  it('gives both players TIE on a tie', () => {
    expect(badgeFor('tie', 0)).toBe('TIE')
    expect(badgeFor('tie', 1)).toBe('TIE')
  })

  it('follows the end-screen winner (higher score; equal scores tie)', () => {
    const t = createTwoPlayer()
    const withScores = (a: number, b: number) => ({ ...t, seats: [{ ...t.seats[0], score: a }, { ...t.seats[1], score: b }] as typeof t.seats })
    expect(badgeFor(winnerOf(withScores(900, 100)), 0)).toBe('WINNER')
    expect(badgeFor(winnerOf(withScores(900, 100)), 1)).toBeUndefined()
    expect(badgeFor(winnerOf(withScores(50, 50)), 0)).toBe('TIE')
    expect(badgeFor(winnerOf(withScores(50, 50)), 1)).toBe('TIE')
  })

  it('names the files per player and keeps the 1P file name', () => {
    expect(cardFileName(0)).toBe('exorcist-card-p1.png')
    expect(cardFileName(1)).toBe('exorcist-card-p2.png')
    expect(CARD_FILENAME).toBe('exorcist-card.png')
  })

  it('labels the seats P1 / P2', () => {
    expect(seatLabel(0)).toBe('P1')
    expect(seatLabel(1)).toBe('P2')
  })
})

describe('layout with label and badge', () => {
  const base = { score: 10, bestCombo: 2, stage: 1, stageCount: 5, banished: 3, rank: 'Apprentice Exorcist' }
  it('1P layout is unchanged: no label, no badge boxes', () => {
    const L = layoutCard(600, 840, buildCardTexts(base))
    expect(L.playerLabel).toBeUndefined()
    expect(L.badge).toBeUndefined()
    expect('playerLabel' in L).toBe(false)
  })
  it('puts the label and the badge on the photo window', () => {
    const L = layoutCard(600, 840, buildCardTexts({ ...base, playerLabel: 'P2', badge: 'WINNER' }))
    expect(L.playerLabel!.text).toBe('P2')
    expect(L.badge!.text).toBe('WINNER')
    expect(L.playerLabel!.x).toBeGreaterThanOrEqual(L.photo.x)
    expect(L.badge!.x).toBeLessThanOrEqual(L.photo.x + L.photo.w)
    expect(L.playerLabel!.y).toBeGreaterThan(L.photo.y)
    expect(L.playerLabel!.y).toBeLessThan(L.photo.y + L.photo.h)
  })
})
