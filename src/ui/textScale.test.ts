import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fc from 'fast-check'
import {
  hudLayout, calloutPx, scaled, MIN_HUD_PX, MIN_CALLOUT_PX, MIN_MENU_PX, GLYPH_EM,
} from './textScale'
import { hudFontSize } from './muteRect'
import { renderHUD, createHudPulse } from './hud'
import {
  renderStartScreen, renderGameOver, renderVictory, renderSummary, renderStageTitle,
  resetStartScreen, resetGameOverScreen, resetVictoryScreen,
} from './screens'
import { buttonLayout, circleRect, rectsOverlap, muteRectOf, RING_OUTSET, MAX_CENTRE_Y } from './layout'
import type { Rect, ScreenId } from './layout'
import { createInitialState } from '../game/state'
import type { GameState } from '../game/state'
import { STAGES } from '../game/stages'
import { initSettings, resetSettings } from '../settings/runtime'
import { TEXT_SCALES } from '../settings/settings'

const SIZES: Array<[number, number]> = [[640, 480], [1280, 720]]
const setScale = (s: number) => initSettings({ storage: null, search: `?bigtext=${s === 1 ? 0 : s === 1.25 ? 1 : 2}`, reducedMotion: false })
beforeEach(() => resetSettings())
afterAll(() => resetSettings())

const inside = (r: Rect, W: number, H: number) => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= W + 0.5 && r.y + r.h <= H + 0.5

describe('hudLayout (R9.2)', () => {
  const labels = [...STAGES.map((s) => `${s.name} — ${s.subtitle}`), 'Bonus Round — Candy Time']
  for (const [W, H] of SIZES) {
    for (const scale of TEXT_SCALES) {
      it(`every HUD text box is inside ${W}x${H} and clear of the others at ${scale}x`, () => {
        for (const label of labels) {
          const l = hudLayout(W, H, scale, { label })
          expect(l.fontPx).toBeGreaterThanOrEqual(MIN_HUD_PX)
          expect(l.fontPx).toBe(hudFontSize(W, scale))
          if (l.labelPx !== null) expect(l.labelPx).toBeGreaterThanOrEqual(MIN_HUD_PX)
          const named = Object.entries(l.boxes).filter((e): e is [string, Rect] => e[1] !== null)
          for (const [n, r] of named) expect(inside(r, W, H), `${n} ${label}`).toBe(true)
          for (let i = 0; i < named.length; i++) for (let j = i + 1; j < named.length; j++) {
            expect(rectsOverlap(named[i][1], named[j][1]), `${named[i][0]} / ${named[j][0]} ${label}`).toBe(false)
          }
        }
      })
    }
  }

  it('the stage label is shown on the canvases the game uses (never dropped at 640 and 1280)', () => {
    for (const [W, H] of SIZES) for (const scale of TEXT_SCALES) {
      for (const label of labels) expect(hudLayout(W, H, scale, { label }).labelPx, `${W} ${scale} ${label}`).not.toBeNull()
    }
  })

  it('scale 1 keeps today\'s label size (0.6 x the HUD font)', () => {
    for (const [W, H] of SIZES) expect(hudLayout(W, H, 1, { label: 'Stage 1 — The Graveyard' }).labelPx).toBe(Math.round(hudFontSize(W, 1) * 0.6))
  })

  it('property: any canvas at least 640 wide keeps all boxes inside and apart at every scale', () => {
    fc.assert(fc.property(
      fc.integer({ min: 640, max: 2560 }), fc.constantFrom(...TEXT_SCALES), fc.constantFrom(...labels), fc.integer({ min: 1, max: 12 }),
      (W, scale, label, scoreChars) => {
        const H = Math.round((W * 9) / 16)
        const l = hudLayout(W, Math.max(H, 480), scale, { label, scoreChars })
        const named = Object.values(l.boxes).filter((r): r is Rect => r !== null)
        return named.every((r) => inside(r, W, Math.max(H, 480))) &&
          named.every((a, i) => named.every((b, j) => i >= j || !rectsOverlap(a, b)))
      },
    ), { numRuns: 300 })
  })
})

