import { describe, it, expect, vi } from 'vitest'
import { renderStartScreen, resetStartScreen, START_INPUT_DELAY_MS } from './screens'
import { createInitialState } from '../game/state'
import { buttonLayout } from './layout'
import { blobPoints, publish } from '../test/motionFixtures'
import { DWELL_MS, ENTRY_LOCK_MS } from './motionButton'

const W = 1280, H = 720

function ctxOf(w = W, h = H) {
  return new Proxy({ canvas: { width: w, height: h } } as Record<string, unknown>, {
    get(t, k: string) { return k in t ? t[k] : () => ({ width: 10 }) },
    set(t, k: string, v) { t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
}
const [one, two] = buttonLayout('start', W, H)

/** Renders frames of 33 ms from t0 to t1 with a hand on `b` (or no hand). */
function frames(onStart: (m: 1 | 2) => void, t0: number, t1: number, b: { cx: number; cy: number; r: number } | null) {
  const ctx = ctxOf(), st = createInitialState(1)
  const pts = b ? blobPoints(W, H, b.cx, b.cy, b.r) : []
  let t = t0
  for (; t < t1; t += 33) { publish(W, H, pts); renderStartScreen(ctx, st, t, onStart) }
  return t
}

describe('start screen lock-out and latch (motion-ui-ergonomics R2.5)', () => {
  it('ignores a continuous wave during the lockout AND after it (the hand must leave first)', () => {
    const onStart = vi.fn()
    resetStartScreen()
    frames(onStart, 10_000, 10_000 + START_INPUT_DELAY_MS + 4000, one)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('fires after the hand left and came back for a full dwell', () => {
    const onStart = vi.fn()
    resetStartScreen()
    let t = frames(onStart, 10_000, 10_000 + START_INPUT_DELAY_MS + 300, one)
    t = frames(onStart, t, t + 400, null)
    t = frames(onStart, t, t + DWELL_MS - 150, one)
    expect(onStart).not.toHaveBeenCalled()
    frames(onStart, t, t + 400, one)
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStart).toHaveBeenCalledWith(1)
  })

  it('2 PLAYERS starts a two-player game; one wave starts only one mode', () => {
    const onStart = vi.fn()
    resetStartScreen()
    let t = frames(onStart, 20_000, 20_000 + ENTRY_LOCK_MS + 100, null)
    t = frames(onStart, t, t + 3000, two)
    expect(onStart.mock.calls).toEqual([[2]])
  })

  it('restarts the lock-out on an explicit resetStartScreen(), not on a render gap', () => {
    const onStart = vi.fn()
    resetStartScreen()
    let t = frames(onStart, 50_000, 50_000 + ENTRY_LOCK_MS + 20, null)
    t = frames(onStart, t + 5000, t + 5000 + 2000, one) // a long hitch is still the same visit
    expect(onStart).toHaveBeenCalledTimes(1)
    onStart.mockClear()
    resetStartScreen()
    frames(onStart, 80_000, 80_000 + 700, one)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('draws both buttons at the raised-hand zones and never in the lower half', () => {
    expect(one.cy).toBeLessThanOrEqual(0.4 * H)
    expect(two.cy).toBeLessThanOrEqual(0.4 * H)
    expect(one.cx).toBeLessThan(W / 2)
    expect(two.cx).toBeGreaterThan(W / 2)
  })
})

describe('start hint readability (motion-ui-ergonomics R7.2)', () => {
  it('is two short lines drawn at >= 12 px even on a 640 px canvas', () => {
    resetStartScreen()
    const fonts: string[] = [], texts: string[] = []
    const store: Record<string, unknown> = { canvas: { width: 640, height: 480 } }
    const ctx = new Proxy(store, {
      get: (t, k: string) => k === 'fillText' ? (s: string) => texts.push(`${s}|${t.font}`) : (k in t ? t[k] : () => ({ width: 10 })),
      set: (t, k: string, v) => { t[k] = v; return true },
    }) as unknown as CanvasRenderingContext2D
    renderStartScreen(ctx, createInitialState(1), 10_000, () => {})
    const hint = texts.filter((t) => t.startsWith('Raise a hand') || t.startsWith('or press'))
    expect(hint).toHaveLength(2)
    for (const h of hint) { fonts.push(h.split('|')[1]); expect(parseInt(h.split('|')[1])).toBeGreaterThanOrEqual(12) }
    expect(fonts.length).toBe(2)
  })
})
