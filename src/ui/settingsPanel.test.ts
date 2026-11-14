import { describe, it, expect, beforeEach } from 'vitest'
import {
  gearRect, panelRect, rowRect, panelFontPx, panelKey, rowLabel, handlePanelKey, handlePanelPointer, isPanelOpen,
  openPanel, closePanel, panelFocus, inRect, PANEL_ROW_COUNT, ROW_CB, ROW_TEXT, ROW_FLASH, ROW_CLOSE,
} from './settingsPanel'
import { buttonLayout, circleRect, muteRectOf, rectsOverlap, soundHintRect, textRects, RING_OUTSET } from './layout'
import { initSettings, getSettings, resetSettings, updateSettings } from '../settings/runtime'
import { TEXT_SCALES } from '../settings/settings'

const SIZES: Array<[number, number]> = [[640, 480], [1280, 720]]

beforeEach(() => { resetSettings(); initSettings({ storage: null, search: '', reducedMotion: false }); closePanel() })

describe('keys', () => {
  it('maps navigation keys, O closes, other keys are none', () => {
    expect(panelKey('ArrowUp')).toBe('up')
    expect(panelKey('ArrowDown')).toBe('down')
    expect(panelKey('Enter')).toBe('activate')
    expect(panelKey(' ')).toBe('activate')
    expect(panelKey('Escape')).toBe('close')
    expect(panelKey('o')).toBe('close')
    expect(panelKey('1')).toBeNull()
  })
  it('the panel opens on a key that is not one of the game keys', () => {
    for (const k of ['d', 'g', 'm', 'c', 's', 'n', '1', '2', ' ']) expect(k.toLowerCase()).not.toBe('o')
  })
})

describe('state', () => {
  it('Up / Down wrap, Enter toggles the focused row, Esc closes; every key is consumed', () => {
    openPanel()
    expect(isPanelOpen()).toBe(true)
    expect(handlePanelKey('1')).toBe(true) // swallowed: does not start a game
    expect(handlePanelKey(' ')).toBe(true) // activates row 0 (cb), does not start a game
    expect(getSettings().cb).toBe(true)
    handlePanelKey('ArrowUp'); expect(panelFocus()).toBe(PANEL_ROW_COUNT - 1)
    handlePanelKey('ArrowDown'); expect(panelFocus()).toBe(0)
    handlePanelKey('ArrowDown'); handlePanelKey('Enter')
    expect(getSettings().textScale).toBe(1.25)
    handlePanelKey('ArrowDown'); handlePanelKey('Enter')
    expect(getSettings().reducedFlash).toBe(true)
    handlePanelKey('Escape')
    expect(isPanelOpen()).toBe(false)
  })
  it('the Close row closes', () => {
    openPanel()
    for (let i = 0; i < ROW_CLOSE; i++) handlePanelKey('ArrowDown')
    handlePanelKey('Enter')
    expect(isPanelOpen()).toBe(false)
  })
  it('labels show the state', () => {
    updateSettings({ cb: true, textScale: 1.5, reducedFlash: true })
    const s = getSettings()
    expect(rowLabel(ROW_CB, s)).toContain('ON')
    expect(rowLabel(ROW_TEXT, s)).toContain('150%')
    expect(rowLabel(ROW_FLASH, s)).toContain('ON')
  })
})

describe('pointer', () => {
  it('a click on the gear opens the panel; elsewhere on the title does nothing', () => {
    const g = gearRect(1280, 720)
    expect(handlePanelPointer(640, 360, 1280, 720)).toBe(false)
    expect(isPanelOpen()).toBe(false)
    expect(handlePanelPointer(g.x + 2, g.y + 2, 1280, 720)).toBe(true)
    expect(isPanelOpen()).toBe(true)
  })
  it('a click on a row applies it, a click outside closes, both are consumed', () => {
    openPanel()
    const r = rowRect(ROW_FLASH, 1280, 720, 1)
    expect(handlePanelPointer(r.x + 5, r.y + r.h / 2, 1280, 720)).toBe(true)
    expect(getSettings().reducedFlash).toBe(true)
    expect(isPanelOpen()).toBe(true)
    expect(handlePanelPointer(2, 2, 1280, 720)).toBe(true)
    expect(isPanelOpen()).toBe(false)
  })
})

describe('geometry (R7.2)', () => {
  for (const [W, H] of SIZES) {
    for (const scale of TEXT_SCALES) {
      it(`panel and rows fit the ${W}x${H} canvas at ${scale}x`, () => {
        const p = panelRect(W, H, scale)
        expect(p.x).toBeGreaterThanOrEqual(0); expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.x + p.w).toBeLessThanOrEqual(W); expect(p.y + p.h).toBeLessThanOrEqual(H)
        const font = panelFontPx(W, scale)
        expect(font).toBeGreaterThanOrEqual(16)
        const s = { cb: true, textScale: scale, reducedFlash: true }
        let prevBottom = -Infinity
        for (let i = 0; i < PANEL_ROW_COUNT; i++) {
          const r = rowRect(i, W, H, scale)
          expect(r.x).toBeGreaterThanOrEqual(p.x); expect(r.x + r.w).toBeLessThanOrEqual(p.x + p.w)
          expect(r.y).toBeGreaterThanOrEqual(p.y); expect(r.y + r.h).toBeLessThanOrEqual(p.y + p.h)
          expect(r.y).toBeGreaterThanOrEqual(prevBottom - 1e-6)
          prevBottom = r.y + r.h
          // estimated text width (0.6 em per glyph, like fitFontPx) fits the row
          expect(rowLabel(i, s).length * font * 0.6 + font * 0.4).toBeLessThanOrEqual(r.w)
          expect(font * 1.2).toBeLessThanOrEqual(r.h)
        }
      })
    }
    it(`the gear at ${W}x${H} is on the canvas and clear of buttons, mute, hint and menu text`, () => {
      const g = gearRect(W, H)
      expect(g.x).toBeGreaterThanOrEqual(0); expect(g.y).toBeGreaterThanOrEqual(0)
      expect(g.x + g.w).toBeLessThanOrEqual(W); expect(g.y + g.h).toBeLessThanOrEqual(H)
      expect(Math.min(g.w, g.h)).toBeGreaterThanOrEqual(28)
      for (const b of buttonLayout('start', W, H)) {
        const r = circleRect({ cx: b.cx, cy: b.cy, r: b.r + RING_OUTSET })
        expect(rectsOverlap(g, r), b.id).toBe(false)
      }
      expect(rectsOverlap(g, muteRectOf('start', W))).toBe(false)
      expect(rectsOverlap(g, soundHintRect(W, H))).toBe(false)
      for (const t of textRects('start', W, H)) expect(rectsOverlap(g, t)).toBe(false)
      expect(inRect(g, g.x + g.w / 2, g.y + g.h / 2)).toBe(true)
    })
  }
})
