/**
 * Playtest 1: every interactive end-screen button (game over, victory, name entry, card preview; 1P and each
 * 2P half) has a motion zone equal to its drawn circle after mirroring, and a full ring fires its action exactly
 * once (playtest1-fixes R2.1). Also: a neighbour clipped by the hand never steals the press (R2.2).
 */
import { describe, it, expect } from 'vitest'
import { renderGameOver, renderVictory, resetGameOverScreen, resetVictoryScreen } from './screens'
import { renderTwoPlayerFinal, resetFinalScreen } from './splitscreen'
import { NameScreen } from './nameScreen'
import { CardPreview } from './cardScreen'
import { SeatCard } from './seatCard'
import { previewLayout } from './cardScreen'
import { areaButtons, buttonLayout, RING_OUTSET, NAME_PREV } from './layout'
import type { ButtonSpec } from './layout'
import { createInitialState } from '../game/state'
import { createTwoPlayer } from '../game/twoPlayer'
import { newNameEntry } from '../game/nameEntry'
import { displayPointsInHalf, halfOffset, halfWidth } from '../game/halves'
import { lastMotionPixels } from '../game/collision'
import { mirrorX, MOTION_W } from '../webcam/diff'
import { blobPoints, publish } from '../test/motionFixtures'
import type { Pt } from '../test/motionFixtures'
import { DWELL_MS, DESTRUCTIVE_DWELL_MS, ENTRY_LOCK_MS } from './motionButton'
import { PREVIEW_INPUT_DELAY_MS } from './cardScreen'

const W = 1280, H = 720, HW = halfWidth(W)

