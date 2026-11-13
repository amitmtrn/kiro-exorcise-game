import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => ({ updates: 0, created: 0 }))
vi.mock('./motionButton', () => ({
  MotionButton: class {
    cx: number; cy: number; radius: number
    constructor(cx: number, cy: number, radius: number) { this.cx = cx; this.cy = cy; this.radius = radius; h.created++ }
    update() { h.updates++; return 'triggered' as const }
    render() {}
  },
}))

import { renderStartScreen, START_INPUT_DELAY_MS } from './screens'
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
    renderStartScreen(ctx, st, 10_000, onStart)
    for (let t = 10_016; t < 10_000 + START_INPUT_DELAY_MS; t += 16) renderStartScreen(ctx, st, t, onStart)
    expect(onStart).not.toHaveBeenCalled()
    renderStartScreen(ctx, st, 10_000 + START_INPUT_DELAY_MS + 20, onStart)
    expect(onStart).toHaveBeenCalledWith(1)
  })

  it('restarts the lock-out after leaving the screen for a while', () => {
    const onStart = vi.fn()
    const ctx = ctxOf(1280)
    const st = createInitialState(1)
    renderStartScreen(ctx, st, 50_000, onStart)
    renderStartScreen(ctx, st, 53_000, onStart) // gap > 250 ms = a new visit
    expect(onStart).not.toHaveBeenCalled()
  })
})
