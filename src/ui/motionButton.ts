/**
 * Motion button — a circular canvas button triggered by sustained hand motion.
 * Uses lastMotionPixels from collision.ts (the whole-frame motion mask in
 * display space, published every tick) to detect motion inside the circle.
 */

import { lastMotionPixels } from '../game/collision'

export const FILL_DURATION_MS = 800 // time to hold motion before triggering
/** Sampled motion pixels that must fall inside the circle; filters sensor noise. */
export const MIN_MOTION_PIXELS = 3
/**
 * A waving hand reverses direction a few times a second and is momentarily
 * still at each turn, so frame differencing sees a frame or two of no motion.
 * Keep filling through gaps shorter than this instead of resetting.
 */
export const IDLE_GRACE_MS = 150

export class MotionButton {
  cx: number
  cy: number
  radius: number
  label: string
  private fillStartTime = 0
  private filling = false
  private lastMotionAt = Number.NEGATIVE_INFINITY

  constructor(cx: number, cy: number, radius: number, label: string) {
    this.cx = cx
    this.cy = cy
    this.radius = radius
    this.label = label
  }

  /** Call each frame. Returns 'triggered' when fully filled. */
  update(now: number): 'idle' | 'filling' | 'triggered' {
    let inside = 0
    const r2 = this.radius * this.radius
    for (const mp of lastMotionPixels) {
      const dx = mp.x - this.cx
      const dy = mp.y - this.cy
      if (dx * dx + dy * dy < r2 && ++inside >= MIN_MOTION_PIXELS) break
    }
    const motionInside = inside >= MIN_MOTION_PIXELS
    if (motionInside) this.lastMotionAt = now
    const active = motionInside || (this.filling && now - this.lastMotionAt <= IDLE_GRACE_MS)

    if (active) {
      if (!this.filling) {
        this.filling = true
        this.fillStartTime = now
      }
      const elapsed = now - this.fillStartTime
      if (elapsed >= FILL_DURATION_MS) {
        this.filling = false
        return 'triggered'
      }
      return 'filling'
    } else {
      this.filling = false
      return 'idle'
    }
  }

  fillProgress(now: number): number {
    if (!this.filling) return 0
    return Math.min(1, (now - this.fillStartTime) / FILL_DURATION_MS)
  }

  render(ctx: CanvasRenderingContext2D, now: number): void {
    const progress = this.fillProgress(now)

    ctx.save()

    // Background circle
    ctx.beginPath()
    ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(42, 8, 69, 0.75)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 107, 26, 0.6)'
    ctx.lineWidth = 3
    ctx.stroke()

    // Fill arc
    if (progress > 0) {
      ctx.beginPath()
      ctx.moveTo(this.cx, this.cy)
      ctx.arc(this.cx, this.cy, this.radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255, 107, 26, 0.45)'
      ctx.fill()
    }

    // Label
    ctx.fillStyle = '#ffd166'
    ctx.font = `bold ${Math.round(this.radius * 0.28)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = '#ffd166'
    ctx.shadowBlur = 8
    ctx.fillText(this.label, this.cx, this.cy)

    ctx.restore()
  }
}
