import { describe, it, expect, afterEach } from 'vitest'
import { renderStageTitle } from './screens'
import { createInitialState } from '../game/state'
import { updateSettings, resetSettings } from '../settings/runtime'

interface Line { text: string; px: number; y: number }

function record(w: number, h: number): { ctx: CanvasRenderingContext2D; drawn: Line[] } {
  const drawn: Line[] = []
  const store: Record<string, unknown> = { canvas: { width: w, height: h }, textAlign: 'start' }
  const ctx = new Proxy(store, {
    get: (t, k: string) => k === 'fillText'
      ? (s: string, _x: number, y: number) => drawn.push({ text: s, px: parseFloat(/([\d.]+)px/.exec(String(t.font))?.[1] ?? '0'), y })
      : (k in t ? t[k] : () => ({ width: 10 })),
    set: (t, k: string, v) => { t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, drawn }
}

afterEach(() => resetSettings())

describe('stage 6 title card layout (more-content R1.9)', () => {
  for (const [w, h] of [[640, 360], [1280, 720]] as const) {
    for (const textScale of [1, 1.25, 1.5] as const) {
      it(`name, subtitle, countdown and hints do not overlap at ${w}x${h}, text scale ${textScale}`, () => {
        updateSettings({ textScale })
        const r = record(w, h)
        renderStageTitle(r.ctx, { ...createInitialState(6), stageTitleMs: 2500 })
        const top = (l: Line) => l.y - 0.75 * l.px
        const bottom = (l: Line) => l.y + 0.25 * l.px
        const lines = r.drawn
        const digit = lines.find((l) => /^\d$/.test(l.text))!
        const sub = lines.find((l) => l.text === 'The Midnight Finale')!
        const hints = lines.filter((l) => l !== digit && l !== sub && l.y > digit.y)
        expect(digit && sub && hints.length).toBeTruthy()
        expect(bottom(sub)).toBeLessThanOrEqual(top(digit))
        expect(bottom(digit)).toBeLessThanOrEqual(top(hints[0]))
        for (let i = 1; i < hints.length; i++) expect(bottom(hints[i - 1])).toBeLessThanOrEqual(top(hints[i]))
        expect(bottom(hints[hints.length - 1])).toBeLessThanOrEqual(h)
      })
    }
  }
})