describe('call-outs', () => {
  it('keep today\'s size at 1x and stay inside the canvas when scaled', () => {
    expect(calloutPx(640, 320, 9, 1)).toBe(Math.round(Math.max(28, Math.min(64, 640 / 16)) * 1.1))
    for (const [W] of SIZES) for (const scale of TEXT_SCALES) {
      for (const text of ['x4 COMBO!', 'PERFECT!', 'NICE!']) {
        for (const cx of [0.2 * W, 0.5 * W, 0.8 * W]) {
          const px = calloutPx(W, cx, text.length, scale)
          expect(px).toBeGreaterThanOrEqual(MIN_CALLOUT_PX)
          const half = (text.length * GLYPH_EM * px) / 2
          expect(cx - half, `${text} ${cx} ${scale}`).toBeGreaterThanOrEqual(0)
          expect(cx + half).toBeLessThanOrEqual(W)
        }
      }
    }
  })
  it('scaled() multiplies and rounds', () => {
    expect(scaled(24, 1.5)).toBe(36)
    expect(scaled(15, 1.25)).toBe(19)
  })
})

// ─── What the screens really draw ────────────────────────────────────────────

interface Drawn { text: string; px: number; box: Rect }

/** Recording context: tracks translate / scale, font px, text alignment and baseline. */
function record(w: number, h: number): { ctx: CanvasRenderingContext2D; drawn: Drawn[] } {
  const drawn: Drawn[] = []
  const store: Record<string, unknown> = { canvas: { width: w, height: h }, textAlign: 'start', textBaseline: 'alphabetic' }
  let m = { tx: 0, ty: 0, sx: 1, sy: 1 }
  const stack: Array<typeof m> = []
  const ctx = new Proxy(store, {
    get: (t, k: string) => {
      switch (k) {
        case 'save': return () => { stack.push({ ...m }) }
        case 'restore': return () => { m = stack.pop() ?? m }
        case 'translate': return (x: number, y: number) => { m = { ...m, tx: m.tx + x * m.sx, ty: m.ty + y * m.sy } }
        case 'scale': return (x: number, y: number) => { m = { ...m, sx: m.sx * x, sy: m.sy * y } }
        case 'fillText': return (s: string, x: number, y: number) => {
          const px = parseFloat(/([\d.]+)px/.exec(String(t.font))?.[1] ?? '0') * m.sy
          const wTxt = [...s].length * GLYPH_EM * px
          const ax = m.tx + x * m.sx
          const left = t.textAlign === 'center' ? ax - wTxt / 2 : t.textAlign === 'right' || t.textAlign === 'end' ? ax - wTxt : ax
          const ay = m.ty + y * m.sy
          const top = t.textBaseline === 'middle' ? ay - px / 2 : t.textBaseline === 'bottom' ? ay - px : t.textBaseline === 'top' ? ay : ay - px * 0.8
          drawn.push({ text: s, px, box: { x: left, y: top, w: wTxt, h: px } })
        }
        default: return k in t ? t[k] : () => ({ width: 10, addColorStop() {} })
      }
    },
    set: (t, k: string, v) => { t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, drawn }
}

const base = (): GameState => ({ ...createInitialState(1), highScore: 123456, score: 99999 })

function scenes(w: number, h: number): Array<[string, ScreenId | null, Drawn[]]> {
  const out: Array<[string, ScreenId | null, Drawn[]]> = []
  { resetStartScreen(); const r = record(w, h); renderStartScreen(r.ctx, base(), 10_000, () => {}); out.push(['start', 'start', r.drawn]) }
  for (const lives of [0, 2]) {
    resetGameOverScreen(); const r = record(w, h)
    renderGameOver(r.ctx, { ...base(), lives }, 10_000, () => {}, () => {}); out.push([`gameover ${lives}`, 'gameover', r.drawn])
  }
  { resetVictoryScreen(); const r = record(w, h); renderVictory(r.ctx, base(), 10_000, () => {}, () => {}); out.push(['victory', 'victory', r.drawn]) }
  { const r = record(w, h); renderSummary(r.ctx, { ...base(), summaryShownMs: 5000 }, 10_000, () => {}); out.push(['summary', 'summary', r.drawn]) }
  for (let stage = 1; stage <= 5; stage++) {
    const r = record(w, h)
    renderStageTitle(r.ctx, { ...base(), stage, stageTitleMs: 1500 }); out.push([`stage title ${stage}`, null, r.drawn])
  }
  return out
}

describe('menus at every text scale (R9.1, R9.2)', () => {
  for (const [w, h] of SIZES) {
    for (const scale of TEXT_SCALES) {
      it(`${w}x${h} at ${scale}x: text >= ${MIN_MENU_PX} px, inside the canvas, clear of the motion buttons`, () => {
        setScale(scale)
        for (const [name, screen, drawn] of scenes(w, h)) {
          expect(drawn.length, name).toBeGreaterThan(0)
          const circles = screen ? buttonLayout(screen, w, h).map((b) => circleRect({ cx: b.cx, cy: b.cy, r: b.r + RING_OUTSET })) : []
          const labelTexts = new Set(screen ? buttonLayout(screen, w, h).flatMap((b) => b.label.split('\n')) : [])
          for (const d of drawn.filter((x) => !labelTexts.has(x.text))) {
            expect(d.px, `${name}: ${d.text}`).toBeGreaterThanOrEqual(MIN_MENU_PX)
            // 10 % slack for the approximate 0.6 em glyph width, like the existing menu text test
            const slack = d.box.w * 0.05
            expect(d.box.x + slack, `${name}: ${d.text} left`).toBeGreaterThanOrEqual(0)
            expect(d.box.x + d.box.w - slack, `${name}: ${d.text} right`).toBeLessThanOrEqual(w)
            for (const c of circles) {
              const shrunk = { x: d.box.x + slack, y: d.box.y, w: d.box.w - 2 * slack, h: d.box.h }
              expect(rectsOverlap(shrunk, c), `${name}: "${d.text}" over a button`).toBe(false)
            }
          }
        }
      })
    }
  }

  it('bigger text really is bigger (the start screen subtitle grows with the scale)', () => {
    const px = (scale: number) => { setScale(scale); resetStartScreen(); const r = record(1280, 720); renderStartScreen(r.ctx, base(), 10_000, () => {}); return r.drawn.find((d) => /Swat/.test(d.text))!.px }
    expect(px(1.25)).toBeGreaterThan(px(1))
    expect(px(1.5)).toBeGreaterThanOrEqual(px(1.25))
  })
})

describe('the real HUD draws inside the canvas', () => {
  for (const [w, h] of SIZES) {
    for (const scale of TEXT_SCALES) {
      it(`${w}x${h} at ${scale}x`, () => {
        setScale(scale)
        const r = record(w, h)
        const st: GameState = { ...createInitialState(3), phase: 'playing', score: 99999, combo: 3, roundTimeMs: 45_000 }
        renderHUD(r.ctx, st, 1000, { pulse: createHudPulse() })
        expect(r.drawn.length).toBeGreaterThanOrEqual(5)
        for (const d of r.drawn) {
          expect(d.px).toBeGreaterThanOrEqual(MIN_HUD_PX * 0.99)
          expect(inside(d.box, w, h), `${d.text}`).toBe(true)
        }
        // none of the HUD texts overlap each other
        const boxes = r.drawn.filter((d) => !/[🔊🔇]/u.test(d.text))
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          expect(rectsOverlap(boxes[i].box, boxes[j].box), `${boxes[i].text} / ${boxes[j].text}`).toBe(false)
        }
      })
    }
  }
})

describe('raised-hand rules still hold with bigger text (motion-ui-ergonomics R1.1)', () => {
  it('every button centre stays at or above 40 % of the height at 640x480 and 1280x720', () => {
    const screens: ScreenId[] = ['start', 'summary', 'gameover', 'victory', 'preview']
    for (const scale of TEXT_SCALES) {
      setScale(scale)
      for (const [W, H] of SIZES) for (const s of screens) {
        for (const b of buttonLayout(s, W, H)) expect(b.cy, `${s} ${b.id} ${scale}x ${W}`).toBeLessThanOrEqual(MAX_CENTRE_Y * H + 0.5)
        const mute = muteRectOf(s, W)
        for (const b of buttonLayout(s, W, H)) expect(rectsOverlap(mute, circleRect(b)), `${s} ${b.id} mute`).toBe(false)
      }
    }
  })
})
