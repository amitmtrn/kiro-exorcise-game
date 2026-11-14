/**
 * Pure helpers for the per-player Exorcist Card (two-player-card R3).
 */

import type { Seat } from '../game/halves'

export type Winner = Seat | 'tie'

/** "P1" / "P2". */
export function seatLabel(seat: Seat): string {
  return `P${seat + 1}`
}

/** Badge on a one-player card after the finale is cleared (more-content R5.6). */
export const FINALE_BADGE = 'FINALE CLEARED'

/** Winner's card says WINNER, both cards say TIE on a tie, the loser's has no badge. */
export function badgeFor(winner: Winner, seat: Seat): string | undefined {
  if (winner === 'tie') return 'TIE'
  return winner === seat ? 'WINNER' : undefined
}

/** `exorcist-card-p1.png` / `exorcist-card-p2.png`. */
export function cardFileName(seat: Seat): string {
  return `exorcist-card-p${seat + 1}.png`
}
