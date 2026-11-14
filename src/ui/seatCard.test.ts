import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { SeatCard, seatOfferGeometry, routeSeatClick, sharedButtonMaxCy } from './seatCard'
import type { SeatSession } from './seatCard'
import { previewLayout, PREVIEW_INPUT_DELAY_MS } from './cardScreen'
import { displayPointsInHalf, halfWidth } from '../game/halves'
import type { Seat } from '../game/halves'
import { FILL_DURATION_MS } from './motionButton'

type Pt = { x: number; y: number }

function fakeCtx(w: number, h: number): CanvasRenderingContext2D {
  const store: Record<string, unknown> = { canvas: { width: w, height: h } }
  return new Proxy(store, {
    get: (t, p: string) => (p in t ? t[p] : () => undefined),
    set: (t, p: string, v) => { t[p] = v; return true },
  }) as unknown as CanvasRenderingContext2D
}

function fakeSession(opts: { open?: boolean } = {}) {
  const calls = { open: 0, close: 0, toggle: 0, save: 0 }
  let isOpen = opts.open ?? false
  const session: SeatSession<CanvasImageSource> & { calls: typeof calls } = {
    calls,
    get isOpen() { return isOpen },
    get card() { return isOpen ? ({} as CanvasImageSource) : null },
    noPhoto: false, hasPhoto: true,
    open: () => { calls.open++; isOpen = true; return true },
    close: () => { calls.close++; isOpen = false },
    togglePhoto: () => { calls.toggle++ },
    save: async () => { calls.save++ },
    takeStatus: () => null,
  }
  return session
}

const HW = 640, H = 720, W = 1280
const ring = (cx: number, cy: number, r: number): Pt[] =>
  Array.from({ length: 8 }, (_, i) => ({ x: cx + Math.cos(i) * r * 0.3, y: cy + Math.sin(i) * r * 0.3 }))

/** Runs `frames` frames of 50 ms from `t0`, returns the last `now`. */
function run(card: SeatCard<CanvasImageSource>, ctx: CanvasRenderingContext2D, t0: number, ms: number): number {
  let now = t0
  for (; now <= t0 + ms; now += 50) card.render(ctx, now, true)
  return now
}

describe('seatOfferGeometry', () => {
  it('stays inside the half for many sizes, radius ≥ 36 when the half allows', () => {
    for (const [hw, h] of [[640, 720], [400, 600], [195, 844], [960, 1080], [100, 300]]) {
      const g = seatOfferGeometry(hw, h)
      expect(g.cx - g.r).toBeGreaterThanOrEqual(0)
      expect(g.cx + g.r).toBeLessThanOrEqual(hw)
      expect(g.cy + g.r).toBeLessThanOrEqual(h)
      if (hw >= 72) expect(g.r).toBeGreaterThanOrEqual(36)
    }
  })
})

describe('routeSeatClick (two-player-card R1.4)', () => {
  it('assigns a click to the half that contains it, with half-local x', () => {
    expect(routeSeatClick(10, 5, 1280)).toEqual({ seat: 0, x: 10, y: 5 })
    expect(routeSeatClick(639, 5, 1280).seat).toBe(0)
    expect(routeSeatClick(640, 5, 1280)).toEqual({ seat: 1, x: 0, y: 5 })
    expect(routeSeatClick(1000, 7, 1280)).toEqual({ seat: 1, x: 360, y: 7 })
    expect(routeSeatClick(500, 5, 1001).seat).toBe(1) // odd width: halves are floor(w/2)
  })

  it('property: the local x always lies in the routed half', () => {
    fc.assert(fc.property(fc.integer({ min: 200, max: 4000 }), fc.double({ min: 0, max: 1, noNaN: true }), (w, f) => {
      const x = Math.floor(f * (w - 1))
      const r = routeSeatClick(x, 0, w)
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.x).toBeLessThanOrEqual(halfWidth(w))
      expect(r.seat === 0).toBe(x < halfWidth(w))
    }))
  })
})

