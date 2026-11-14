import { describe, it, expect } from 'vitest'
import {
  renderStartScreen, renderGameOver, renderVictory, renderSummary,
  resetStartScreen, resetGameOverScreen, resetVictoryScreen, MIN_TEXT_PX,
} from './screens'
import { createInitialState } from '../game/state'
import type { GameState } from '../game/state'
import { buttonLayout, TEXT_BAND_1P, TEXT_BAND_LOW, TEXT_LOW_TOP, fitFontPx } from './layout'
import { GUIDE_HANDS_LINE } from './onboarding'

interface Drawn { text: string; px: number; y: number; align: string }

function record(w: number, h: number): { ctx: CanvasRenderingContext2D; drawn: Drawn[] } {
  const drawn: Drawn[] = []
  const store: Record<string, unknown> = { canvas: { width: w, height: h }, textAlign: 'start' }
  const ctx = new Proxy(store, {
    get: (t, k: string) => k === 'fillText'
      ? (s: string, _x: number, y: number) => drawn.push({
        text: s, px: parseFloat(/([\d.]+)px/.exec(String(t.font))?.[1] ?? '0'), y, align: String(t.textAlign),
      })
      : (k in t ? t[k] : () => ({ width: 10 })),
    set: (t, k: string, v) => { t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, drawn }
}

const SIZES: [number, number][] = [[640, 480], [1280, 720]]

function scenes(w: number, h: number): [string, Drawn[]][] {
  const base = (): GameState => ({ ...createInitialState(1), highScore: 123456, score: 9999 })
  const out: [string, Drawn[]][] = []
  { resetStartScreen(); const r = record(w, h); renderStartScreen(r.ctx, base(), 10_000, () => {}); out.push(['start', r.drawn]) }
  for (const lives of [0, 2]) {
    resetGameOverScreen(); const r = record(w, h)
    renderGameOver(r.ctx, { ...base(), lives }, 10_000, () => {}, () => {}); out.push([`gameover lives=${lives}`, r.drawn])
  }
  { resetVictoryScreen(); const r = record(w, h); renderVictory(r.ctx, base(), 10_000, () => {}, () => {}); out.push(['victory', r.drawn]) }
  { const r = record(w, h); renderSummary(r.ctx, { ...base(), summaryShownMs: 5000 }, 10_000, () => {}); out.push(['summary', r.drawn]) }
  return out
}

describe('menu text readability (motion-ui-ergonomics R5.1)', () => {
  for (const [w, h] of SIZES) {
    it(`every line is >= ${MIN_TEXT_PX} px at ${w} wide and fits its band`, () => {
      for (const [name, drawn] of scenes(w, h)) {
        expect(drawn.length, name).toBeGreaterThan(0)
        // button labels are fitted to their circle (separate rule), everything else to the bands
        const labels = new Set(['start', 'summary', 'gameover', 'victory'].flatMap((id) =>
          buttonLayout(id as 'start', w, h).flatMap((b) => b.label.split('\n'))))
        for (const d of drawn.filter((x) => !labels.has(x.text))) {
          expect(d.px, `${name}: ${d.text}`).toBeGreaterThanOrEqual(MIN_TEXT_PX)
          if (d.align !== 'center') continue
          const high = d.y < TEXT_LOW_TOP * h
          const [a, b] = high ? TEXT_BAND_1P : TEXT_BAND_LOW
          const width = [...d.text].length * 0.6 * d.px
          // generous 10 % for the approximate 0.6 em glyph width
          expect(width, `${name}: ${d.text}`).toBeLessThanOrEqual((b - a) * w * 1.1)
        }
      }
    })
  }

  it('the title, subtitle and tagline sit below the button rows (wide band)', () => {
    for (const [w, h] of SIZES) {
      for (const [name, drawn] of scenes(w, h)) {
        for (const d of drawn.filter((x) => /EXORCISE|Swat the ghosts|have been exorcised/.test(x.text))) {
          expect(d.y, `${name}: ${d.text}`).toBeGreaterThanOrEqual(TEXT_LOW_TOP * h)
        }
      }
    }
  })

  it('the onboarding caption is >= 12 px and inside the wide band at 640 wide', () => {
    const band = (TEXT_BAND_LOW[1] - TEXT_BAND_LOW[0]) * 640
    const px = Math.round(fitFontPx(GUIDE_HANDS_LINE, Math.max(14, Math.min(26, 640 / 40)), band, 12))
    expect(px).toBeGreaterThanOrEqual(12)
    expect([...GUIDE_HANDS_LINE].length * 0.6 * px).toBeLessThanOrEqual(band * 1.1)
  })
})
