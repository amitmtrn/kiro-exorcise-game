/**
 * Colour palettes (playtest-polish R8). `DEFAULT` is the steering palette exactly as the game
 * has always drawn it. `OKABE_ITO` is the colourblind-safe variant, chosen by brute force over
 * the Okabe-Ito colours (plus ghost white) so every enemy pair keeps a CIEDE2000 distance of at
 * least 12 for normal vision, protanopia, deuteranopia and tritanopia (see palette.property.test.ts).
 *
 * Colour is never the only signal: the renderers add shapes (skull "!" marker and dashed ring,
 * P1 ● / P2 ■ marks, hollow hearts, dashed button rings) when the colourblind palette is on.
 */

import { getSettings } from '../settings/runtime'

export interface Palette {
  ghost: string
  bat: string
  batEye: string
  skull: string
  skullEye: string
  lunger: string
  pumpkin: string
  /** New ghosts (more-content). Never red or the skull's orange. */
  wisp: string
  mirror: string
  blink: string
  boss: string
  bossWindup: string
  bossEnraged: string
  /** The Hollow King's crown and idle aura (more-content R6.5). */
  bossCrown: string
  candy: readonly [string, string, string, string]
  life: string
  score: string
  combo: string
  /** Danger cues: skull glow, penalty flash. */
  danger: string
  p1: string
  p2: string
  ringIdle: string
  ringFill: string
  ringDanger: string
  background: string
}

export const DEFAULT: Palette = {
  ghost: '#e8e8f0', bat: '#2a0845', batEye: '#ffd166', skull: '#ff6b1a', skullEye: '#c0392b',
  lunger: '#9b59b6', pumpkin: '#ff6b1a', wisp: '#7fe0d0', mirror: '#a8c0ff', blink: '#f0e6a0', boss: '#e8e8f0', bossWindup: '#ff6b1a', bossEnraged: '#c0392b', bossCrown: '#ffd166',
  candy: ['#ff6b1a', '#ffd166', '#39ff14', '#9b59b6'],
  life: '#c0392b', score: '#ffd166', combo: '#39ff14', danger: '#c0392b',
  p1: '#e8e8f0', p2: '#e8e8f0',
  ringIdle: '#ff6b1a', ringFill: '#39ff14', ringDanger: '#c0392b',
  background: '#0d0014',
}

/** Okabe and Ito (2008) colours, by name. */
export const OKABE = {
  orange: '#E69F00', skyBlue: '#56B4E9', green: '#009E73', yellow: '#F0E442',
  blue: '#0072B2', vermillion: '#D55E00', purple: '#CC79A7',
} as const

export const OKABE_ITO: Palette = {
  ghost: '#E8E8F0', bat: OKABE.blue, batEye: OKABE.yellow, skull: OKABE.vermillion, skullEye: '#0d0014',
  lunger: OKABE.skyBlue, pumpkin: OKABE.yellow, wisp: '#999988', mirror: '#bbeebb', blink: '#ccaa66', boss: '#E8E8F0', bossWindup: OKABE.orange, bossEnraged: OKABE.vermillion, bossCrown: OKABE.purple,
  candy: [OKABE.orange, OKABE.skyBlue, OKABE.purple, OKABE.yellow],
  life: OKABE.vermillion, score: OKABE.yellow, combo: OKABE.skyBlue, danger: OKABE.vermillion,
  p1: OKABE.skyBlue, p2: OKABE.orange,
  ringIdle: OKABE.orange, ringFill: OKABE.skyBlue, ringDanger: OKABE.vermillion,
  background: '#0d0014',
}

/** The palette selected by the colourblind setting. */
export function getPalette(): Palette {
  return getSettings().cb ? OKABE_ITO : DEFAULT
}
