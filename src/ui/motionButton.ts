/**
 * Motion button — a circular canvas button triggered by sustained hand motion.
 * Uses lastMotionPixels from collision.ts to detect motion inside the circle.
 */

import { lastMotionPixels } from '../game/collision'

const FILL_DURATION_MS = 800 // time to hold motion before triggering

export class MotionButton {
  cx: number
  cy: number
  radius: number
  label: string
  private fillStartTime = 0
  private filling = false

  constructor(cx: number, cy: number, radius: number, label: string) {
    this.cx = cx
    this.cy = cy
    this.radius = radius
    this.label = label
  }

  /** Call each frame. Returns 'triggered' when fully filled. */
  update(now: number): 'idle' | 'filling' | 'triggered' {
    const motionInside = lastMotionPixels.some((mp) => {
      const dx = mp.x - this.cx
      const dy = mp.y - this.cy
      return Math.sqrt(dx * dx + dy * dy) < this.radius
    })

    if (motionInside) {
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
