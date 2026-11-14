/**
 * A set of persistent motion buttons keyed by layout id (motion-ui-ergonomics). `sync`
 * creates / repositions the buttons for a list of layout specs, so geometry always comes
 * from `layout.ts` and a partial fill survives a redraw.
 */

import { MotionButton, DWELL_MS, DESTRUCTIVE_DWELL_MS } from './motionButton'
import type { PointSource } from './motionButton'
import type { ButtonSpec } from './layout'

export class ButtonSet {
  private map = new Map<string, MotionButton>()

  constructor(private source: PointSource | null = null) {}

  /** Buttons for `specs`, in the same order (resolution priority). Others are forgotten. */
  sync(specs: readonly ButtonSpec[]): MotionButton[] {
    const keep = new Set(specs.map((s) => s.id))
    for (const id of [...this.map.keys()]) if (!keep.has(id)) this.map.delete(id)
    return specs.map((s) => {
      let b = this.map.get(s.id)
      const dwell = s.destructive ? DESTRUCTIVE_DWELL_MS : DWELL_MS
      if (!b || b.dwellMs !== dwell) {
        b = new MotionButton(s.cx, s.cy, s.r, s.label, this.source, dwell)
        this.map.set(s.id, b)
      }
      b.cx = s.cx; b.cy = s.cy; b.radius = s.r; b.label = s.label
      return b
    })
  }

  get(id: string): MotionButton | undefined { return this.map.get(id) }

  /** Forgets partial fills and latches of every button. */
  reset(): void { for (const b of this.map.values()) b.reset() }

  /** Drops the buttons (fresh instances on the next `sync`). */
  clear(): void { this.map.clear() }
}
