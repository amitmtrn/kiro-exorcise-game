import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => ({ updates: 0, created: 0, btns: [] as Array<{ cx: number; radius: number }> }))
vi.mock('./motionButton', () => ({
  MotionButton: class {
    cx: number; cy: number; radius: number
    constructor(cx: number, cy: number, radius: number) { this.cx = cx; this.cy = cy; this.radius = radius; h.created++; h.btns.push(this) }
    update() { h.updates++; return 'triggered' as const }
    render() {}
  },
}))

import { renderStartScreen, resetStartScreen, START_INPUT_DELAY_MS } from './screens'
import { createInitialState } from '../game/state'

function ctxOf(w: number) {
  return new Proxy({ canvas: { width: w, height: 720 } } as Record<string, unknown>, {
    get(t, k: string) { return k in t ? t[k] : () => ({ width: 10 }) },
    set(t, k: string, v) { t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
}

describe('start screen lock-out (two-player R7.1 review fix)', () => {
  it('ignores motion buttons until START_INPUT_DELAY_MS after (re)entering', () => {
    const onStart = vi.fn()
    const ctx = ctxOf(1280)
    const st = createInitialState(1)
    resetStartScreen()
    renderStartScreen(ctx, st, 10_000, onStart)
    for (let t = 10_016; t < 10_000 + START_INPUT_DELAY_MS; t += 16) renderStartScreen(ctx, st, t, onStart)
    expect(onStart).not.toHaveBeenCalled()
    renderStartScreen(ctx, st, 10_000 + START_INPUT_DELAY_MS + 20, onStart)
    expect(onStart).toHaveBeenCalledWith(1)
  })

  it('restarts the lock-out on an explicit resetStartScreen(), not on a render gap', () => {
    const onStart = vi.fn()
    const ctx = ctxOf(1280)
    const st = createInitialState(1)
    resetStartScreen()
    renderStartScreen(ctx, st, 50_000, onStart)
    renderStartScreen(ctx, st, 50_000 + START_INPUT_DELAY_MS + 20, onStart) // after a long hitch: still the same visit
    expect(onStart).toHaveBeenCalledTimes(1)
    onStart.mockClear()
    resetStartScreen()
    renderStartScreen(ctx, st, 60_000, onStart)
    renderStartScreen(ctx, st, 60_100, onStart)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('never overlaps the two buttons or leaves the canvas on narrow widths', () => {
    for (const w of [200, 260, 330, 480, 1280]) {
      resetStartScreen(); h.btns.length = 0
      renderStartScreen(ctxOf(w), createInitialState(1), 1000, () => {})
      const [a, b] = h.btns
      expect(b.cx - a.cx).toBeGreaterThanOrEqual(a.radius * 2)
      expect(a.cx - a.radius).toBeGreaterThanOrEqual(0)
      expect(b.cx + b.radius).toBeLessThanOrEqual(w)
    }
  })
})
