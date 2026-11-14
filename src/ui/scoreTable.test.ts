import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { tableRows, endRows, pageAt, pageCount, drawTable, rowText, PAGE_MS } from './scoreTable'
import type { ScoreEntry } from '../game/highScores'
import { titleTableBox, endTableBox } from './screens'
import { buttonLayout, textRects, rectsOverlap, circleRect, muteRectOf, TEXT_LOW_TOP } from './layout'
import { initSettings, resetSettings } from '../settings/runtime'

const t = (n: number): ScoreEntry[] => Array.from({ length: n }, (_, i) => ({
  id: 'e' + i, name: 'BOO-' + String(i).padStart(2, '0'), score: 1000 - i * 10, stage: 1 + (i % 6), date: '2025-10-31', mode: i % 2 ? '2P' : '1P',
}))

function recorder(w = 1280, h = 720) {
  const texts: Array<{ text: string; x: number; y: number; font: string }> = []
  const store: Record<string, unknown> = { canvas: { width: w, height: h }, font: '' }
  const ctx = new Proxy(store, {
    get: (s, k: string) => (k === 'fillText' ? (text: string, x: number, y: number) => texts.push({ text, x, y, font: String(s.font) }) : k in s ? s[k] : () => ({ width: 10 })),
    set: (s, k: string, v) => { s[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, texts }
}
beforeEach(() => resetSettings())
afterAll(() => resetSettings())

describe('rows', () => {
  it('pages of five, switching every 4 s; one page never switches', () => {
    expect(pageCount(t(10))).toBe(2)
    expect(pageAt(t(10), 0)).toBe(0)
    expect(pageAt(t(10), PAGE_MS)).toBe(1)
    expect(pageAt(t(10), 2 * PAGE_MS)).toBe(0)
    expect(pageAt(t(4), PAGE_MS)).toBe(0)
    expect(tableRows(t(10), 1).map((r) => r.rank)).toEqual([6, 7, 8, 9, 10])
    expect(tableRows([], 0)).toEqual([])
  })
  it('end rows: top 5 plus the own entry with its rank', () => {
    const rows = endRows(t(10), ['e8'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 9])
    expect(rows[5].own).toBe(true)
    expect(endRows(t(10), ['e1']).filter((r) => r.own).map((r) => r.rank)).toEqual([2])
    expect(endRows(t(10), ['nope'])).toHaveLength(5)
  })
  it('row text shows rank, name, score, stage and mode', () => {
    expect(rowText(tableRows(t(2), 0)[1])).toBe(' 2. BOO-01        990  S2 2P')
  })
})

describe('drawing', () => {
  it('draws a heading and the rows inside the box, own rows marked', () => {
    const { ctx, texts } = recorder()
    const box = titleTableBox(1280, 720)
    drawTable(ctx, endRows(t(6), ['e2']), box, 'HIGH SCORES')
    expect(texts[0].text).toBe('HIGH SCORES')
    expect(texts).toHaveLength(6)
    expect(texts.filter((x) => x.text.startsWith('▶'))).toHaveLength(1)
    for (const x of texts) { expect(x.y).toBeGreaterThanOrEqual(box.y); expect(x.y).toBeLessThanOrEqual(box.y + box.h) }
  })
  it('nothing is drawn for an empty table', () => {
    const { ctx, texts } = recorder()
    drawTable(ctx, [], titleTableBox(1280, 720), 'HIGH SCORES')
    expect(texts).toEqual([])
  })
  it('bigger text setting gives a bigger font, still fitted to the box width', () => {
    const px = (search: string) => {
      initSettings({ storage: null, search, reducedMotion: false })
      const { ctx, texts } = recorder()
      drawTable(ctx, tableRows(t(1), 0), { x: 0, y: 0, w: 2000, h: 400 })
      return parseInt(texts[0].font.match(/(\d+)px/)![1], 10)
    }
    expect(px('?bigtext=2')).toBeGreaterThan(px('?bigtext=0'))
  })
})

describe('boxes stay clear of buttons and the mute button (R10.3)', () => {
  for (const [W, H] of [[640, 480], [1280, 720], [1920, 1080]]) {
    it(`${W}×${H}`, () => {
      const title = titleTableBox(W, H)
      expect(title.y + title.h).toBeLessThanOrEqual(TEXT_LOW_TOP * H)
      for (const b of buttonLayout('start', W, H)) expect(rectsOverlap(circleRect(b), title)).toBe(false)
      expect(rectsOverlap(muteRectOf('start', W), title)).toBe(false)
      for (const [screen, top] of [['gameover', 0.58], ['victory', 0.65]] as const) {
        const box = endTableBox(W, H, top)
        for (const b of buttonLayout(screen, W, H)) expect(rectsOverlap(circleRect(b), box)).toBe(false)
        // inside the text rects the layout reserves for this screen
        expect(textRects(screen, W, H).some((r) => box.x >= r.x - 1e-9 && box.x + box.w <= r.x + r.w + 1e-9 && box.y >= r.y - 1e-9)).toBe(true)
      }
    })
  }
})
