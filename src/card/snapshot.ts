/**
 * Webcam snapshot for the Exorcist Card (exorcist-card R2.5). The image is
 * drawn with the same mirrored draw as the live view and lives only in an
 * off-screen canvas (memory), never in storage.
 */

import { drawWebcamFrame } from '../webcam/capture'
import { scaleToFit } from './layout'

export const SNAPSHOT_MAX_W = 640
export const SNAPSHOT_MAX_H = 480

/** Grabs a mirrored snapshot sized like the display, scaled down to fit 640 × 480. */
export function grabMirroredSnapshot(
  video: HTMLVideoElement,
  displayW: number,
  displayH: number,
  create: () => HTMLCanvasElement = () => document.createElement('canvas'),
): HTMLCanvasElement {
  const { w, h } = scaleToFit(displayW, displayH, SNAPSHOT_MAX_W, SNAPSHOT_MAX_H)
  const canvas = create()
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) drawWebcamFrame(ctx, video)
  return canvas
}

/** Frees the pixel memory of a discarded snapshot. */
export function releaseSnapshot(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}
