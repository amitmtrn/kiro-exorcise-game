import { describe, it, expect } from 'vitest'
import {
  layoutCard, buildCardTexts, fitText, coverRect, scaleToFit, estimateWidth, textExtent,
  DEFAULT_CARD_W, DEFAULT_CARD_H,
} from './layout'

const data = { score: 12345, bestCombo: 3, stage: 5, stageCount: 5, banished: 87, rank: 'Master Exorcist' }

describe('buildCardTexts', () => {
  it('formats the four rows and the title', () => {
    const t = buildCardTexts(data)
    expect(t.title).toBe('EXORCIST')
    expect(t.rank).toBe('Master Exorcist')
    expect(t.rows).toEqual([
      { label: 'Score', value: '12,345' },
      { label: 'Best combo', value: 'x3' },
      { label: 'Stage reached', value: '5 / 5' },
      { label: 'Banished', value: '87' },
    ])
  })

  it('clamps nonsense numbers', () => {
    const t = buildCardTexts({ ...data, score: -5, banished: NaN, bestCombo: 0 })
    expect(t.rows[0].value).toBe('0')
    expect(t.rows[3].value).toBe('0')
    expect(t.rows[1].value).toBe('x1')
  })
})

describe('layoutCard', () => {
  const L = layoutCard(DEFAULT_CARD_W, DEFAULT_CARD_H, buildCardTexts(data))

  it('stacks title, photo, rank, rows, footer top to bottom', () => {
    expect(L.title.y).toBeLessThan(L.photo.y)
    expect(L.photo.y + L.photo.h).toBeLessThan(L.rank.y)
    expect(L.rank.y).toBeLessThan(L.rows[0].label.y)
    for (let i = 1; i < L.rows.length; i++) expect(L.rows[i].label.y).toBeGreaterThan(L.rows[i - 1].label.y)
    expect(L.rows[3].label.y).toBeLessThan(L.footer.y)
  })

  it('centres the title and puts labels left, values right', () => {
    expect(L.title.align).toBe('center')
    expect(L.title.x).toBe(DEFAULT_CARD_W / 2)
    for (const r of L.rows) {
      expect(r.label.align).toBe('left')
      expect(r.value.align).toBe('right')
      expect(r.label.x).toBeLessThan(r.value.x)
    }
  })

  it('keeps the photo inside the inner frame', () => {
    expect(L.photo.x).toBeGreaterThan(L.frameInner.x)
    expect(L.photo.x + L.photo.w).toBeLessThan(L.frameInner.x + L.frameInner.w)
  })

  it('is deterministic', () => {
    expect(layoutCard(600, 840, buildCardTexts(data))).toEqual(L)
  })

  it('left label and right value of a row never overlap', () => {
    for (const r of L.rows) {
      expect(textExtent(r.label).right).toBeLessThanOrEqual(textExtent(r.value).left + 1e-9)
    }
  })
})

describe('fitText', () => {
  it('keeps short text at the base size', () => {
    expect(fitText('Hi', 500, 40, 10)).toEqual({ text: 'Hi', px: 40 })
  })
  it('shrinks long text before truncating', () => {
    const r = fitText('Grand Exorcist of Everything', 300, 60, 10)
    expect(r.text).toBe('Grand Exorcist of Everything')
    expect(r.px).toBeLessThan(60)
    expect(estimateWidth(r.text, r.px)).toBeLessThanOrEqual(300 + 1e-9)
  })
  it('truncates with an ellipsis at the minimum size', () => {
    const r = fitText('x'.repeat(200), 100, 40, 10)
    expect(r.px).toBe(10)
    expect(r.text.endsWith('…')).toBe(true)
    expect(estimateWidth(r.text, r.px)).toBeLessThanOrEqual(100)
  })
  it('returns empty text when nothing fits', () => {
    expect(fitText('abc', 1, 40, 10).text).toBe('')
    expect(fitText('abc', 0, 40, 10).text).toBe('')
  })
})

describe('coverRect', () => {
  it('crops the sides of a wide source into a portrait target (centred)', () => {
    const r = coverRect(640, 480, 300, 400)
    expect(r.h).toBe(480)
    expect(r.w / r.h).toBeCloseTo(300 / 400)
    expect(r.x).toBeCloseTo((640 - r.w) / 2)
  })
  it('crops the top and bottom of a tall source into a wide target', () => {
    const r = coverRect(300, 600, 400, 200)
    expect(r.w).toBe(300)
    expect(r.w / r.h).toBeCloseTo(2)
    expect(r.y).toBeCloseTo((600 - r.h) / 2)
  })
  it('is the whole source when aspects match', () => {
    expect(coverRect(640, 480, 320, 240)).toEqual({ x: 0, y: 0, w: 640, h: 480 })
  })
})

describe('scaleToFit', () => {
  it('scales down keeping the aspect ratio, never up', () => {
    expect(scaleToFit(1920, 1080, 640)).toEqual({ w: 640, h: 360 })
    expect(scaleToFit(320, 240, 640)).toEqual({ w: 320, h: 240 })
  })
})
