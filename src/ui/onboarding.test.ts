/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  guideGeometry, drawGuide, GUIDE_HANDS_LINE, classifyCameraError, DENIED_TITLE, DENIED_LEAD, DENIED_INSTRUCTIONS,
} from './onboarding'
import { PRIVACY_LINE } from '../game/onboarding'
import { buttonLayout, soundHintRect, rectsOverlap, circleRect, SOUND_HINT } from './layout'

describe('guideGeometry', () => {
  it('keeps head, shoulders and hands inside common canvases', () => {
    for (const [w, h] of [[1280, 720], [1920, 1080], [800, 600], [390, 844]]) {
      const g = guideGeometry(w, h)
      expect(g.head.cx - g.head.rx).toBeGreaterThan(0)
      expect(g.head.cx + g.head.rx).toBeLessThan(w)
      expect(g.head.cy - g.head.ry).toBeGreaterThan(0)
      expect(g.shoulders.cx - g.shoulders.r).toBeGreaterThanOrEqual(0)
      expect(g.shoulders.cx + g.shoulders.r).toBeLessThanOrEqual(w)
      expect(g.hands).toHaveLength(2)
      for (const hd of g.hands) {
        expect(hd.cx - hd.r).toBeGreaterThan(0)
        expect(hd.cx + hd.r).toBeLessThan(w)
        expect(hd.cy - hd.r).toBeGreaterThan(0)
        expect(hd.cy + hd.r).toBeLessThan(h)
      }
    }
  })

  it('is mirror-symmetric and has the head above the shoulders', () => {
    const g = guideGeometry(1280, 720)
    expect(g.head.cx).toBe(640)
    expect(g.hands[0].cx + g.hands[1].cx).toBeCloseTo(1280)
    expect(g.head.cy + g.head.ry).toBeLessThan(g.shoulders.cy - g.shoulders.r)
  })

  it('keeps hand targets above the bottom-anchored panel (top ~60 % of the canvas)', () => {
    for (const [w, h] of [[1280, 720], [1920, 1080], [800, 600], [390, 844]]) {
      const g = guideGeometry(w, h)
      for (const hd of g.hands) expect(hd.cy + hd.r).toBeLessThan(h * 0.6)
      expect(g.shoulders.cy - g.shoulders.r).toBeLessThan(h * 0.6)
    }
  })

  it('stays in bounds for any reasonable canvas size (property)', () => {
    fc.assert(fc.property(fc.integer({ min: 200, max: 4000 }), fc.integer({ min: 200, max: 4000 }), (w, h) => {
      const g = guideGeometry(w, h)
      for (const hd of g.hands) {
        expect(hd.cx - hd.r).toBeGreaterThanOrEqual(0)
        expect(hd.cx + hd.r).toBeLessThanOrEqual(w)
        expect(hd.cy + hd.r).toBeLessThanOrEqual(h)
      }
      expect(g.head.cx - g.head.rx).toBeGreaterThanOrEqual(0)
      expect(g.head.cx + g.head.rx).toBeLessThanOrEqual(w)
      expect(g.shoulders.cx - g.shoulders.r).toBeGreaterThanOrEqual(0)
    }))
  })
})

describe('classifyCameraError', () => {
  it('maps permission errors to blocked', () => {
    expect(classifyCameraError({ name: 'NotAllowedError' })).toBe('blocked')
    expect(classifyCameraError({ name: 'SecurityError' })).toBe('blocked')
    expect(classifyCameraError(new DOMException('x', 'NotAllowedError'))).toBe('blocked')
  })
  it('maps everything else to unavailable', () => {
    expect(classifyCameraError({ name: 'NotFoundError' })).toBe('unavailable')
    expect(classifyCameraError({ name: 'NotReadableError' })).toBe('unavailable')
    expect(classifyCameraError(new Error('boom'))).toBe('unavailable')
    expect(classifyCameraError(null)).toBe('unavailable')
    expect(classifyCameraError('x')).toBe('unavailable')
  })
})

describe('camera-denied copy', () => {
  const all = [DENIED_TITLE, ...Object.values(DENIED_LEAD), ...DENIED_INSTRUCTIONS, PRIVACY_LINE].join('\n')
  it('is link-free', () => {
    expect(all).not.toMatch(/https?:|chrome:|about:|www\.|<a\b|href/i)
  })
  it('tells the player how to fix it and ends with Try again', () => {
    expect(DENIED_INSTRUCTIONS.length).toBeGreaterThanOrEqual(3)
    expect(DENIED_INSTRUCTIONS.join(' ')).toMatch(/Allow/)
    expect(DENIED_INSTRUCTIONS[DENIED_INSTRUCTIONS.length - 1]).toMatch(/Try again/)
  })
})

describe('guide hand targets = start-screen button zones (motion-ui-ergonomics R7.1)', () => {
  it('equal the layout centres and radii for random canvas sizes', () => {
    fc.assert(fc.property(fc.integer({ min: 640, max: 2560 }), fc.integer({ min: 480, max: 1440 }), (w, h) => {
      const g = guideGeometry(w, h)
      const zones = buttonLayout('start', w, h)
      expect(g.hands).toEqual(zones.map((z) => ({ cx: z.cx, cy: z.cy, r: z.r })))
      for (const z of zones) expect(z.cy).toBeLessThanOrEqual(0.4 * h)
    }), { numRuns: 200 })
  })

  it('drawGuide writes the "Wave a hand" line', () => {
    const texts: string[] = []
    const ctx = new Proxy({ canvas: { width: 1280, height: 720 } } as Record<string, unknown>, {
      get(t, k: string) {
        if (k === 'fillText') return (x: string) => { texts.push(x) }
        return k in t ? t[k] : () => undefined
      },
      set(t, k: string, v) { t[k] = v; return true },
    }) as unknown as CanvasRenderingContext2D
    drawGuide(ctx, false, 0)
    expect(texts).toContain(GUIDE_HANDS_LINE)
    expect(GUIDE_HANDS_LINE).toBe('Wave a hand over the glowing circles to press them')
  })
})

describe('sound-unlock hint (motion-ui-ergonomics R6.1)', () => {
  const sources = import.meta.glob<string>(['../main.ts', '../style.css'], { query: '?raw', import: 'default', eager: true })
  it('is placed from the layout constants (top centre), not at the bottom, and never intersects a button', () => {
    const main = sources['../main.ts']
    expect(main).toContain('SOUND_HINT.topFrac')
    expect(main).toContain('SOUND_HINT.maxWidthFrac')
    expect(main).toContain('soundHintFontPx(gameCanvas.width)') // font from the same model as soundHintRect
    expect(main).toContain('createSoundHintController') // auto-hides for webcam-only players (R6.2), tested in soundHint.test.ts
    expect(sources['../style.css']).not.toMatch(/\.sound-hint[^}]*font-size:\s*clamp/)
    expect(SOUND_HINT.topFrac).toBeLessThan(0.05)
    for (const screen of ['start', 'summary', 'gameover', 'victory', 'preview', 'summary2p', 'final2p', 'preview2p'] as const) {
      for (const [w, h] of [[640, 480], [1280, 720], [2560, 1440]]) {
        const hint = soundHintRect(w, h)
        for (const b of buttonLayout(screen, w, h)) expect(rectsOverlap(hint, circleRect(b))).toBe(false)
      }
    }
  })
})
