/** playtest3-fixes R1: an end screen plays its intro once per arrival; a name-screen / card round trip never replays it. */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  renderVictory, renderGameOver, resetVictoryScreen, resetVictoryButtons, resetGameOverScreen,
} from './screens'
import { renderTwoPlayerFinal, resetFinalScreen, resetFinalButtons } from './splitscreen'
import { createInitialState } from '../game/state'
import { createTwoPlayer } from '../game/twoPlayer'
import { blobPoints, publish } from '../test/motionFixtures'
import { buttonLayout } from './layout'
import { DWELL_MS, ENTRY_LOCK_MS } from './motionButton'

const W = 1280, H = 720

/** Records the alpha of the first full-screen backdrop fill and the first scale (the banner) of one frame. */
function frameCtx() {
  const out = { alpha: -1, bannerScale: -1 }
  const ctx = new Proxy({ canvas: { width: W, height: H } } as Record<string, unknown>, {
    get(t, k: string) {
      if (k === 'fillRect') return () => {
        if (out.alpha < 0) {
          const m = /rgba\(13,0,20,([\d.]+)\)/.exec(String(t.fillStyle))
          if (m) out.alpha = Number(m[1])
        }
      }
      if (k === 'scale') return (x: number) => { if (out.bannerScale < 0) out.bannerScale = x }
      return k in t ? t[k] : () => ({ width: 10 })
    },
    set(t, k: string, v) { t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, out }
}

type Screen = { name: string; arrive: () => void; buttonsOnly: () => void; frame: (now: number) => { alpha: number; bannerScale: number } }
const noop = () => {}
const screens: Screen[] = [
  {
    name: '1P victory', arrive: resetVictoryScreen, buttonsOnly: resetVictoryButtons,
    frame: (now) => { const f = frameCtx(); renderVictory(f.ctx, createInitialState(1), now, noop, noop); return f.out },
  },
  {
    name: '1P game over', arrive: resetGameOverScreen, buttonsOnly: resetGameOverScreen,
    frame: (now) => { const f = frameCtx(); renderGameOver(f.ctx, createInitialState(1), now, noop, noop); return f.out },
  },
  {
    name: '2P final', arrive: resetFinalScreen, buttonsOnly: resetFinalButtons,
    frame: (now) => { const f = frameCtx(); renderTwoPlayerFinal(f.ctx, createTwoPlayer(), now, noop, noop); return f.out },
  },
]

describe('end screen intro (R1.1)', () => {
  for (const s of screens) {
    it(`${s.name}: the first frame after a name-screen round trip has the full backdrop`, () => {
      s.arrive()
      let t = 10_000
      for (; t < 14_000; t += 16) s.frame(t) // the intro has long finished
      const before = s.frame(t)
      t += 3_000 // the name screen covers the end screen; no end-screen frames render
      s.buttonsOnly()
      const after = s.frame(t)
      expect(after.alpha).toBeCloseTo(0.88, 5)
      expect(after.alpha).toBeGreaterThanOrEqual(before.alpha)
      if (before.bannerScale >= 0) expect(after.bannerScale).toBeCloseTo(1, 5) // banner at rest, no wobble-in
    })

    it(`${s.name}: a fresh arrival still fades in from a lighter backdrop`, () => {
      s.arrive()
      const first = s.frame(50_000)
      if (s.name !== '1P game over') expect(first.alpha).toBeLessThan(0.2) // game over keeps its constant backdrop
      s.frame(52_000)
      s.arrive()
      const again = s.frame(90_000)
      expect(again.alpha).toBe(first.alpha)
    })
  }

  it('the buttons stay locked after the round trip (R1.3): a hand that pressed OK presses nothing', () => {
    let fired = 0
    resetVictoryScreen()
    const play = buttonLayout('victory', W, H).find((b) => b.id === 'again')!
    const pts = blobPoints(W, H, play.cx, play.cy, play.r)
    let t = 100_000
    for (; t < 104_000; t += 33) { publish(W, H, []); renderVictory(frameCtx().ctx, createInitialState(1), t, () => { fired++ }, noop) }
    resetVictoryButtons() // name screen closed while the hand is still waving
    const end = t + ENTRY_LOCK_MS + 300 + DWELL_MS + 500
    for (; t < end; t += 33) { publish(W, H, pts); renderVictory(frameCtx().ctx, createInitialState(1), t, () => { fired++ }, noop) }
    expect(fired).toBe(0) // the hand never left, so the latch holds
  })
})

describe('end screen backdrop never drops (R1.2)', () => {
  for (const s of screens) {
    it(`${s.name}: any frame step, any number of round trips`, () => {
      fc.assert(fc.property(
        fc.array(fc.record({ dt: fc.integer({ min: 4, max: 200 }), trip: fc.integer({ min: 0, max: 40 }) }), { minLength: 5, maxLength: 120 }),
        (steps) => {
          s.arrive()
          let t = 1_000_000, last = -1
          for (const st of steps) {
            t += st.dt
            if (st.trip === 0) { t += 2500; s.buttonsOnly() } // a name-screen or card visit with no end-screen frames
            const a = s.frame(t).alpha
            expect(a).toBeGreaterThanOrEqual(last - 1e-9)
            last = a
          }
        }), { numRuns: 100 })
    })
  }
})
