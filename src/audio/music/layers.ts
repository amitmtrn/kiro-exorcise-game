/** Intensity layers: which voices are audible at each combo tier. */

import type { TrackDef } from './patterns'

export type Layer = 'bass' | 'hat' | 'kick' | 'snare' | 'lead' | 'arp'

export const LAYERS: readonly Layer[] = ['bass', 'hat', 'kick', 'snare', 'lead', 'arp']

/** Lowest combo tier at which each layer is audible. */
export const LAYER_MIN_TIER: Readonly<Record<Layer, number>> = {
  bass: 1, hat: 1, kick: 2, snare: 2, lead: 3, arp: 4,
}

/** Combo → tier 1..4. Non-finite → 1; fractions truncate. */
export function tierForCombo(combo: number): number {
  if (!Number.isFinite(combo)) return 1
  return Math.min(4, Math.max(1, Math.trunc(combo)))
}

/** Tier actually played: title is fixed, boss has a floor. */
export function effectiveTier(def: Pick<TrackDef, 'fixedTier' | 'minTier'>, combo: number): number {
  if (def.fixedTier !== undefined) return def.fixedTier
  return Math.max(def.minTier ?? 1, tierForCombo(combo))
}

export function layersForTier(tier: number): Record<Layer, boolean> {
  const t = tierForCombo(tier)
  const out = {} as Record<Layer, boolean>
  for (const l of LAYERS) out[l] = t >= LAYER_MIN_TIER[l]
  return out
}
