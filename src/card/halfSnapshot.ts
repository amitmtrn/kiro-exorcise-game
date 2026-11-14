/**
 * Per-half webcam snapshot for the two-player Exorcist Card (two-player-card R2.3, R2.4).
 *
 * The in-game view draws the video mirrored over the whole canvas. A half snapshot
 * uses the same mirrored draw, shifted and scaled so that only the player's half
 * lands on a canvas that is one half wide; the other half falls outside the canvas
 * and is never stored. Memory only.
 */

import { halfOffset, halfWidth } from '../game/halves'
import type { Seat } from '../game/halves'
import { scaleToFit } from './layout'
import { SNAPSHOT_MAX_H, SNAPSHOT_MAX_W } from './snapshot'

export { releaseSnapshot } from './snapshot'

export interface HalfSnapshotGeometry {
  /** Snapshot canvas size in pixels (≤ 640 × 480, the half's aspect ratio). */
  w: number
  h: number
  /** Uniform scale from display pixels to snapshot pixels. */
  scale: number
  /** Left edge of the half in display pixels. */
  offsetX: number
  /** Width of the half in display pixels. */
  halfW: number
}

/** Size and transform of `seat`'s snapshot for a display `displayW` × `displayH` (pure). */
export function halfSnapshotGeometry(seat: Seat, displayW: number, displayH: number): HalfSnapshotGeometry {
  const halfW = Math.max(1, halfWidth(displayW))
  const { w, h } = scaleToFit(halfW, displayH, SNAPSHOT_MAX_W, SNAPSHOT_MAX_H)
  return { w, h, scale: w / halfW, offsetX: halfOffset(seat, displayW), halfW }
}

/**
 * Display x (mirrored view) of a point at fraction `u` (0 = left, 1 = right) of the RAW
 * camera image, as the live view draws it.
 */
export function rawFractionToDisplayX(u: number, displayW: number): number {
  return displayW - u * displayW
}

/** Snapshot x of display x for `seat`; outside [0, w] means "not in this half". */
export function displayXToSnapshotX(x: number, g: HalfSnapshotGeometry): number {
  return (x - g.offsetX) * g.scale
}

/** Grabs `seat`'s half of the mirrored camera view; the other half is never drawn into the result. */
export function grabHalfSnapshot(
  video: HTMLVideoElement,
  seat: Seat,
  displayW: number,
  displayH: number,
  create: () => HTMLCanvasElement = () => document.createElement('canvas'),
): HTMLCanvasElement {
  const g = halfSnapshotGeometry(seat, displayW, displayH)
  const canvas = create()
  canvas.width = g.w
  canvas.height = g.h
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.save()
    ctx.scale(g.scale, g.scale) // display px → snapshot px
    ctx.translate(-g.offsetX, 0) // the half starts at x = 0
    ctx.translate(displayW, 0) // same mirrored draw as drawWebcamFrame
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, displayW, displayH)
    ctx.restore()
  }
  return canvas
}
