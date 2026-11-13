/**
 * Two-player split screen — half geometry and mirror mapping (pure).
 *
 * The motion frame is captured mirrored (see `captureFrame`), exactly like the
 * display, so motion-canvas x and display x have the same orientation: the left
 * of the screen is the left of the motion frame. Seat 0 (player 1) owns the left
 * half of the mirrored view, seat 1 (player 2) the right half. Spec: two-player R1.
 */

import { mirrorX, MOTION_W, MOTION_H } from '../webcam/diff'
import type { Pt } from './swipe'

export type Seat = 0 | 1
export const SEATS: readonly Seat[] = [0, 1]

/** Width of one half of a canvas `w` wide. */
export function halfWidth(w: number): number {
  return w / 2
}

/** Left edge of a seat's half in the full canvas. */
export function halfOffset(seat: Seat, w: number): number {
  return seat * halfWidth(w)
}

/** Which seat owns display x (already in mirrored screen orientation). The divider belongs to the right half. */
export function seatOfX(x: number, w: number): Seat {
  return x < halfWidth(w) ? 0 : 1
}

/**
 * Which seat owns the RAW (un-mirrored) camera column `col` of a sensor image
 * `rawW` wide. The display mirrors the camera, so raw columns in the right half
 * of the sensor image end up on the left of the screen and belong to player 1.
 */
export function seatOfRawColumn(col: number, rawW: number): Seat {
  return seatOfX(mirrorX(col + 0.5, rawW), rawW)
}

/** Width, in motion-canvas pixels, of one half of the motion frame. */
export function motionHalfWidth(w: number = MOTION_W): number {
  return halfWidth(w)
}

/**
 * Copies the columns of `seat`'s half out of a full motion frame into a new
 * half-width frame. A seat's hit detection only ever reads this copy, so it
 * cannot see motion that happened in the other half.
 */
export function cropMotionHalf(
  src: ImageData,
  seat: Seat,
  w: number = MOTION_W,
  h: number = MOTION_H,
): ImageData {
  const hw = motionHalfWidth(w)
  const out = new Uint8ClampedArray(hw * h * 4)
  const from = seat * hw
  const data = src.data
  for (let y = 0; y < h; y++) {
    const s = (y * w + from) * 4
    if (s + hw * 4 > data.length) break // malformed / short buffer: leave the rest black
    out.set(data.subarray(s, s + hw * 4), y * hw * 4)
  }
  return { data: out, width: hw, height: h, colorSpace: 'srgb' } as unknown as ImageData
}

/**
 * Motion points of a full-frame mask that fall in `seat`'s half, with x made
 * relative to that half (0 … motionW/2).
 */
export function toHalfPoints(points: Pt[], seat: Seat, motionW: number = MOTION_W): Pt[] {
  const hw = motionHalfWidth(motionW)
  const from = seat * hw
  const out: Pt[] = []
  for (const p of points) {
    if (p.x >= from && p.x < from + hw) out.push({ x: p.x - from, y: p.y })
  }
  return out
}

/** Higher score wins; equal scores tie (two-player R5.1). */
export function pickWinner(a: number, b: number): Seat | 'tie' {
  if (a === b) return 'tie'
  return a > b ? 0 : 1
}
