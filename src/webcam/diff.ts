/**
 * Frame differencing — detects motion inside a hitbox by comparing luminance
 * values between the current and previous webcam frame.
 *
 * The motion canvas is fixed at MOTION_W × MOTION_H for performance.
 * Hitbox coordinates from display space must be scaled with scaleHitbox()
 * before passing to computeFrameDiff.
 */

import type { Hitbox } from '../game/state'

/** Fixed size of the off-screen motion canvas. */
export const MOTION_W = 320
export const MOTION_H = 180

/** Luminance delta required for a pixel to count as "moved". */
export let DIFF_THRESHOLD = 30

/** Fraction of sampled hitbox pixels that must exceed DIFF_THRESHOLD for a hit. */
export const HIT_RATIO = 0.15

/** Sample every Nth pixel to keep the diff fast enough for 60 fps. */
export const SAMPLE_STRIDE = 4

/**
 * Draws the current video frame onto an off-screen canvas context,
 * **mirrored horizontally** — matching the display transform in drawWebcamFrame
 * so that hitbox coordinates in screen space correspond correctly to the
 * motion canvas pixel positions.
 */
export function captureFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
): void {
  const { width, height } = ctx.canvas
  ctx.save()
  ctx.translate(width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, width, height)
  ctx.restore()
}

/**
 * Scale a hitbox from display canvas coordinates into motion canvas coordinates.
 */
export function scaleHitbox(
  hitbox: Hitbox,
  displayW: number,
  displayH: number,
): Hitbox {
  const sx = MOTION_W / displayW
  const sy = MOTION_H / displayH
  return {
    x: hitbox.x * sx,
    y: hitbox.y * sy,
    w: hitbox.w * sx,
    h: hitbox.h * sy,
  }
}

/**
 * Pure function: compares luminance across the hitbox region in two ImageData
 * objects and returns true if enough pixels show significant motion.
 *
 * @param currentData - Full-canvas ImageData for the current frame
 * @param prevData    - Full-canvas ImageData for the previous frame
 * @param hitbox      - Axis-aligned bounding box to check (motion canvas coords)
 * @param canvasWidth - Width of the motion canvas (use MOTION_W = 320)
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

      if (idx + 2 >= currentData.data.length) continue

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

/**
 * Measures background noise for `durationMs` ms by comparing successive frame
 * pairs, then sets DIFF_THRESHOLD to clamp(meanDiff * 2.5, 15, 60).
 *
 * Call this once before starting the game loop. Returns the chosen threshold.
 * The canvas/video must already be live (video playing, canvas sized).
 */
export async function calibrateDiffThreshold(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  durationMs = 1000,
): Promise<number> {
  const w = ctx.canvas.width
  const h = ctx.canvas.height

  const prevCanvas = document.createElement('canvas')
  prevCanvas.width = w
  prevCanvas.height = h
  const prevCtx = prevCanvas.getContext('2d')!

  // Prime the previous frame
  captureFrame(prevCtx as unknown as CanvasRenderingContext2D, video)

  const startTime = performance.now()
  let totalDiff = 0
  let totalPixels = 0
  let frames = 0

  await new Promise<void>((resolve) => {
    function sample() {
      captureFrame(ctx, video)
      const cur = ctx.getImageData(0, 0, w, h)
      const prv = prevCtx.getImageData(0, 0, w, h)

      for (let i = 0; i < cur.data.length; i += 4 * SAMPLE_STRIDE) {
        const lumC = (cur.data[i] * 77 + cur.data[i + 1] * 150 + cur.data[i + 2] * 29) >> 8
        const lumP = (prv.data[i] * 77 + prv.data[i + 1] * 150 + prv.data[i + 2] * 29) >> 8
        totalDiff += Math.abs(lumC - lumP)
        totalPixels++
      }
      frames++

      prevCtx.drawImage(ctx.canvas, 0, 0)

      if (performance.now() - startTime < durationMs) {
        requestAnimationFrame(sample)
      } else {
        resolve()
      }
    }
    requestAnimationFrame(sample)
  })

  const meanDiff = totalPixels > 0 ? totalDiff / totalPixels : 10
  const threshold = Math.max(15, Math.min(60, Math.round(meanDiff * 2.5)))
  DIFF_THRESHOLD = threshold
  return threshold
}
