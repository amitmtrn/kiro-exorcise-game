import { describe, it, expect } from 'vitest'
import { NameScreen, NAME_TITLE, WAITING_TEXT, NAME_HINT } from './nameScreen'
import { newNameEntry, pickStep } from '../game/nameEntry'
import { areaButtons, buttonLayout, NAME_PREV, NAME_NEXT } from './layout'
import { blobPoints, publish } from '../test/motionFixtures'
import { DWELL_MS, ENTRY_LOCK_MS } from './motionButton'
import type { NameAction } from './nameScreen'

const W = 1280, H = 720
function recorder(w = W, h = H) {
  const texts: string[] = []
  const store: Record<string, unknown> = { canvas: { width: w, height: h } }
  const ctx = new Proxy(store, {
    get: (s, k: string) => (k === 'fillText' ? (text: string) => texts.push(text) : k in s ? s[k] : () => ({ width: 10 })),
    set: (s, k: string, v) => { s[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, texts }
}

/** Holds a hand over `label` until something fires; returns the actions. */
function press(screen: NameScreen, label: string, t0: number): { acts: NameAction[]; t: number } {
  const b = buttonLayout('name', W, H).find((x) => x.label === label)!
  const e = newNameEntry('BOO-01', 0)
  const acts: NameAction[] = []
  let t = t0
  for (; t < t0 + ENTRY_LOCK_MS + 200; t += 33) { publish(W, H, []); const a = screen.render(recorder().ctx, e, t, { score: 1, rank: 1 }); if (a) acts.push(a) }
  for (; t < t0 + ENTRY_LOCK_MS + 200 + DWELL_MS + 300; t += 33) { publish(W, H, blobPoints(W, H, b.cx, b.cy, b.r)); const a = screen.render(recorder().ctx, e, t, { score: 1, rank: 1 }); if (a) acts.push(a) }
  return { acts, t }
}

describe('name screen', () => {
  it('draws the title, the default name, score and rank, and three buttons', () => {
    const { ctx, texts } = recorder()
    new NameScreen().render(ctx, newNameEntry('GHOST-7F', 0), 0, { score: 4200, rank: 3 })
    expect(texts).toContain(NAME_TITLE)
    expect(texts).toContain('GHOST-7F')
    expect(texts.some((x) => x.includes('4200') && x.includes('#3'))).toBe(true)
    for (const l of [NAME_PREV, 'OK', NAME_NEXT]) expect(texts.some((x) => x.includes(l))).toBe(true)
  })
  it('shows underscores for the picked letters', () => {
    const { ctx, texts } = recorder()
    new NameScreen().render(ctx, pickStep(newNameEntry('GHOST-7F', 0), 1, 0), 0, { score: 1, rank: 1 })
    expect(texts).toContain('A__')
  })
  it('ignores motion during the entry lock-out, then one wave fires one action', () => {
    for (const [label, want] of [[NAME_PREV, { kind: 'step', dir: -1 }], [NAME_NEXT, { kind: 'step', dir: 1 }], ['OK', { kind: 'ok' }]] as const) {
      const s = new NameScreen()
      s.reset()
      const { acts } = press(s, label, 1_000_000)
      expect(acts).toEqual([want])
    }
  })
  it('2P: a half draws inside itself and reads only its own points; done shows the waiting line', () => {
    const hw = W / 2
    const pts: Array<{ x: number; y: number }> = []
    const s = new NameScreen(1, () => pts)
    const { ctx, texts } = recorder(hw, H)
    s.render(ctx, newNameEntry('BAT-01', 0), 0, { score: 1, rank: 1 })
    expect(texts.some((x) => x.includes(NAME_PREV))).toBe(true)
    for (const b of areaButtons('name2p', hw, H, 1)) { expect(b.cx - b.r).toBeGreaterThanOrEqual(0); expect(b.cx + b.r).toBeLessThanOrEqual(hw) }
    const done = recorder(hw, H)
    s.render(done.ctx, { ...newNameEntry('BAT-01', 0), done: true }, 0, { score: 1, rank: 1 })
    expect(done.texts).toEqual([WAITING_TEXT])
  })
})

describe('name hint (R11.3)', () => {
  it('tells the player that M is a letter while typing a name', () => {
    expect(NAME_HINT).toContain('M is a letter')
  })
})
