/**
 * Motion-button layout (motion-ui-ergonomics R1, R3.2, R4, R5, R6). One pure module
 * returns the button rects of every screen for a canvas size, so rendering, hit
 * testing, onboarding and the tests all read the same numbers.
 *
 * Buttons sit in two edge columns at raised-hand height (rows at 19 % and ~28 % of the
 * height), never on the player's body centreline and never below 40 %. Display
 * coordinates: the camera view is mirrored, so a button on the player's right is
 * reached with the right hand (no x flip anywhere).
 */

import { halfOffset, halfWidth } from '../game/halves'
import type { Seat } from '../game/halves'
import { hudFontSize, muteButtonRect, muteButtonRect2P } from './muteRect'

export type ScreenId =
  | 'start' | 'summary' | 'gameover' | 'victory' | 'preview'
  | 'summary2p' | 'final2p' | 'preview2p'

export const SCREENS_1P: readonly ScreenId[] = ['start', 'summary', 'gameover', 'victory', 'preview']
export const SCREENS_2P: readonly ScreenId[] = ['summary2p', 'final2p', 'preview2p']

export interface Rect { x: number; y: number; w: number; h: number }

export interface ButtonSpec {
  id: string
  label: string
  cx: number
  cy: number
  r: number
  /** SAVE / MAIN MENU: longer dwell, alone in its column. */
  destructive: boolean
  /** Owning half in 2P, null in 1P. */
  seat: Seat | null
}

export interface LayoutOpts { hasPhoto?: boolean; noPhoto?: boolean }

// ─── Constants ───────────────────────────────────────────────────────────────

/** Every button centre is at or above this fraction of the height (R1.1). */
export const MAX_CENTRE_Y = 0.4
/** First row (prefer 15–35 %). */
export const ROW_A = 0.19
/** Row B centre distance in radii (gap = 1.1 r ≥ one radius, R1.5). */
export const ROW_STEP_R = 3.1
export const COL_OUTER = 0.12
export const COL_INNER_P1 = 0.8
export const COL_INNER_P2 = 0.2
/** 1P columns sit 0.20 W either side of the player (reach model below), not at the screen edge. */
export const COL_LEFT_1P = 0.3
export const COL_RIGHT_1P = 0.7
export const RADIUS_H = 0.065
export const RADIUS_W_FULL = 0.06
export const RADIUS_W_HALF = 0.105
/** Distance from the circle edge to the outer edge of the progress ring stroke (ring r + 6, line width 6). */
export const RING_OUTSET = 9
export const RADIUS_MIN = 20
export const RADIUS_MAX = 80
/** Body centreline exclusion: |x − c| ≥ this × area width (R1.2). */
export const CENTRE_BAND = 0.18
/** 2P shared text (banners, scores) starts below this fraction of H, under the button rows (R4.5). */
export const TEXT_TOP_2P = 0.47
/** Menu-screen text stays inside the central band of this width fraction. */
export const TEXT_BAND_1P: readonly [number, number] = [0.38, 0.62]
/** Below this fraction of H (under the button rows) menu text may use the wider band. */
export const TEXT_LOW_TOP = 0.47
export const TEXT_BAND_LOW: readonly [number, number] = [0.2, 0.8]
export const CARD_ASPECT = 600 / 840

// ─── Reach model (R9) ────────────────────────────────────────────────────────

/** Typical webcam horizontal field of view range, degrees. */
export const FOV_DEG: readonly [number, number] = [65, 75]
/** Player distance from the camera, metres. */
export const NEAR_M = 1.5
export const FAR_M = 2.5
/** Shoulder half-width and arm length, metres. */
export const SHOULDER_HALF_M = 0.2
export const ARM_M = 0.65
/** Player centre as a fraction of the frame width: 1P, and 2P P1 / P2. */
export const PLAYER_CENTRE_1P = 0.5
export const PLAYER_CENTRE_2P: readonly [number, number] = [0.25, 0.75]

/** Frame width in metres at `distM` for a horizontal FOV of `fovDeg`. */
export function frameWidthM(distM: number, fovDeg: number): number {
  return 2 * distM * Math.tan((fovDeg * Math.PI) / 360)
}

/**
 * How far from the player's centre a hand can reach sideways, as a fraction of the frame width:
 * (shoulder half-width + arm length) / frame width. The guaranteed value is the narrowest over
 * the FOV range, i.e. the widest frame (FOV 75°).
 */
