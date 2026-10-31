/**
 * Frame differencing — detects motion inside a hitbox by comparing luminance
 * values between the current and previous webcam frame.
 */

import type { Hitbox } from '../game/state'

/** Luminance delta required for a pixel to count as "moved". */
export const DIFF_THRESHOLD = 30

/** Fraction of sampled hitbox pixels that must exceed DIFF_THRESHOLD for a hit. */
export const HIT_RATIO = 0.15

/** Sample every Nth pixel to keep the diff fast enough for 60 fps. */
export const SAMPLE_STRIDE = 4

/**
 * Draws the current video frame onto an off-screen canvas context.
 * Call this once per game tick before reading pixel data.
 */
export function captureFrame(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  video: HTMLVideoElement,
): void {
  ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height)
}

/**
 * Pure function: compares luminance across the hitbox region in two ImageData
 * objects and returns true if enough pixels show significant motion.
 *
 * @param currentData - Full-canvas ImageData for the current frame
 * @param prevData    - Full-canvas ImageData for the previous frame
 * @param hitbox      - Axis-aligned bounding box to check (canvas coords)
 * @param canvasWidth - Width of the canvas (used to index into ImageData)
 */
export function computeFrameDiff(
  currentData: ImageData,
  prevData: ImageData,
  hitbox: Hitbox,
  canvasWidth: number,
): boolean {
  const { x, y, w, h } = hitbox
  let movedPixels = 0
  let totalSampled = 0

  for (let row = 0; row < h; row += SAMPLE_STRIDE) {
    for (let col = 0; col < w; col += SAMPLE_STRIDE) {
      const px = Math.round(x + col)
      const py = Math.round(y + row)
      const idx = (py * canvasWidth + px) * 4 // RGBA

      const rC = currentData.data[idx]
      const gC = currentData.data[idx + 1]
      const bC = currentData.data[idx + 2]
      const rP = prevData.data[idx]
      const gP = prevData.data[idx + 1]
      const bP = prevData.data[idx + 2]

      // BT.601 luminance approximation (integer-friendly)
      const lumCurrent = (rC * 77 + gC * 150 + bC * 29) >> 8
      const lumPrev = (rP * 77 + gP * 150 + bP * 29) >> 8

      const diff = Math.abs(lumCurrent - lumPrev)
      if (diff > DIFF_THRESHOLD) movedPixels++
      totalSampled++
    }
  }

  if (totalSampled === 0) return false
  return movedPixels / totalSampled >= HIT_RATIO
}
