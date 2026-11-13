/**
 * Easing and screen-transition poses (juice R4.3, R5). Pure functions of
 * elapsed milliseconds, so every animation is frame-rate independent.
 */

/** 0 → 0, 1 → 1, overshoots in between (back-out easing). */
export function easeOutBack(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// ─── Stage intro (juice R5.1) ─────────────────────────────────────────────────

/** Slide-in time of the stage name, subtitle delay and slide time, and fade-out length. */
export const INTRO_NAME_MS = 450
export const INTRO_SUB_DELAY_MS = 150
export const INTRO_SUB_MS = 450
export const INTRO_FADE_MS = 300

export interface IntroPose {
  /** Horizontal offset of the stage name in canvas widths (negative = left of rest). */
  nameX: number
  /** Horizontal offset of the subtitle in canvas widths (positive = right of rest). */
  subX: number
  /** Opacity of the whole card (1 until the last INTRO_FADE_MS). */
  alpha: number
}

/** Title card: name slides in from the left, subtitle from the right, all fades out at the end. */
export function introPose(elapsedMs: number, totalMs: number): IntroPose {
  const nameT = clamp01(elapsedMs / INTRO_NAME_MS)
  const subT = clamp01((elapsedMs - INTRO_SUB_DELAY_MS) / INTRO_SUB_MS)
  const left = totalMs - elapsedMs
  return {
    nameX: -(1 - easeOutBack(nameT)),
    subX: 1 - easeOutBack(subT),
    alpha: left >= INTRO_FADE_MS ? 1 : clamp01(left / INTRO_FADE_MS),
  }
}

// ─── Stage outro (juice R5.2) ─────────────────────────────────────────────────

export const OUTRO_OVERLAY_MS = 500
export const OUTRO_OVERLAY_ALPHA = 0.88
export const OUTRO_BANNER_MS = 600
export const OUTRO_ROWS_START_MS = 600
export const OUTRO_ROW_STAGGER_MS = 120
export const OUTRO_ROW_FADE_MS = 250
/** Banner resting height as a fraction of the canvas height (matches the old layout). */
export const OUTRO_BANNER_REST_Y = 0.18

export interface OutroPose {
  overlayAlpha: number
  bannerScale: number
  /** Radians; a decaying wobble. */
  bannerAngle: number
  /** Banner baseline as a fraction of canvas height. */
  bannerY: number
}

/** STAGE CLEAR: overlay fades in, banner drops in with a wobble that settles. */
export function outroPose(summaryMs: number): OutroPose {
  const ms = Math.max(0, summaryMs)
  const drop = easeOutBack(ms / OUTRO_BANNER_MS)
  return {
    overlayAlpha: OUTRO_OVERLAY_ALPHA * clamp01(ms / OUTRO_OVERLAY_MS),
    bannerScale: drop,
    bannerAngle: 0.12 * Math.exp(-ms / 250) * Math.cos(ms / 60),
    bannerY: OUTRO_BANNER_REST_Y - 0.2 * (1 - drop),
  }
}

/** Opacity of summary row `index` (0 = stars, 1… = stat rows): staggered fade-in after the banner. */
export function outroRowAlpha(summaryMs: number, index: number): number {
  return clamp01((summaryMs - OUTRO_ROWS_START_MS - OUTRO_ROW_STAGGER_MS * index) / OUTRO_ROW_FADE_MS)
}
