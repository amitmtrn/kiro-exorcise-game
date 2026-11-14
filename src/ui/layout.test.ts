import { describe, it, expect } from 'vitest'
import { buttonLayout, areaButtons, fitFontPx, previewCardRect, soundHintRect, SCREENS_2P } from './layout'

const ids = (s: Parameters<typeof buttonLayout>[0], W = 1280, H = 720) => buttonLayout(s, W, H).map((b) => b.id)

describe('layout slot assignment', () => {
  it('start: 1 PLAYER left, 2 PLAYERS right (mirror-correct, display coordinates)', () => {
    const [one, two] = buttonLayout('start', 1280, 720)
    expect(one.id).toBe('one'); expect(two.id).toBe('two')
    expect(one.cx).toBeLessThan(640); expect(two.cx).toBeGreaterThan(640)
    expect(one.cx).toBeCloseTo(0.12 * 1280); expect(two.cx).toBeCloseTo(0.88 * 1280)
  })
  it('end screens list safe actions before destructive ones', () => {
    expect(ids('gameover')).toEqual(['offer', 'retry', 'menu'])
    expect(ids('victory')).toEqual(['offer', 'again', 'menu'])
    expect(ids('preview')).toEqual(['toggle', 'close', 'save'])
  })
  it('only SAVE and MENU / MAIN MENU are destructive', () => {
    for (const s of ['start', 'summary', 'gameover', 'victory', 'preview', 'summary2p', 'final2p', 'preview2p'] as const) {
      for (const b of buttonLayout(s, 1280, 720)) expect(b.destructive).toBe(b.id === 'save' || b.id === 'menu')
    }
  })
  it('the preview without a photo has no toggle', () => {
    expect(buttonLayout('preview', 1280, 720, { hasPhoto: false }).map((b) => b.id)).toEqual(['close', 'save'])
    expect(buttonLayout('preview', 1280, 720, { noPhoto: true })[0].label).toContain('PHOTO')
    expect(buttonLayout('preview', 1280, 720, { noPhoto: true })[0].label).not.toContain('NO')
  })
  it('2P screens list P1 then P2 in full-canvas coordinates, each inside its half', () => {
    for (const s of SCREENS_2P) {
      const bs = buttonLayout(s, 1280, 720)
      expect(bs.filter((b) => b.seat === 0).every((b) => b.cx < 640)).toBe(true)
      expect(bs.filter((b) => b.seat === 1).every((b) => b.cx > 640)).toBe(true)
    }
  })
  it('640x480 2P: circles of a half are a radius apart and inner columns far apart', () => {
    const bs = buttonLayout('final2p', 640, 480)
    expect(bs.length).toBe(6)
    const inner = bs.filter((b) => b.id === 'menu')
    expect(Math.abs(inner[0].cx - inner[1].cx)).toBeGreaterThanOrEqual(3 * inner[0].r)
  })
  it('area layout equals full layout shifted by the half offset', () => {
    const full = buttonLayout('preview2p', 1001, 600).filter((b) => b.seat === 1)
    const loc = areaButtons('preview2p', 500, 600, 1)
    full.forEach((b, i) => expect(b.cx).toBeCloseTo(loc[i].cx + 500))
  })
})

describe('helpers', () => {
  it('fitFontPx shrinks long text and never grows it', () => {
    expect(fitFontPx('AB', 40, 1000)).toBe(40)
    expect(fitFontPx('A'.repeat(20), 100, 120)).toBeCloseTo(10)
  })
  it('preview card sits between the columns', () => {
    const c = previewCardRect(1280, 720, null)
    expect(c.x).toBeGreaterThan(0.12 * 1280)
    expect(c.x + c.w).toBeLessThan(0.88 * 1280)
    expect(c.h).toBeLessThanOrEqual(0.8 * 720 + 1e-9)
  })
  it('sound hint is at the top centre', () => {
    const h = soundHintRect(1280, 720)
    expect(h.y).toBeLessThan(20)
    expect(h.x + h.w / 2).toBeCloseTo(640)
  })
})
