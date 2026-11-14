/**
 * Screen zones in one place (playtest2-fixes R2, R3): where the player's body is and where the HUD sits.
 * Skulls (a heart is lost when one is touched) are placed with these, so idle body motion or a resting
 * hand can never hit one. Pure; `W` / `H` are the area being played (a two-player seat passes its half).
 */

import { hudFontSize } from '../ui/muteRect'

export interface Rect { x: number; y: number; w: number; h: number }

/** The body column is the centre ± this share of the area width (full height). */
export const BODY_HALF = 0.18

/**
 * Where threatening line / arc / landing-drop enemies end (playtest2-fixes R1.4): the player's own space in the
 * middle of the area, as fractions of W / H. It lies inside the body column, so it is far from every skull.
 */
export const PLAYER_END = { x0: 0.38, x1: 0.62, y0: 0.35, y1: 0.65 } as const

/** The player's body: a central column of the area, full height. */
export function bodyZone(W: number, H: number): Rect {
  return { x: (0.5 - BODY_HALF) * W, y: 0, w: 2 * BODY_HALF * W, h: H }
}

/**
 * The four HUD corners: hearts (top-left), timer + mute (top-right), score (bottom-left), combo (bottom-right).
 * Each is `max(0.3 W, 9 fontSize)` wide and `3.2 fontSize` tall, which covers the text at any supported text size.
 */
export function hudRects(W: number, H: number, fontSize: number = hudFontSize(W)): Rect[] {
  const w = Math.min(W / 2, Math.max(0.3 * W, 9 * fontSize))
  const h = 3.2 * fontSize
  return [
    { x: 0, y: 0, w, h },
    { x: W - w, y: 0, w, h },
    { x: 0, y: H - h, w, h },
    { x: W - w, y: H - h, w, h },
  ]
}

/** True when the two rects overlap (touching edges do not count). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}
