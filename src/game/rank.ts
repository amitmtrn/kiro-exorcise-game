/**
 * Playful rank titles for the Exorcist Card (exorcist-card R3.2).
 * Pure: a title is a function of the score only.
 */

export interface Rank {
  /** Lowest score that earns this title. */
  minScore: number
  title: string
}

/** Ascending by `minScore`; the first entry always matches. */
export const RANKS: readonly Rank[] = [
  { minScore: 0, title: 'Apprentice Exorcist' },
  { minScore: 1_000, title: 'Spirit Sweeper' },
  { minScore: 3_000, title: 'Haunt Hunter' },
  { minScore: 6_000, title: 'Ghostbane Knight' },
  { minScore: 10_000, title: 'Master Exorcist' },
  { minScore: 20_000, title: 'Grand Exorcist' },
]

/** Index into `RANKS` for a score; negative / non-finite scores give the lowest rank. */
export function rankIndexForScore(score: number): number {
  if (!Number.isFinite(score)) return score === Infinity ? RANKS.length - 1 : 0
  let idx = 0
  for (let i = 0; i < RANKS.length; i++) if (score >= RANKS[i].minScore) idx = i
  return idx
}

export function rankForScore(score: number): string {
  return RANKS[rankIndexForScore(score)].title
}