export function reachFraction(distM: number, fovDeg: number): number {
  return (SHOULDER_HALF_M + ARM_M) / frameWidthM(distM, fovDeg)
}

/** Guaranteed reach at `distM` over the FOV range. */
export function guaranteedReach(distM: number): number {
  return Math.min(...FOV_DEG.map((f) => reachFraction(distM, f)))
}

/** ≈ 0.369 of the frame width (1.5 m, FOV 75°). */
export const REACH_NEAR = guaranteedReach(NEAR_M)
/** ≈ 0.221 of the frame width (2.5 m, FOV 75°): every button centre must be within this (hardest case). */
export const REACH_FAR = guaranteedReach(FAR_M)

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Radius for an area `aw` wide and `H` high (scales with the canvas, clamped). */
export function buttonRadius(aw: number, H: number, half: boolean): number {
  // the progress ring (radius + RING_OUTSET) must stay on the canvas at the outer column too (R5.1)
  const r = Math.min(RADIUS_H * H, (half ? RADIUS_W_HALF : RADIUS_W_FULL) * aw, COL_OUTER * aw - RING_OUTSET - 1)
  return Math.floor(Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, r)))
}

/** The mute button rect that applies to an area (1P: top-right; 2P: top centre of the full canvas). */
export function muteRectFor(aw: number, half: boolean, W: number = aw * 2): Rect {
  // `W` is the full canvas width: on odd widths 2·floor(W/2) is one pixel off the drawn button
  return half
    ? muteButtonRect2P(W, hudFontSize(W))
    : muteButtonRect(aw, hudFontSize(aw))
}

/** Shrinks `px` so `text` (≈ 0.6 em per glyph) fits in `maxW`. */
export function fitFontPx(text: string, px: number, maxW: number, minPx = 8): number {
  const n = Math.max(1, [...text].length)
  return Math.max(minPx, Math.min(px, maxW / (n * 0.6)))
}

interface Slot { col: number; y: number }

function slots(aw: number, H: number, seat: Seat | null, r: number): { A: Slot; B: Slot; S: Slot } {
  const half = seat !== null
  const stackedCol = seat === null ? COL_LEFT_1P : seat === 0 ? COL_OUTER : 1 - COL_OUTER
  const singleCol = seat === null ? COL_RIGHT_1P : seat === 0 ? COL_INNER_P1 : COL_INNER_P2
  const mute = muteRectFor(aw, half)
  const yA = ROW_A * H
  const yS = Math.max(yA, mute.y + mute.h + r + 8)
  return {
    A: { col: stackedCol * aw, y: yA },
    B: { col: stackedCol * aw, y: yA + ROW_STEP_R * r },
    S: { col: singleCol * aw, y: yS },
  }
}

/**
 * Buttons of one area in area-local coordinates. `seat` null = whole canvas (1P);
 * 0 / 1 = that half of a 2P canvas (`aw` = half width).
 * Order = resolution priority: safe actions first, destructive last (R2.7).
 */
export function areaButtons(
  screen: ScreenId, aw: number, H: number, seat: Seat | null, opts: LayoutOpts = {},
): ButtonSpec[] {
  const r = buttonRadius(aw, H, seat !== null)
  const s = slots(aw, H, seat, r)
  const mk = (id: string, label: string, slot: Slot, destructive = false): ButtonSpec =>
    ({ id, label, cx: slot.col, cy: slot.y, r, destructive, seat })
  switch (screen) {
    case 'start':
      return [mk('one', '1 PLAYER', s.A), mk('two', '2 PLAYERS', s.S)]
    case 'summary':
    case 'summary2p':
      return [mk('next', '▶ NEXT', s.A)]
    case 'gameover':
      return [mk('offer', '📸 EXORCIST\nCARD', s.B), mk('retry', '↩ RETRY', s.A), mk('menu', '⌂ MENU', s.S, true)]
    case 'victory':
      return [mk('offer', '📸 EXORCIST\nCARD', s.B), mk('again', 'PLAY AGAIN', s.A), mk('menu', 'MAIN MENU', s.S, true)]
    case 'final2p':
      return [mk('offer', '📸 EXORCIST\nCARD', s.B), mk('again', 'PLAY AGAIN', s.A), mk('menu', 'MAIN MENU', s.S, true)]
    case 'preview':
    case 'preview2p': {
      const out: ButtonSpec[] = []
      if (opts.hasPhoto !== false) out.push(mk('toggle', opts.noPhoto ? '📷\nPHOTO' : '👻 NO\nPHOTO', s.A))
      out.push(mk('close', '✖\nCLOSE', s.B))
      out.push(mk('save', '💾\nSAVE', s.S, true))
      return out
    }
  }
}

