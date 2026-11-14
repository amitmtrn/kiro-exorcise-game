/**
 * Bigger text (playtest-polish R9): the scale helper and the pure HUD layout the tests check at
 * 640 × 480 and 1280 × 720 for every text scale.
 */

import { getSettings } from '../settings/runtime'
import { hudFontSize, muteButtonRect } from './muteRect'
import type { Rect } from './layout'

/** Smallest sizes drawn at any scale (R9.2). */
export const MIN_HUD_PX = 16
export const MIN_MENU_PX = 12
export const MIN_CALLOUT_PX = 24

/** `px` times the text scale setting, rounded. */
export function scaled(px: number, scale: number = getSettings().textScale): number {
  return Math.round(px * scale)
}

/** Average glyph width in em, used to estimate text boxes (same 0.6 as `fitFontPx`). */
export const GLYPH_EM = 0.6
/** Hearts glyphs are wider than average text. */
export const HEART_EM = 0.9

export interface HudInputs {
  /** `Stage 1 — The Graveyard` */
  label: string
  /** Characters of the score text, `Score: 12345` = 12. */
  scoreChars?: number
  /** Combo multiplier text is shown. */
  combo?: boolean
}

export interface HudLayout {
  fontPx: number
  /** null: no room for the stage label at the minimum size (only possible with bigger text). */
  labelPx: number | null
  boxes: { hearts: Rect; timer: Rect; label: Rect | null; score: Rect; combo: Rect | null; mute: Rect }
}

const PAD = 20
const GAP = 16
/** The score text and the combo pulse up to 1.5× on a combo increment (hud.ts). */
const PULSE_MAX = 1.5

/**
 * Largest pulse scale that keeps the score (bottom-left) and the combo (bottom-right) apart. 1.5 at text
 * scale 1 (today's pulse, unchanged); with bigger text the pulse is reduced where the two would collide.
 */
export function pulseLimit(W: number, fontPx: number, scoreChars: number, scale: number): number {
  if (scale <= 1) return PULSE_MAX
  const need = scoreChars * GLYPH_EM * fontPx + 2 * GLYPH_EM * Math.round(fontPx * 1.2)
  const avail = W - 2 * PAD - GAP
  return Math.max(1, Math.min(PULSE_MAX, avail / need))
}

/**
 * HUD text boxes for a canvas. At scale 1 the stage label keeps today's size (0.6 × the HUD font);
 * with bigger text it shrinks (never below MIN_HUD_PX) to stay between the hearts and the timer,
 * and is dropped when even that does not fit.
 */
export function hudLayout(W: number, H: number, scale: number, inp: HudInputs): HudLayout {
  const fs = hudFontSize(W, scale)
  const lineH = fs
  const hearts: Rect = { x: PAD, y: PAD, w: 3 * HEART_EM * fs, h: lineH }
  const timerW = 5 * GLYPH_EM * fs
  const timer: Rect = { x: W - PAD - timerW, y: PAD, w: timerW, h: lineH }
  const n = Math.max(1, [...inp.label].length)
  const base = Math.round(fs * 0.6)
  let labelPx: number | null = base
  if (scale > 1) {
    const half = Math.min(W / 2 - (hearts.x + hearts.w + GAP), timer.x - GAP - W / 2)
    const fit = Math.floor((2 * Math.max(0, half)) / (n * GLYPH_EM))
    labelPx = Math.min(base, fit)
    if (labelPx < MIN_HUD_PX) labelPx = null
  }
  const label: Rect | null = labelPx === null ? null : { x: W / 2 - (n * GLYPH_EM * labelPx) / 2, y: PAD, w: n * GLYPH_EM * labelPx, h: labelPx }
  const chars = inp.scoreChars ?? 12
  const PULSE = pulseLimit(W, fs, chars, scale)
  const scoreW = chars * GLYPH_EM * fs * PULSE
  const score: Rect = { x: PAD, y: H - PAD - lineH * PULSE, w: scoreW, h: lineH * PULSE }
  const comboPx = Math.round(fs * 1.2)
  const comboW = 2 * GLYPH_EM * comboPx * PULSE
  const combo: Rect | null = inp.combo === false ? null : { x: W - PAD - comboW, y: H - PAD - comboPx * PULSE, w: comboW, h: comboPx * PULSE }
  return { fontPx: fs, labelPx, boxes: { hearts, timer, label, score, combo, mute: muteButtonRect(W, fs) } }
}

/**
 * Combo call-out font size (juice R4): `1.1 × clamp(W / 16, 28, 64)` as before at scale 1. With bigger text it
 * grows by the scale but shrinks until the centred text stays inside the canvas (never below MIN_CALLOUT_PX).
 */
export function calloutPx(W: number, centreX: number, chars: number, scale: number = getSettings().textScale): number {
  const size = Math.max(28, Math.min(64, W / 16))
  const base = Math.round(size * 1.1)
  if (scale <= 1) return base
  const room = Math.floor((2 * Math.max(0, Math.min(centreX, W - centreX))) / (Math.max(1, chars) * GLYPH_EM))
  return Math.max(MIN_CALLOUT_PX, Math.min(Math.round(size * scale * 1.1), room))
}
