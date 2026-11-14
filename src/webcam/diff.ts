/**
 * Frame differencing — detects motion inside a hitbox by comparing luminance
 * values between the current and previous webcam frame.
 *
 * The motion canvas is fixed at MOTION_W × MOTION_H for performance.
 * Hitbox coordinates from display space must be scaled with scaleHitbox()
 * before passing to computeFrameDiff.
 */

import type { Hitbox } from '../game/state'
import { getMotionGrid } from './grid'

/** Full size of the off-screen motion canvas (the default grid; see grid.ts for the adaptive sizes). */
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
 * Mirror a horizontal coordinate inside a canvas `width` pixels wide.
 * Pure reference for the `translate(width, 0); scale(-1, 1)` canvas transform
 * used by drawWebcamFrame / captureFrame. Applying it twice is the identity.
 */
export function mirrorX(x: number, width: number): number {
  return width - x
}

/** Mirror an axis-aligned hitbox left↔right inside a canvas `width` wide. */
export function mirrorHitbox(hitbox: Hitbox, width: number): Hitbox {
  return { x: width - hitbox.x - hitbox.w, y: hitbox.y, w: hitbox.w, h: hitbox.h }
}

/**
 * Scale a hitbox from display canvas coordinates into motion canvas coordinates.
 * `motionW` is the motion frame width the hitbox is sampled in (two-player: one
 * 160 px half instead of the full 320 px frame).
 */
export function scaleHitbox(
  hitbox: Hitbox,
  displayW: number,
  displayH: number,
  motionW: number = getMotionGrid().w,
): Hitbox {
  const sx = motionW / displayW
  const sy = getMotionGrid().h / displayH
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
  const stride = getMotionGrid().stride

  for (let row = 0; row < h; row += stride) {
    for (let col = 0; col < w; col += stride) {
      const px = Math.round(x + col)
      const py = Math.round(y + row)
      // Hitboxes may overhang the frame (enemies enter from off-screen). Skip
      // out-of-frame samples instead of letting the index wrap onto the
      // neighbouring row (pbt BUG-2).
      // Off-frame samples count as "not moved" in the denominator so a hitbox
      // that is almost entirely off-screen cannot be decided by a few edge pixels.
      if (px < 0 || px >= canvasWidth || py < 0) { totalSampled++; continue }
      const idx = (py * canvasWidth + px) * 4 // RGBA

      if (idx + 2 >= currentData.data.length) { totalSampled++; continue }

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

// ─── Whole-frame motion mask ──────────────────────────────────────────────────

export interface MotionMask {
  /** Sampled pixels (motion-canvas coords) whose luminance moved > DIFF_THRESHOLD. */
  points: Array<{ x: number; y: number }>
  /** Number of pixels sampled (every `stride`-th pixel in both axes). */
  sampled: number
  /** Number of sampled pixels that moved. */
  moved: number
  /**
   * False when the two frames are byte-identical in luminance at every sampled
   * pixel. A live camera always carries sensor noise, so an exact match means the
   * camera has not delivered a new frame since the previous tick (most webcams
   * run at 30 fps or less while requestAnimationFrame runs at 60).
   */
  changed: boolean
}

/**
 * Pure: samples the whole motion canvas on a `stride` grid and returns every
 * sampled pixel that moved, plus whether the frame differs from the previous
 * one at all. Cost at 320×180 / stride 4 is 3 600 samples — negligible.
 */
export function computeMotionMask(
  currentData: ImageData,
  prevData: ImageData,
  canvasWidth: number,
  canvasHeight: number,
  stride: number = getMotionGrid().stride,
): MotionMask {
  const points: Array<{ x: number; y: number }> = []
  let sampled = 0
  let moved = 0
  let changed = false
  const cur = currentData.data
  const prv = prevData.data

  for (let y = 0; y < canvasHeight; y += stride) {
    for (let x = 0; x < canvasWidth; x += stride) {
      const idx = (y * canvasWidth + x) * 4
      if (idx + 2 >= cur.length || idx + 2 >= prv.length) continue
      const lumC = (cur[idx] * 77 + cur[idx + 1] * 150 + cur[idx + 2] * 29) >> 8
      const lumP = (prv[idx] * 77 + prv[idx + 1] * 150 + prv[idx + 2] * 29) >> 8
      const diff = Math.abs(lumC - lumP)
      sampled++
      if (diff !== 0) changed = true
      if (diff > DIFF_THRESHOLD) { moved++; points.push({ x, y }) }
    }
  }

  return { points, sampled, moved, changed }
}
