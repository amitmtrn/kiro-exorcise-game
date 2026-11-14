import { describe, it, expect, vi } from 'vitest'
import { renderTwoPlayerSummary, renderTwoPlayerFinal, resetFinalScreen, resetSummaryScreen } from './splitscreen'
import { createTwoPlayer } from '../game/twoPlayer'
import { areaButtons } from './layout'
import { blobPoints, publish } from '../test/motionFixtures'
import { displayPointsInHalf } from '../game/halves'
import { lastMotionPixels } from '../game/collision'
import { DWELL_MS, DESTRUCTIVE_DWELL_MS, ENTRY_LOCK_MS } from './motionButton'

const W = 640, H = 480, HW = 320

function recorder() {
  const texts: Array<{ text: string; y: number }> = []
  const stack: number[] = []
  let ty = 0
  const ctx = new Proxy({ canvas: { width: W, height: H } } as Record<string, unknown>, {
    get(t, k: string) {
      if (k === 'save') return () => { stack.push(ty) }
      if (k === 'restore') return () => { ty = stack.pop() ?? 0 }
      if (k === 'translate') return (_x: number, y: number) => { ty += y }
      if (k === 'fillText') return (text: string, _x: number, y: number) => { texts.push({ text, y: y + ty }) }
      return k in t ? t[k] : () => ({ width: 10 })
    },
    set(t, k: string, v) { t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, texts }
}
type Circle = { x: number; y: number; r: number }
const btn = (screen: 'summary2p' | 'final2p', seat: 0 | 1, id: string): Circle => {
  const b = areaButtons(screen, HW, H, seat).find((x) => x.id === id)!
  return { x: b.cx + seat * HW, y: b.cy, r: b.r }
}

function drive(fn: (now: number) => void, t0: number, t1: number, c: Circle | null): number {
  const pts = c ? blobPoints(W, H, c.x, c.y, c.r) : []
  let t = t0
  for (; t < t1; t += 33) { publish(W, H, pts); fn(t) }
  return t
}

describe('2P final: per-half copies (motion-ui-ergonomics R4)', () => {
  const t2 = createTwoPlayer()
  function setup(live: boolean | [boolean, boolean] = true) {
    const cbs = { again: vi.fn(), menu: vi.fn() }
    resetFinalScreen()
    const f = (now: number) => renderTwoPlayerFinal(recorder().ctx, t2, now, cbs.again, cbs.menu, live)
    return { cbs, f }
  }

  it('either player can PLAY AGAIN from their own half after the lockout and a release', () => {
    for (const seat of [0, 1] as const) {
      const { cbs, f } = setup()
      const b = btn('final2p', seat, 'again')
      let t = drive(f, 1_000_000 + seat * 100_000, 1_000_000 + seat * 100_000 + ENTRY_LOCK_MS + 300, null)
      t = drive(f, t, t + DWELL_MS + 300, b)
      expect(cbs.again).toHaveBeenCalledTimes(1)
      expect(cbs.menu).not.toHaveBeenCalled()
    }
  })

  it('a wave that continues through the lockout never fires (lockout + latch)', () => {
    const { cbs, f } = setup()
    drive(f, 2_000_000, 2_000_000 + ENTRY_LOCK_MS + 5000, btn('final2p', 0, 'again'))
    expect(cbs.again).not.toHaveBeenCalled()
  })

  it('MAIN MENU needs the longer dwell', () => {
    const { cbs, f } = setup()
    let t = drive(f, 3_000_000, 3_000_000 + ENTRY_LOCK_MS + 300, null)
    t = drive(f, t, t + DWELL_MS + 250, btn('final2p', 1, 'menu'))
    expect(cbs.menu).not.toHaveBeenCalled()
    drive(f, t, t + DESTRUCTIVE_DWELL_MS - DWELL_MS, btn('final2p', 1, 'menu'))
    expect(cbs.menu).toHaveBeenCalledTimes(1)
  })

  it('a half whose live flag is false cannot press, the other half still can', () => {
    const { cbs, f } = setup([false, true])
    let t = drive(f, 4_000_000, 4_000_000 + ENTRY_LOCK_MS + 300, null)
    t = drive(f, t, t + 2000, btn('final2p', 0, 'again'))
    expect(cbs.again).not.toHaveBeenCalled()
    t = drive(f, t, t + 400, null)
    drive(f, t, t + 2000, btn('final2p', 1, 'again'))
    expect(cbs.again).toHaveBeenCalledTimes(1)
  })

  it('each copy reads only its own half: the mirrored spot in the other half does nothing', () => {
    const { cbs, f } = setup()
    let t = drive(f, 5_000_000, 5_000_000 + ENTRY_LOCK_MS + 300, null)
    const b = btn('final2p', 0, 'again')
    drive(f, t, t + 3000, { ...b, x: b.x + HW }) // P2's half at P1's local spot: P2's own buttons are elsewhere
    expect(cbs.again).not.toHaveBeenCalled()
    expect(cbs.menu).not.toHaveBeenCalled()
  })

  it('explicit point sources are honoured (the loop passes the per-half points)', () => {
    const cbs = { again: vi.fn(), menu: vi.fn() }
    resetFinalScreen()
    const b = btn('final2p', 0, 'again')
    const pts = blobPoints(W, H, b.x, b.y, b.r).map((p) => ({ x: p.x * (W / 320), y: p.y * (H / 180) }))
    let hand = false
    const src = [() => (hand ? displayPointsInHalf(pts, 0, W) : []), () => []] as const
    const f = (now: number) => renderTwoPlayerFinal(recorder().ctx, t2, now, cbs.again, cbs.menu, true, src)
    let t = 6_000_000
    for (; t < 6_000_000 + ENTRY_LOCK_MS + 300; t += 33) { publish(W, H, []); f(t) }
    hand = true
    for (; t < 6_000_000 + ENTRY_LOCK_MS + 300 + 1500; t += 33) { publish(W, H, []); f(t) } // global mask empty
    expect(cbs.again).toHaveBeenCalledTimes(1)
    void lastMotionPixels
  })

  it('banner and scores are drawn below 47 % of the height (clear of the buttons and the mute button)', () => {
    resetFinalScreen()
    const r = recorder()
    renderTwoPlayerFinal(r.ctx, t2, 7_000_000, () => {}, () => {}, true)
    const banner = r.texts.filter((x) => /WINS|TIE/.test(x.text))
    expect(banner.length).toBe(1)
    for (const x of r.texts.filter((q) => !/NEXT|PLAY AGAIN|MAIN MENU/.test(q.text))) expect(x.y).toBeGreaterThan(0.47 * H)
  })
})

describe('2P summary NEXT per half', () => {
  const t2 = { ...createTwoPlayer(), phase: 'summary' as const, summaryShownMs: 3000 }
  it('fires when either player completes it, only after the entry lockout', () => {
    for (const seat of [0, 1] as const) {
      const cb = vi.fn()
      resetSummaryScreen()
      const next = btn('summary2p', seat, 'next')
      const f = (shown: number) => (now: number) => renderTwoPlayerSummary(recorder().ctx, { ...t2, summaryShownMs: shown }, now, cb)
      let t = drive(f(100), 8_000_000 + seat * 100_000, 8_000_000 + seat * 100_000 + 2000, next)
      expect(cb).not.toHaveBeenCalled() // lockout
      t = drive(f(3000), t, t + 500, null)
      drive(f(3000), t, t + DWELL_MS + 300, next)
      expect(cb).toHaveBeenCalledTimes(1)
    }
  })
  it('a wave that continues through the lockout must release before it can fire', () => {
    const cb = vi.fn()
    resetSummaryScreen()
    const next = btn('summary2p', 0, 'next')
    let shown = 0
    let t = 9_500_000
    for (; shown < ENTRY_LOCK_MS + 2500; shown += 33, t += 33) {
      publish(W, H, blobPoints(W, H, next.x, next.y, next.r))
      renderTwoPlayerSummary(recorder().ctx, { ...t2, summaryShownMs: shown }, t, cb)
    }
    expect(cb).not.toHaveBeenCalled()
  })
  it('text is below 47 % of the height', () => {
    resetSummaryScreen()
    const r = recorder()
    renderTwoPlayerSummary(r.ctx, t2, 9_000_000, () => {})
    for (const x of r.texts.filter((q) => !/NEXT|PLAY AGAIN|MAIN MENU/.test(q.text))) expect(x.y).toBeGreaterThan(0.47 * H)
  })
})
