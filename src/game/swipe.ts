/**
 * Swipe direction estimation (juice R1).
 *
 * The diff of two consecutive camera frames is centred on the midpoint of the
 * hand's motion between them, so the centroid of the *next* diff lies further
 * along the swipe. `cur − prev` of the per-frame centroids inside a hitbox is
 * therefore the direction of travel. Coordinates are in display orientation
 * (the motion canvas is captured mirrored), so +x is screen-right.
 */

import type { Hitbox } from './state'
import { DIFF_THRESHOLD, SAMPLE_STRIDE } from '../webcam/diff'

export interface Pt { x: number; y: number }

export interface Swipe {
  /** Unit vector (display space, +x right, +y down). */
  dx: number
  dy: number
  /** Centroid shift in display px (0 for the fallbacks). */
  mag: number
  source: 'shift' | 'radial' | 'default'
}

/** Minimum centroid shift for a directional swipe, as a fraction of canvas height. */
export const SWIPE_MIN_SHIFT = 0.01

/**
 * Moved pixels inside `hitbox` (motion-canvas coords). Same sampling, luminance
 * and off-frame rules as computeFrameDiff, but returns the points. Malformed
 * ImageData yields [].
 */
export function motionPointsIn(
  currentData: ImageData,
  prevData: ImageData,
  hitbox: Hitbox,
  canvasWidth: number,
): Pt[] {
  const cur = currentData?.data
  const prv = prevData?.data
  if (!cur || !prv) return []
  const points: Pt[] = []
  for (let row = 0; row < hitbox.h; row += SAMPLE_STRIDE) {
    for (let col = 0; col < hitbox.w; col += SAMPLE_STRIDE) {
      const px = Math.round(hitbox.x + col)
      const py = Math.round(hitbox.y + row)
      if (px < 0 || px >= canvasWidth || py < 0) continue
      const idx = (py * canvasWidth + px) * 4
      if (idx + 2 >= cur.length || idx + 2 >= prv.length) continue
      const lumC = (cur[idx] * 77 + cur[idx + 1] * 150 + cur[idx + 2] * 29) >> 8
      const lumP = (prv[idx] * 77 + prv[idx + 1] * 150 + prv[idx + 2] * 29) >> 8
      if (Math.abs(lumC - lumP) > DIFF_THRESHOLD) points.push({ x: px, y: py })
    }
  }
  return points
}

export function centroid(points: Pt[]): Pt | null {
  if (points.length === 0) return null
  let sx = 0, sy = 0
  for (const p of points) { sx += p.x; sy += p.y }
  return { x: sx / points.length, y: sy / points.length }
}

/** Mirror a mask left↔right inside a canvas `width` wide (same transform as captureFrame). */
export function mirrorPoints(points: Pt[], width: number): Pt[] {
  return points.map((p) => ({ x: width - p.x, y: p.y }))
}

function unit(x: number, y: number): { dx: number; dy: number } | null {
  const len = Math.hypot(x, y)
  return len > 1e-9 && Number.isFinite(len) ? { dx: x / len, dy: y / len } : null
}

/**
 * Swipe vector from the centroids of the two gate frames.
 * shift → radial (cur centroid to enemy centre) → straight up.
 */
export function estimateSwipe(prev: Pt | null, cur: Pt | null, enemy: Pt, canvasH: number): Swipe {
  if (prev && cur) {
    const sx = cur.x - prev.x
    const sy = cur.y - prev.y
    const mag = Math.hypot(sx, sy)
    if (mag >= SWIPE_MIN_SHIFT * canvasH) {
      const u = unit(sx, sy)
      if (u) return { ...u, mag, source: 'shift' }
    }
  }
  if (cur) {
    const u = unit(enemy.x - cur.x, enemy.y - cur.y)
    if (u) return { ...u, mag: 0, source: 'radial' }
  }
  return { dx: 0, dy: -1, mag: 0, source: 'default' }
}