interface Arc { x: number; y: number; r: number }
/** A 2D context stand-in that records every arc in the coordinates of the area it draws into. */
function recorder(w: number, h: number) {
  const arcs: Arc[] = []
  let tx = 0, ty = 0
  const stack: Array<[number, number]> = []
  const ctx = new Proxy({ canvas: { width: w, height: h } } as Record<string, unknown>, {
    get(t, k: string) {
      if (k === 'save') return () => { stack.push([tx, ty]) }
      if (k === 'restore') return () => { [tx, ty] = stack.pop() ?? [0, 0] }
      if (k === 'translate') return (x: number, y: number) => { tx += x; ty += y }
      if (k === 'arc') return (x: number, y: number, r: number) => { arcs.push({ x: x + tx, y: y + ty, r }) }
      return k in t ? t[k] : () => ({ width: 10, addColorStop() {} })
    },
    set(t, k: string, v) { t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, arcs }
}

/** A hand at display (cx, cy): points are made in raw camera space and mirrored like the capture does. */
function hand(cx: number, cy: number, r: number): Pt[] {
  const raw = blobPoints(W, H, W - cx, cy, r) // raw camera: the player's right is on the image's left
  return raw.map((p) => ({ x: mirrorX(p.x, MOTION_W), y: p.y }))
}

interface Case {
  name: string
  /** Expected buttons, in the coordinates of the full canvas. */
  specs: Array<{ id: string; cx: number; cy: number; r: number; destructive: boolean }>
  /** Every button the screen draws (default: `specs`); a 2P end screen draws both halves' copies. */
  owners?: Array<{ cx: number; cy: number; r: number }>
  /** Builds a fresh screen; `frame` renders one tick and returns the ids of the actions that fired. */
  make(): { frame(now: number): string[]; arcs(): Arc[] }
}

const full = (specs: ButtonSpec[]) => specs.map((b) => ({ id: b.id, cx: b.cx, cy: b.cy, r: b.r, destructive: b.destructive }))
const inHalfSpecs = (screen: 'name2p' | 'preview2p' | 'final2p', seat: 0 | 1, opts = { hasPhoto: true, noPhoto: false }) =>
  areaButtons(screen, HW, H, seat, opts).map((b) => ({ id: b.id, cx: b.cx + halfOffset(seat, W), cy: b.cy, r: b.r, destructive: b.destructive }))
const points = (seat: 0 | 1) => () => displayPointsInHalf(lastMotionPixels, seat, W)
const FAKE_CARD = {} as CanvasImageSource
/** The id of the name-screen button that fired: the ◀ button is whichever one carries the ◀ label in this area. */
const nameId = (a: { kind: 'ok' } | { kind: 'step'; dir: -1 | 1 }, area: ButtonSpec[]): string =>
  a.kind === 'ok' ? 'ok' : area.find((b) => (b.label === NAME_PREV) === (a.dir === -1) && b.id !== 'ok')!.id

const cases: Case[] = []

cases.push({
  name: '1P game over',
  specs: full(buttonLayout('gameover', W, H)),
  make() {
    let fired: string[] = []; let arcs: Arc[] = []
    resetGameOverScreen()
    return {
      frame(now) {
        const r = recorder(W, H); fired = []
        renderGameOver(r.ctx, createInitialState(1), now, () => fired.push('retry'), () => fired.push('menu'), () => fired.push('offer'))
        arcs = r.arcs; return fired
      },
      arcs: () => arcs,
    }
  },
})
cases.push({
  name: '1P victory',
  specs: full(buttonLayout('victory', W, H)),
  make() {
    let fired: string[] = []; let arcs: Arc[] = []
    resetVictoryScreen()
    return {
      frame(now) {
        const r = recorder(W, H); fired = []
        renderVictory(r.ctx, createInitialState(1), now, () => fired.push('again'), () => fired.push('menu'), () => fired.push('offer'))
        arcs = r.arcs; return fired
      },
      arcs: () => arcs,
    }
  },
})
cases.push({
  name: '1P name entry',
  specs: full(buttonLayout('name', W, H)),
  make() {
    const screen = new NameScreen(); screen.reset()
    let arcs: Arc[] = []
    return {
      frame(now) {
        const r = recorder(W, H)
        const a = screen.render(r.ctx, newNameEntry('GHOST-7F', 0), now, { score: 100, rank: 1 })
        arcs = r.arcs
        return a ? [nameId(a, buttonLayout('name', W, H))] : []
      },
      arcs: () => arcs,
    }
  },
})
cases.push({
  name: '1P card preview',
  specs: full(previewLayout(W, H, false, true).buttons),
  make() {
    const p = new CardPreview(); p.open(0)
    let arcs: Arc[] = []
    return {
      frame(now) {
        const r = recorder(W, H)
        const a = p.render(r.ctx, now, FAKE_CARD, false, true)
        arcs = r.arcs
        return a ? [a] : []
      },
      arcs: () => arcs,
    }
  },
})
for (const seat of [0, 1] as const) {
  cases.push({
    name: `2P half ${seat + 1} name entry`,
    specs: inHalfSpecs('name2p', seat),
    make() {
      const screen = new NameScreen(seat, points(seat)); screen.reset()
      let arcs: Arc[] = []
      return {
        frame(now) {
          const r = recorder(HW, H)
          const a = screen.render(r.ctx, newNameEntry('GHOST-7F', 0), now, { score: 100, rank: 1 })
          arcs = r.arcs.map((q) => ({ ...q, x: q.x + halfOffset(seat, W) }))
          return a ? [nameId(a, areaButtons('name2p', HW, H, seat))] : []
        },
        arcs: () => arcs,
      }
    },
  })
  cases.push({
    name: `2P half ${seat + 1} card preview`,
    specs: inHalfSpecs('preview2p', seat),
    make() {
      const p = new CardPreview(points(seat), seat); p.open(0)
      let arcs: Arc[] = []
      return {
        frame(now) {
          const r = recorder(HW, H)
          const a = p.render(r.ctx, now, FAKE_CARD, false, true)
          arcs = r.arcs.map((q) => ({ ...q, x: q.x + halfOffset(seat, W) }))
          return a ? [a] : []
        },
        arcs: () => arcs,
      }
    },
  })
  // The per-half shared buttons (PLAY AGAIN / MAIN MENU) and the half's own card offer, as the loop draws them.
  cases.push({
    name: `2P half ${seat + 1} end screen (PLAY AGAIN, MAIN MENU, card offer)`,
    specs: inHalfSpecs('final2p', seat),
    owners: [...inHalfSpecs('final2p', 0), ...inHalfSpecs('final2p', 1)],
    make() {
      resetFinalScreen()
      const t = createTwoPlayer()
      let fired: string[] = []; let arcs: Arc[] = []
      const session = { isOpen: false, card: null, noPhoto: false, hasPhoto: true, open: () => { fired.push('offer'); return false }, close() {}, togglePhoto() {}, async save() {}, takeStatus: () => null }
      const card = new SeatCard<CanvasImageSource>(seat, session, points(seat))
      return {
        frame(now) {
          fired = []
          const r = recorder(W, H)
          renderTwoPlayerFinal(r.ctx, t, now, () => fired.push('again'), () => fired.push('menu'), true, [points(0), points(1)])
          const half = recorder(HW, H)
          card.render(half.ctx, now, true)
          arcs = [...r.arcs, ...half.arcs.map((q) => ({ ...q, x: q.x + halfOffset(seat, W) }))]
          return fired
        },
        arcs: () => arcs,
      }
    },
  })
}

/** One monotonic clock for the whole file: the module-level offer button keeps its latch between screens. */
let clock = 1_000_000
const settle = (t: number, until: number, screen: ReturnType<Case['make']>, pts: Pt[]): { t: number; fired: string[] } => {
  const fired: string[] = []
  for (; t < until; t += 33) { publish(W, H, pts); fired.push(...screen.frame(t)) }
  clock = t + 3000
  return { t, fired }
}

describe.each(cases)('$name', (c) => {
  it('draws a circle exactly where each button zone is (no stray or shifted ring)', () => {
    const s = c.make()
    publish(W, H, [])
    s.frame(clock); clock += 3000
    const drawn = s.arcs()
    for (const b of c.specs) {
      expect(drawn.some((a) => Math.abs(a.x - b.cx) < 0.5 && Math.abs(a.y - b.cy) < 0.5 && Math.abs(a.r - b.r) < 0.5), `${b.id} drawn at its zone`).toBe(true)
    }
    for (const a of drawn) {
      // every circle is the button body (r) or its progress ring (r + RING_OUTSET - 3) of exactly one spec
      const owner = (c.owners ?? c.specs).find((b) => Math.hypot(a.x - b.cx, a.y - b.cy) < 0.5 && (Math.abs(a.r - b.r) < 0.5 || Math.abs(a.r - (b.r + RING_OUTSET - 3)) < 0.5))
      expect(owner, `circle at ${a.x.toFixed(0)},${a.y.toFixed(0)} r${a.r.toFixed(0)} belongs to a button`).toBeDefined()
    }
  })

  for (const b of c.specs) {
    it(`${b.id}: a full ring fires its action exactly once`, () => {
      const s = c.make()
      const lock = Math.max(ENTRY_LOCK_MS, PREVIEW_INPUT_DELAY_MS) + 300
      let { t } = settle(clock, clock + lock, s, [])
      const dwell = b.destructive ? DESTRUCTIVE_DWELL_MS : DWELL_MS
      const on = settle(t, t + dwell + 400, s, hand(b.cx, b.cy, b.r))
      expect(on.fired).toEqual([b.id])
      // the hand stays: one wave = one action
      const more = settle(on.t, on.t + 2500, s, hand(b.cx, b.cy, b.r))
      expect(more.fired).toEqual([])
    })
    it(`${b.id}: the zone is the drawn circle (a hand just outside its ring does nothing)`, () => {
      const s = c.make()
      const lock = Math.max(ENTRY_LOCK_MS, PREVIEW_INPUT_DELAY_MS) + 300
      let { t } = settle(clock, clock + lock, s, [])
      // a small hand beside the circle, on the side facing away from every other button
      const away = c.specs.filter((o) => o !== b).reduce((a, o) => ({ x: a.x + (b.cx - o.cx), y: a.y + (b.cy - o.cy) }), { x: 0, y: 0 })
      const len = Math.hypot(away.x, away.y) || 1
      const hx = b.cx + (away.x / len) * (b.r * 2.2), hy = b.cy + (away.y / len) * (b.r * 2.2)
      const miss = settle(t, t + 3000, s, hand(hx, hy, b.r * 0.6))
      expect(miss.fired).toEqual([])
    })
  }
})

describe('a hand covering two neighbours: the larger coverage wins (R2.2)', () => {
  function clippedPress(c: Case, wanted: string, neighbour: string): string[] {
    const s = c.make()
    const w = c.specs.find((b) => b.id === wanted)!, n = c.specs.find((b) => b.id === neighbour)!
    const area = (pts: Pt[], b: { cx: number; cy: number; r: number }) => {
      const sx = W / MOTION_W, sy = H / 180
      return pts.filter((p) => Math.hypot(p.x * sx - b.cx, p.y * sy - b.cy) < b.r).length
    }
    // slide a big hand from the wanted button towards the neighbour until both are covered by 12 %+ and wanted is larger
    const dir = Math.sign(n.cy - w.cy) || 1
    let pts: Pt[] | null = null
    for (let d = 0; d <= 1.6 * w.r && !pts; d += 2) {
      const cand = hand(w.cx, w.cy + dir * d, w.r * 1.7)
      const aw = area(cand, w), an = area(cand, n)
      const need = 0.12 * Math.PI * w.r * w.r / ((W / MOTION_W * 4) * (H / 180 * 4))
      if (an >= need * 1.2 && aw > an * 1.4) pts = cand
    }
    expect(pts, 'a hand that clips the neighbour exists').not.toBeNull()
    const lock = Math.max(ENTRY_LOCK_MS, PREVIEW_INPUT_DELAY_MS) + 300
    const { t } = settle(clock, clock + lock, s, [])
    return settle(t, t + DESTRUCTIVE_DWELL_MS + 800, s, pts!).fired
  }
  const byName = (n: string) => cases.find((c) => c.name === n)!
  it('card preview: a hand on CLOSE that clips NO PHOTO closes (it does not flip the photo)', () => {
    expect(clippedPress(byName('1P card preview'), 'close', 'toggle')).toEqual(['close'])
  })
  it('name entry: a hand on OK that clips ◀ saves the name (it does not step the letter)', () => {
    expect(clippedPress(byName('1P name entry'), 'ok', 'stepA')).toEqual(['ok'])
  })
  it('game over: a hand on RETRY that clips the card offer retries', () => {
    expect(clippedPress(byName('1P game over'), 'retry', 'offer')).toEqual(['retry'])
  })
})
