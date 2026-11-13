/**
 * Framing check — advisory "is the player standing where frame differencing
 * can see them?" test on a small RGBA frame. Pure; the UI feeds it a downscaled
 * webcam frame a few times per second (onboarding R2).
 */

export type FramingStatus = 'ok' | 'too-dark' | 'too-close' | 'low-detail'

export interface FramingFrame {
  data: ArrayLike<number>
  width: number
  height: number
}

/** Mean luminance (0–255) below this is too dark for frame differencing. */
export const FRAMING_MIN_LUMA = 40
/** Share of the central box that is skin-toned at or above which the player is too close. */
export const FRAMING_CLOSE_SKIN = 0.6
/** Luminance step to a neighbouring pixel that counts as "detail". */
export const FRAMING_EDGE_DELTA = 24
/** Minimum share of pixels with detail. */
export const FRAMING_MIN_DETAIL = 0.04
/** Accumulated `ok` time before "Looking good!" shows. */
export const FRAMING_STABLE_MS = 1000
/** The UI samples the camera at most this often (deltaMs accumulated, not per frame). */
export const FRAMING_INTERVAL_MS = 250

export const FRAMING_HINTS: Record<FramingStatus, string> = {
  ok: 'Looking good!',
  'too-dark': 'Too dark — turn on a light so the camera can see you.',
  'too-close': 'Too close — step back until your head and hands fit.',
  'low-detail': 'The picture is too plain — step back and add some light.',
}

function luma(r: number, g: number, b: number): number {
  return (r * 77 + g * 150 + b * 29) >> 8
}

function isSkin(r: number, g: number, b: number): boolean {
  return r > 95 && g > 40 && b > 20 && r > g && r > b && r - Math.min(g, b) > 15
}

export function checkFraming(frame: FramingFrame): FramingStatus {
  const { data, width: w, height: h } = frame
  if (w <= 0 || h <= 0 || data.length < w * h * 4) return 'too-dark'

  const lum = new Uint8Array(w * h)
  let sum = 0
  for (let i = 0; i < w * h; i++) {
    const l = luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
    lum[i] = l
    sum += l
  }
  if (sum / (w * h) < FRAMING_MIN_LUMA) return 'too-dark'

  // Central 50% × 50% box
  const x0 = Math.floor(w * 0.25), x1 = Math.ceil(w * 0.75)
  const y0 = Math.floor(h * 0.25), y1 = Math.ceil(h * 0.75)
  let skin = 0, boxN = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4
      boxN++
      if (isSkin(data[i], data[i + 1], data[i + 2])) skin++
    }
  }
  if (boxN > 0 && skin / boxN >= FRAMING_CLOSE_SKIN) return 'too-close'

  let detail = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = lum[y * w + x]
      const dx = x + 1 < w ? Math.abs(l - lum[y * w + x + 1]) : 0
      const dy = y + 1 < h ? Math.abs(l - lum[(y + 1) * w + x]) : 0
      if (dx >= FRAMING_EDGE_DELTA || dy >= FRAMING_EDGE_DELTA) detail++
    }
  }
  if (detail / (w * h) < FRAMING_MIN_DETAIL) return 'low-detail'
  return 'ok'
}

/** Accumulates how long the framing has been continuously `ok` (deltaMs-based). */
export function tickFraming(okMs: number, status: FramingStatus, deltaMs: number): number {
  return status === 'ok' ? okMs + Math.max(0, deltaMs) : 0
}

export function isFramingStable(okMs: number): boolean {
  return okMs >= FRAMING_STABLE_MS
}