/** Buttons of a screen in full-canvas coordinates (2P screens list both halves, P1 first). */
export function buttonLayout(screen: ScreenId, W: number, H: number, opts: LayoutOpts = {}): ButtonSpec[] {
  if (!SCREENS_2P.includes(screen)) return areaButtons(screen, W, H, null, opts)
  const hw = halfWidth(W)
  const out: ButtonSpec[] = []
  for (const seat of [0, 1] as const) {
    for (const b of areaButtons(screen, hw, H, seat, opts)) out.push({ ...b, cx: b.cx + halfOffset(seat, W) })
  }
  return out
}

/** Card image rect of the preview in area-local coordinates: between the two columns. */
export function previewCardRect(aw: number, H: number, seat: Seat | null): Rect {
  const r = buttonRadius(aw, H, seat !== null)
  const s = slots(aw, H, seat, r)
  const x0 = Math.min(s.A.col, s.S.col) + r + 6
  const x1 = Math.max(s.A.col, s.S.col) - r - 6
  const span = Math.max(1, x1 - x0)
  const ch = Math.min(0.8 * H, span / CARD_ASPECT)
  const cw = ch * CARD_ASPECT
  return { x: x0 + (span - cw) / 2, y: 0.03 * H, w: cw, h: ch }
}

/** x range reserved for centred text of an area (everything outside it is button columns). */
export function textBand(aw: number, seat: Seat | null): { x0: number; x1: number } {
  if (seat === null) return { x0: TEXT_BAND_1P[0] * aw, x1: TEXT_BAND_1P[1] * aw }
  return { x0: 0.25 * aw, x1: 0.75 * aw }
}

/** Rects the buttons must stay clear of: text blocks, banners and the card image (R1.5). */
export function textRects(screen: ScreenId, W: number, H: number): Rect[] {
  if (screen === 'preview') return [previewCardRect(W, H, null)]
  if (screen === 'preview2p') {
    const hw = halfWidth(W)
    return ([0, 1] as const).map((seat) => {
      const c = previewCardRect(hw, H, seat)
      return { ...c, x: c.x + halfOffset(seat, W) }
    })
  }
  if (SCREENS_2P.includes(screen)) return [{ x: 0, y: TEXT_TOP_2P * H, w: W, h: H - TEXT_TOP_2P * H }]
  const b = textBand(W, null)
  return [
    { x: b.x0, y: 0, w: b.x1 - b.x0, h: TEXT_LOW_TOP * H },
    { x: TEXT_BAND_LOW[0] * W, y: TEXT_LOW_TOP * H, w: (TEXT_BAND_LOW[1] - TEXT_BAND_LOW[0]) * W, h: H - TEXT_LOW_TOP * H },
  ]
}

/** Mute button rect that is on screen for `screen` (full-canvas coordinates). */
export function muteRectOf(screen: ScreenId, W: number): Rect {
  return SCREENS_2P.includes(screen) ? muteRectFor(halfWidth(W), true, W) : muteRectFor(W, false)
}

/** Placement of the sound-unlock hint pill: top centre, ≤ 56 % wide (main.ts applies it as inline style). */
export const SOUND_HINT = { topFrac: 0.015, maxWidthFrac: 0.56 } as const

/** Font size in px of the hint pill for a viewport `W` px wide (main.ts applies it inline). */
export function soundHintFontPx(W: number): number {
  return Math.max(14, Math.min(22, 0.02 * W))
}

/** The sound-unlock hint pill rect for a canvas (mirrors the `.sound-hint` element). */
export function soundHintRect(W: number, H: number): Rect {
  const font = soundHintFontPx(W)
  const w = Math.min(SOUND_HINT.maxWidthFrac * W, 24 * font)
  const h = font * 2.2
  return { x: W / 2 - w / 2, y: SOUND_HINT.topFrac * H, w, h }
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function circleRect(b: { cx: number; cy: number; r: number }): Rect {
  return { x: b.cx - b.r, y: b.cy - b.r, w: 2 * b.r, h: 2 * b.r }
}
