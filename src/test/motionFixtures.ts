/** Test helpers: publish synthetic motion masks the way the loop does (mask space 320 × 180). */
import { updateMotionPixels } from '../game/collision'
import { MOTION_W, MOTION_H } from '../webcam/diff'

export type Pt = { x: number; y: number }

/** Mask-space grid points (stride 4) covering ~80 % of a display-space circle on a W × H canvas. */
export function blobPoints(W: number, H: number, cx: number, cy: number, r: number): Pt[] {
  const sx = MOTION_W / W, sy = MOTION_H / H
  const out: Pt[] = []
  for (let gy = 0; gy < MOTION_H; gy += 4) for (let gx = 0; gx < MOTION_W; gx += 4) {
    const dx = (gx - cx * sx) / sx, dy = (gy - cy * sy) / sy
    if (dx * dx + dy * dy <= r * r * 0.8) out.push({ x: gx, y: gy })
  }
  return out
}

/** Publishes one new camera frame with `points` (mask space) for a W × H canvas. */
export function publish(W: number, H: number, points: Pt[], changed = true): void {
  updateMotionPixels({ points, sampled: 3600, moved: points.length, changed }, W, H)
}
