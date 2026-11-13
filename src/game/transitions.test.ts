import { describe, it, expect } from 'vitest'
import { easeOutBack } from './transitions'

describe('easeOutBack', () => {
  it('maps 0 → 0 and 1 → 1', () => {
    expect(easeOutBack(0)).toBeCloseTo(0, 12)
    expect(easeOutBack(1)).toBeCloseTo(1, 12)
  })
  it('overshoots 1 on the way in and clamps outside [0, 1]', () => {
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map(easeOutBack))).toBeGreaterThan(1)
    expect(easeOutBack(-3)).toBeCloseTo(0, 12)
    expect(easeOutBack(7)).toBeCloseTo(1, 12)
  })
})

import fc from 'fast-check'
import {
  introPose, outroPose, outroRowAlpha,
  INTRO_NAME_MS, INTRO_FADE_MS, OUTRO_OVERLAY_ALPHA, OUTRO_BANNER_REST_Y, OUTRO_ROWS_START_MS,
} from './transitions'
import { renderStageTitle, renderSummary } from '../ui/screens'
import { createInitialState, STAGE_TITLE_DURATION_MS } from './state'
import type { GameState } from './state'

const TOTAL = STAGE_TITLE_DURATION_MS

describe('introPose', () => {
  it('starts with the name off-screen left, the subtitle off-screen right, fully opaque', () => {
    const p = introPose(0, TOTAL)
    expect(p.nameX).toBeCloseTo(-1, 9)
    expect(p.subX).toBeCloseTo(1, 9)
    expect(p.alpha).toBe(1)
  })

  it('rests at the centre once the slide is done', () => {
    const p = introPose(INTRO_NAME_MS + 600, TOTAL)
    expect(p.nameX).toBeCloseTo(0, 9)
    expect(p.subX).toBeCloseTo(0, 9)
    expect(p.alpha).toBe(1)
  })

  it('the name arrives before the subtitle', () => {
    const p = introPose(INTRO_NAME_MS, TOTAL)
    expect(p.nameX).toBeCloseTo(0, 9)
    expect(Math.abs(p.subX)).toBeGreaterThan(0.05)
  })

  it('fades out over the last 300 ms', () => {
    expect(introPose(TOTAL - INTRO_FADE_MS, TOTAL).alpha).toBe(1)
    expect(introPose(TOTAL - INTRO_FADE_MS / 2, TOTAL).alpha).toBeCloseTo(0.5, 9)
    expect(introPose(TOTAL, TOTAL).alpha).toBe(0)
  })

  it('stays finite and alpha stays in [0, 1] for any elapsed time (property)', () => {
    fc.assert(fc.property(fc.double({ min: -500, max: 6000, noNaN: true }), (t) => {
      const p = introPose(t, TOTAL)
      expect(Number.isFinite(p.nameX) && Number.isFinite(p.subX)).toBe(true)
      expect(p.alpha).toBeGreaterThanOrEqual(0)
      expect(p.alpha).toBeLessThanOrEqual(1)
    }))
  })
})

describe('outroPose', () => {
  it('starts with no overlay and a collapsed banner above its resting place', () => {
    const p = outroPose(0)
    expect(p.overlayAlpha).toBe(0)
    expect(p.bannerScale).toBeCloseTo(0, 9)
    expect(p.bannerY).toBeLessThan(OUTRO_BANNER_REST_Y)
  })

  it('the overlay fades in over 500 ms', () => {
    expect(outroPose(250).overlayAlpha).toBeCloseTo(OUTRO_OVERLAY_ALPHA / 2, 9)
    expect(outroPose(500).overlayAlpha).toBeCloseTo(OUTRO_OVERLAY_ALPHA, 9)
    expect(outroPose(5000).overlayAlpha).toBeCloseTo(OUTRO_OVERLAY_ALPHA, 9)
  })

  it('the banner wobbles and settles within 900 ms', () => {
    const early = Math.max(...[0, 20, 40, 60, 80, 100].map((t) => Math.abs(outroPose(t).bannerAngle)))
    expect(early).toBeGreaterThan(0.05)
    for (const t of [900, 1200, 3000]) {
      const p = outroPose(t)
      expect(Math.abs(p.bannerAngle)).toBeLessThan(0.005)
      expect(p.bannerScale).toBeCloseTo(1, 9)
      expect(p.bannerY).toBeCloseTo(OUTRO_BANNER_REST_Y, 9)
    }
  })

  it('stat rows fade in staggered after the banner', () => {
    expect(outroRowAlpha(OUTRO_ROWS_START_MS - 1, 0)).toBe(0)
    expect(outroRowAlpha(OUTRO_ROWS_START_MS + 125, 0)).toBeCloseTo(0.5, 9)
    expect(outroRowAlpha(OUTRO_ROWS_START_MS + 125, 3)).toBe(0)
    expect(outroRowAlpha(3000, 4)).toBe(1)
    expect(outroRowAlpha(900, 1)).toBeLessThan(outroRowAlpha(900, 0))
  })
})

