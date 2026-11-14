import { describe, it, expect, vi } from 'vitest'
import { renderSummary, renderGameOver, renderVictory, resetGameOverScreen, resetVictoryScreen } from './screens'
import { createInitialState } from '../game/state'
import { buttonLayout } from './layout'
import { blobPoints, publish } from '../test/motionFixtures'
import { DWELL_MS, DESTRUCTIVE_DWELL_MS, ENTRY_LOCK_MS } from './motionButton'

const W = 1280, H = 720

function ctxOf() {
  return new Proxy({ canvas: { width: W, height: H } } as Record<string, unknown>, {
    get(t, k: string) { return k in t ? t[k] : () => ({ width: 10 }) },
    set(t, k: string, v) { t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
}
type Circle = { cx: number; cy: number; r: number }
const spec = (screen: Parameters<typeof buttonLayout>[0], id: string): Circle => buttonLayout(screen, W, H).find((b) => b.id === id)!

/** Renders `fn` every 33 ms in [t0, t1) with a hand on `b` (null = no motion); returns the end time. */
function drive(fn: (now: number) => void, t0: number, t1: number, b: Circle | null): number {
  const pts = b ? blobPoints(W, H, b.cx, b.cy, b.r) : []
  let t = t0
  for (; t < t1; t += 33) { publish(W, H, pts); fn(t) }
  return t
}

describe('1P stage summary NEXT', () => {
  const next = spec('summary', 'next')
  it('ignores motion during the entry lockout and needs a release after it', () => {
    const cb = vi.fn()
    const r = (shown: number) => (now: number) => renderSummary(ctxOf(), { ...createInitialState(1), summaryShownMs: shown }, now, cb)
    drive(r(100), 10_000, 13_000, next) // hand on NEXT, but the summary has only been showing 100 ms
    expect(cb).not.toHaveBeenCalled()
    drive(r(ENTRY_LOCK_MS + 1), 13_000, 18_000, next) // lockout over, the hand never left: held by the latch
    expect(cb).not.toHaveBeenCalled()
  })

  it('fires once after a full dwell by a hand that arrives after the lockout', () => {
    const cb = vi.fn()
    const f = (now: number) => renderSummary(ctxOf(), { ...createInitialState(1), summaryShownMs: 3000 }, now, cb)
    let t = drive(f, 100_000, 100_500, null)
    t = drive(f, t, t + DWELL_MS - 200, next)
    expect(cb).not.toHaveBeenCalled()
    t = drive(f, t, t + 600, next)
    expect(cb).toHaveBeenCalledTimes(1)
    drive(f, t, t + 3000, next)
    expect(cb).toHaveBeenCalledTimes(1) // one wave = one action
  })
})

describe('1P game over', () => {
  const retry = spec('gameover', 'retry'), menu = spec('gameover', 'menu'), offer = spec('gameover', 'offer')
  function setup() {
    const cbs = { retry: vi.fn(), menu: vi.fn(), card: vi.fn() }
    resetGameOverScreen()
    const f = (now: number) => renderGameOver(ctxOf(), createInitialState(1), now, cbs.retry, cbs.menu, cbs.card)
    return { cbs, f }
  }

  it('has an entry lockout with a release latch: a flail that continues through it presses nothing', () => {
    const { cbs, f } = setup()
    drive(f, 200_000, 200_000 + ENTRY_LOCK_MS + 5000, retry)
    expect(cbs.retry).not.toHaveBeenCalled()
  })

  it('RETRY fires after the dwell; MENU needs the longer destructive dwell', () => {
    const { cbs, f } = setup()
    let t = drive(f, 300_000, 300_000 + ENTRY_LOCK_MS + 300, null)
    t = drive(f, t, t + DWELL_MS + 200, retry)
    expect(cbs.retry).toHaveBeenCalledTimes(1)
    expect(cbs.menu).not.toHaveBeenCalled()
    t = drive(f, t, t + 400, null)
    t = drive(f, t, t + DWELL_MS + 150, menu)
    expect(cbs.menu).not.toHaveBeenCalled()
    drive(f, t, t + DESTRUCTIVE_DWELL_MS - DWELL_MS + 200, menu)
    expect(cbs.menu).toHaveBeenCalledTimes(1)
  })

  it('the card offer opens the card (not retry / menu)', () => {
    const { cbs, f } = setup()
    let t = drive(f, 400_000, 400_000 + ENTRY_LOCK_MS + 300, null)
    drive(f, t, t + 1500, offer)
    expect(cbs.card).toHaveBeenCalledTimes(1)
    expect(cbs.retry).not.toHaveBeenCalled()
    expect(cbs.menu).not.toHaveBeenCalled()
  })

  it('a hand covering two buttons at once resolves to exactly one action', () => {
    const { cbs, f } = setup()
    // A big blob between RETRY and the offer (both stacked in the left column).
    const mid: Circle = { cx: retry.cx, cy: (retry.cy + offer.cy) / 2, r: (offer.cy - retry.cy) }
    let t = drive(f, 500_000, 500_000 + ENTRY_LOCK_MS + 300, null)
    drive(f, t, t + 4000, mid)
    expect(cbs.retry.mock.calls.length + cbs.card.mock.calls.length + cbs.menu.mock.calls.length).toBeLessThanOrEqual(1)
  })
})

describe('victory', () => {
  const again = spec('victory', 'again'), menu = spec('victory', 'menu')
  function setup() {
    const cbs = { again: vi.fn(), menu: vi.fn(), card: vi.fn() }
    resetVictoryScreen()
    const f = (now: number) => renderVictory(ctxOf(), createInitialState(1), now, cbs.again, cbs.menu, cbs.card)
    return { cbs, f }
  }
  it('lockout + latch, then PLAY AGAIN after a fresh dwell', () => {
    const { cbs, f } = setup()
    let t = drive(f, 600_000, 600_000 + ENTRY_LOCK_MS + 4000, again)
    expect(cbs.again).not.toHaveBeenCalled()
    t = drive(f, t, t + 400, null)
    drive(f, t, t + DWELL_MS + 300, again)
    expect(cbs.again).toHaveBeenCalledTimes(1)
  })
  it('MAIN MENU uses the longer dwell', () => {
    const { cbs, f } = setup()
    let t = drive(f, 700_000, 700_000 + ENTRY_LOCK_MS + 300, null)
    t = drive(f, t, t + DWELL_MS + 200, menu)
    expect(cbs.menu).not.toHaveBeenCalled()
    drive(f, t, t + 600, menu)
    expect(cbs.menu).toHaveBeenCalledTimes(1)
  })
})
