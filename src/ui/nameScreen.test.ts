import { describe, it, expect } from 'vitest'
import { NameScreen, NAME_TITLE, WAITING_TEXT, NAME_HINT, NAME_HINT_2P } from './nameScreen'
import { newNameEntry, pickStep, typeChar } from '../game/nameEntry'
import { updateSettings, resetSettings } from '../settings/runtime'
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

describe('name screen pointer path (a click or tap on a button)', () => {
  const specs = areaButtons('name', W, H, null)
  it('maps each button to its action and a miss to null', () => {
    const sc = new NameScreen()
    const at = (label: string) => specs.find((b) => b.label === label)!
    expect(sc.pointerAction(at('OK').cx, at('OK').cy, W, H)).toEqual({ kind: 'ok' })
    expect(sc.pointerAction(at(NAME_PREV).cx, at(NAME_PREV).cy, W, H)).toEqual({ kind: 'step', dir: -1 })
    expect(sc.pointerAction(at(NAME_NEXT).cx, at(NAME_NEXT).cy, W, H)).toEqual({ kind: 'step', dir: 1 })
    expect(sc.pointerAction(2, 2, W, H)).toBeNull()
  })
  it('uses the half geometry in 2P (the label follows the button, not the seat)', () => {
    const half = areaButtons('name2p', W / 2, H, 1)
    const sc = new NameScreen(1)
    const prev = half.find((b) => b.label === NAME_PREV)!
    expect(sc.pointerAction(prev.cx, prev.cy, W / 2, H)).toEqual({ kind: 'step', dir: -1 })
  })
})

describe('name screen', () => {
  it('draws the title, the default name, score and rank, and three buttons', () => {
    const { ctx, texts } = recorder()
    new NameScreen().render(ctx, newNameEntry('GHOST-7F', 0), 0, { score: 4200, rank: 3 })
    expect(texts).toContain(NAME_TITLE)
    expect(texts).toContain('GHOST-7F')
    expect(texts.some((x) => x.includes('4200') && x.includes('#3'))).toBe(true)
    for (const l of [NAME_PREV, 'OK', NAME_NEXT]) expect(texts.some((x) => x.includes(l))).toBe(true)
  })
  it('shows underscores for a typed short name', () => {
    const { ctx, texts } = recorder()
    new NameScreen().render(ctx, typeChar(newNameEntry('GHOST-7F', 0), 'a', 0), 0, { score: 1, rank: 1 })
    expect(texts).toContain('A__')
  })
  it('shows the stepped default in place and always highlights the letter under the cursor', () => {
    const rects: number[][] = []
    const store: Record<string, unknown> = { canvas: { width: W, height: H } }
    const ctx = new Proxy(store, {
      get: (s, k: string) => (k === 'fillRect' ? (...a: number[]) => rects.push(a) : k in s ? s[k] : () => ({ width: 10 })),
      set: (s, k: string, v) => { s[k] = v; return true },
    }) as unknown as CanvasRenderingContext2D
    const texts: string[] = []
    const t = recorder()
    new NameScreen().render(t.ctx, pickStep(newNameEntry('GHOST-7F', 0), 1, 0), 0, { score: 1, rank: 1 })
    texts.push(...t.texts)
    expect(texts).toContain('HHOST-7F')
    new NameScreen().render(ctx, newNameEntry('GHOST-7F', 0), 0, { score: 1, rank: 1 })
    expect(rects.filter((r) => r[3] === 4)).toHaveLength(1) // the underline exists before any step
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

describe('name hint (playtest1-fixes R3.4)', () => {
  it('names the flow: OK saves, arrows change the letter, typing and Enter', () => {
    expect(NAME_HINT).toBe('Wave OK to save • ◀ ▶ change letter • or type and press Enter')
    expect(NAME_HINT).not.toMatch(/OK next|M is a letter/)
    expect(NAME_HINT_2P).toBe('OK saves • ◀ ▶ change letter')
  })
  it('fits its band at the supported sizes and text scales', () => {
    for (const [w, h] of [[640, 360], [1280, 720], [1920, 1080]]) for (const sc of [1, 1.5]) {
      updateSettings({ textScale: sc as 1 })
      const widths: number[] = []
      const store: Record<string, unknown> = { canvas: { width: w, height: h }, font: '' }
      const ctx = new Proxy(store, {
        get: (s, k: string) => (k === 'fillText' ? (text: string) => { if (text === NAME_HINT) widths.push(text.length * parseFloat(String(s.font).match(/(\d+(?:\.\d+)?)px/)![1]) * 0.6) } : k in s ? s[k] : () => ({ width: 10 })),
        set: (s, k: string, v) => { s[k] = v; return true },
      }) as unknown as CanvasRenderingContext2D
      new NameScreen().render(ctx, newNameEntry('GHOST-7F', 0), 0, { score: 1, rank: 1 })
      expect(widths).toHaveLength(1)
      expect(widths[0]).toBeLessThanOrEqual(0.6 * w + 1)
    }
    resetSettings()
  })
})