// ── Screens, with a recording canvas context ──────────────────────────────────

interface Rec { texts: Array<{ text: string; x: number; y: number }>; translates: Array<[number, number]>; scales: Array<[number, number]>; alphas: number[] }

function recordingCtx(W = 1000, H = 600): { ctx: CanvasRenderingContext2D; rec: Rec } {
  const rec: Rec = { texts: [], translates: [], scales: [], alphas: [] }
  const props: Record<string, unknown> = { canvas: { width: W, height: H }, globalAlpha: 1 }
  const ctx = new Proxy(props, {
    get(t, k: string) {
      if (k === 'fillText') return (text: string, x: number, y: number) => { rec.texts.push({ text, x, y }); rec.alphas.push(t.globalAlpha as number) }
      if (k === 'translate') return (x: number, y: number) => { rec.translates.push([x, y]) }
      if (k === 'scale') return (x: number, y: number) => { rec.scales.push([x, y]) }
      if (k in t) return t[k]
      return () => undefined
    },
    set(t, k: string, v) { t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, rec }
}

const titleState = (stageTitleMs: number): GameState => ({ ...createInitialState(1), phase: 'stageTitle', stageTitleMs })
const summaryState = (summaryShownMs: number): GameState => ({ ...createInitialState(1), phase: 'summary', summaryShownMs })

describe('renderStageTitle animation', () => {
  it('the stage name starts off-screen left and rests at the centre', () => {
    const start = recordingCtx()
    renderStageTitle(start.ctx, titleState(TOTAL))
    expect(start.rec.texts[0].text).toBe('Stage 1')
    expect(start.rec.texts[0].x).toBeLessThan(0)
    expect(start.rec.texts[1].x).toBeGreaterThan(1000)

    const rest = recordingCtx()
    renderStageTitle(rest.ctx, titleState(TOTAL - 1500))
    expect(rest.rec.texts[0].x).toBeCloseTo(500, 6)
    expect(rest.rec.texts[1].x).toBeCloseTo(500, 6)
  })

  it('still shows the name, subtitle and countdown', () => {
    const { ctx, rec } = recordingCtx()
    renderStageTitle(ctx, titleState(2000))
    expect(rec.texts.map((t) => t.text)).toEqual(['Stage 1', 'The Graveyard', '2'])
  })
})

describe('renderSummary animation', () => {
  it('draws STAGE CLEAR! translated to the banner pose, and BONUS CLEAR! in the bonus round', () => {
    const a = recordingCtx()
    renderSummary(a.ctx, summaryState(2000), 0, () => undefined)
    expect(a.rec.texts[0].text).toBe('STAGE CLEAR!')
    expect(a.rec.translates[0][0]).toBe(500)
    expect(a.rec.translates[0][1]).toBeCloseTo(600 * OUTRO_BANNER_REST_Y, 6)

    const b = recordingCtx()
    renderSummary(b.ctx, { ...summaryState(2000), bonus: true }, 0, () => undefined)
    expect(b.rec.texts[0].text).toBe('BONUS CLEAR!')
  })

  it('the banner drops in from above and the stat rows are hidden until the banner has landed', () => {
    const { ctx, rec } = recordingCtx()
    renderSummary(ctx, summaryState(0), 0, () => undefined)
    expect(rec.translates[0][1]).toBeLessThan(600 * OUTRO_BANNER_REST_Y)
    const alphaOf = (text: string) => rec.alphas[rec.texts.findIndex((t) => t.text === text)]
    expect(alphaOf('Banished')).toBe(0)
    expect(alphaOf('Score')).toBe(0)
    const stars = rec.texts.find((t) => /[⭐☆]/.test(t.text))!
    expect(rec.alphas[rec.texts.indexOf(stars)]).toBe(0)
  })

  it('all stat rows are fully visible once the animation is over', () => {
    const { ctx, rec } = recordingCtx()
    renderSummary(ctx, summaryState(3000), 0, () => undefined)
    expect(rec.texts.some((t) => t.text === 'Banished')).toBe(true)
    expect(rec.alphas.slice(1, 10).every((a) => a === 1)).toBe(true)
  })

  it('the NEXT button still triggers during the animation (R5.3)', async () => {
    const { lastMotionPixels, updateMotionPixels } = await import('../game/collision')
    void lastMotionPixels
    // a dense blob of motion over the NEXT button position (W/2, 0.84 H)
    const points = Array.from({ length: 40 }, (_, i) => ({ x: 160 + (i % 8), y: 150 + Math.floor(i / 8) }))
    updateMotionPixels({ points, sampled: 40, moved: 40, changed: true }, 1000, 600)
    let triggered = false
    for (let t = 0; t <= 1000 && !triggered; t += 100) {
      const { ctx } = recordingCtx()
      renderSummary(ctx, summaryState(100), t, () => { triggered = true })
    }
    expect(triggered).toBe(true)
  })
})