describe('SeatCard offer', () => {
  it('opens only after a full wave inside its own offer button (one wave, one open)', () => {
    const session = fakeSession()
    const g = seatOfferGeometry(HW, H)
    let pts: Pt[] = []
    const card = new SeatCard(0, session, () => pts)
    const ctx = fakeCtx(HW, H)
    card.render(ctx, 0, true)
    pts = ring(g.cx, g.cy, g.r)
    run(card, ctx, 100, FILL_DURATION_MS + 200)
    expect(session.calls.open).toBe(1)
    expect(card.lockedUntil).toBeGreaterThan(0)
  })

  it('a click on the offer opens, a click elsewhere does not; clicks need `live`', () => {
    const session = fakeSession()
    const card = new SeatCard(1, session, () => [])
    const ctx = fakeCtx(HW, H)
    card.render(ctx, 0, true) // learns the geometry
    const g = seatOfferGeometry(HW, H)
    card.queueClick(5, 5)
    card.render(ctx, 50, true)
    expect(session.calls.open).toBe(0)
    card.queueClick(g.cx, g.cy)
    card.render(ctx, 100, false) // not live yet (end-screen lock-out)
    expect(session.calls.open).toBe(0)
    card.queueClick(g.cx, g.cy)
    card.render(ctx, 150, true)
    expect(session.calls.open).toBe(1)
  })

  it('preview buttons: a click on CLOSE closes only this card; SAVE saves once', () => {
    const session = fakeSession({ open: true })
    const card = new SeatCard(0, session, () => [])
    const ctx = fakeCtx(HW, H)
    card.render(ctx, 0, true) // draws the preview, learns its layout
    const L = previewLayout(HW, H, false, true)
    const save = L.buttons.find((b) => b.id === 'save')!
    const close = L.buttons.find((b) => b.id === 'close')!
    card.queueClick(save.cx, save.cy)
    card.render(ctx, 50, true)
    expect(session.calls.save).toBe(1)
    card.queueClick(close.cx, close.cy)
    card.render(ctx, 100, true)
    expect(session.calls.close).toBe(1)
    expect(session.isOpen).toBe(false)
  })

  it('after the preview closes the offer is locked for 0.8 s (a CLOSE wave cannot re-open it)', () => {
    const session = fakeSession({ open: true })
    const card = new SeatCard(0, session, () => ring(seatOfferGeometry(HW, H).cx, seatOfferGeometry(HW, H).cy, 40))
    const ctx = fakeCtx(HW, H)
    card.render(ctx, 0, true)
    const close = previewLayout(HW, H, false, true).buttons.find((b) => b.id === 'close')!
    card.queueClick(close.cx, close.cy)
    card.render(ctx, 1000, true)
    expect(card.lockedUntil).toBe(1000 + PREVIEW_INPUT_DELAY_MS)
    run(card, ctx, 1050, PREVIEW_INPUT_DELAY_MS - 100)
    expect(session.calls.open).toBe(0)
  })

  it('an offer click during the post-close lock is ignored', () => {
    const session = fakeSession({ open: true })
    const card = new SeatCard(0, session, () => [])
    const ctx = fakeCtx(HW, H)
    card.render(ctx, 0, true)
    const close = previewLayout(HW, H, false, true).buttons.find((b) => b.id === 'close')!
    card.queueClick(close.cx, close.cy)
    card.render(ctx, 1000, true)
    const g = seatOfferGeometry(HW, H)
    card.queueClick(g.cx, g.cy)
    card.render(ctx, 1100, true)
    expect(session.calls.open).toBe(0)
    card.queueClick(g.cx, g.cy)
    card.render(ctx, 1000 + PREVIEW_INPUT_DELAY_MS, true)
    expect(session.calls.open).toBe(1)
  })

  it('closePreview closes an open card and clears queued clicks', () => {
    const session = fakeSession({ open: true })
    const card = new SeatCard(0, session, () => [])
    card.queueClick(1, 1)
    card.closePreview()
    expect(session.calls.close).toBe(1)
    expect(card.lockedUntil).toBe(0)
    const spy = vi.fn()
    session.open = () => { spy(); return true }
    card.render(fakeCtx(HW, H), 0, true)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('per-half routing (two-player-card R1.3) — property', () => {
  const rawPoints = fc.array(
    fc.record({ x: fc.integer({ min: 0, max: HW - 1 }), y: fc.integer({ min: 0, max: H }) }),
    { maxLength: 60 },
  )

  it('motion confined to the other half never opens or acts on a card, offer or preview', () => {
    fc.assert(fc.property(fc.constantFrom<Seat>(0, 1), fc.boolean(), rawPoints, (seat, open, raw) => {
      const session = fakeSession({ open })
      // Even a hand held exactly where this half's buttons are, but in the OTHER half's coordinates.
      const g = seatOfferGeometry(HW, H)
      const pts = ring(g.cx + (1 - seat) * HW, g.cy, g.r)
        .concat(raw.map((p) => ({ x: p.x + (1 - seat) * HW, y: p.y })))
      const card = new SeatCard(seat, session, () => displayPointsInHalf(pts, seat, W))
      run(card, fakeCtx(HW, H), 2000, 3000)
      const c = session.calls
      expect(open ? c.close + c.toggle + c.save : c.open).toBe(0)
    }), { numRuns: 60 })
  })

  it('the same hand inside the half does act (the filter is not just dead code)', () => {
    for (const seat of [0, 1] as const) {
      const session = fakeSession()
      const g = seatOfferGeometry(HW, H)
      const pts = ring(g.cx + seat * HW, g.cy, g.r)
      const card = new SeatCard(seat, session, () => displayPointsInHalf(pts, seat, W))
      const ctx = fakeCtx(HW, H)
      card.render(ctx, 0, true)
      run(card, ctx, 100, FILL_DURATION_MS + 300)
      expect(session.calls.open).toBe(1)
    }
  })

  it('two cards side by side: a wave in half 1 opens only seat 1', () => {
    const a = fakeSession(), b = fakeSession()
    const g = seatOfferGeometry(HW, H)
    const pts = ring(g.cx + HW, g.cy, g.r)
    const ca = new SeatCard(0, a, () => displayPointsInHalf(pts, 0, W))
    const cb = new SeatCard(1, b, () => displayPointsInHalf(pts, 1, W))
    const ctx = fakeCtx(HW, H)
    for (let now = 0; now < FILL_DURATION_MS + 400; now += 50) { ca.render(ctx, now, true); cb.render(ctx, now, true) }
    expect(a.calls.open).toBe(0)
    expect(b.calls.open).toBe(1)
    expect(cb.isOpen && !ca.isOpen).toBe(true) // independent state
  })
})

describe('shared end buttons vs offers', () => {
  it('never overlap for common sizes', () => {
    for (const [W, H] of [[800, 400], [640, 480], [1280, 720], [1920, 1080], [480, 360]]) {
      const hw = Math.floor(W / 2)
      const r = Math.max(48, Math.min(76, Math.round(W / 9)))
      const by = Math.min(H * 0.7, sharedButtonMaxCy(hw, H, r))
      const o = seatOfferGeometry(hw, H)
      for (const seat of [0, 1]) {
        for (const bx of [W * 0.35, W * 0.65]) {
          const ox = o.cx + seat * hw
          expect(Math.hypot(bx - ox, by - o.cy)).toBeGreaterThan(r + o.r)
        }
      }
    }
  })
})
