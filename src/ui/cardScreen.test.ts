import { describe, it, expect } from 'vitest'
import { cardKeyAction, previewLayout, buttonAt, CARD_ASPECT, lockEndButtons, endButtonsLive, PREVIEW_INPUT_DELAY_MS } from './cardScreen'

describe('cardKeyAction', () => {
  it('only C opens the card from the game-over / victory screen', () => {
    expect(cardKeyAction('c', false)).toBe('open')
    expect(cardKeyAction('C', false)).toBe('open')
    for (const k of ['s', 'Enter', 'n', 'Escape', ' ', 'x']) expect(cardKeyAction(k, false)).toBeNull()
  })

  it('maps S / Enter to save, N to the photo toggle, Esc / C to close while open', () => {
    expect(cardKeyAction('s', true)).toBe('save')
    expect(cardKeyAction('S', true)).toBe('save')
    expect(cardKeyAction('Enter', true)).toBe('save')
    expect(cardKeyAction('n', true)).toBe('toggle')
    expect(cardKeyAction('Escape', true)).toBe('close')
    expect(cardKeyAction('c', true)).toBe('close')
    expect(cardKeyAction(' ', true)).toBeNull()
  })
})

describe('previewLayout', () => {
  it('keeps the card and every button inside the canvas', () => {
    for (const [W, H] of [[1280, 720], [800, 600], [390, 844], [1920, 1080]]) {
      const L = previewLayout(W, H, false, true)
      expect(L.card.x).toBeGreaterThanOrEqual(0)
      expect(L.card.x + L.card.w).toBeLessThanOrEqual(W)
      expect(L.card.y + L.card.h).toBeLessThanOrEqual(H)
      expect(L.card.w / L.card.h).toBeCloseTo(CARD_ASPECT)
      for (const b of L.buttons) {
        expect(b.cx - b.r).toBeGreaterThanOrEqual(0)
        expect(b.cx + b.r).toBeLessThanOrEqual(W)
        expect(b.cy + b.r).toBeLessThanOrEqual(H)
      }
    }
  })

  it('offers SAVE, the photo toggle and CLOSE; no toggle without a snapshot', () => {
    expect(previewLayout(1280, 720, false, true).buttons.map((b) => b.id)).toEqual(['save', 'toggle', 'close'])
    expect(previewLayout(1280, 720, false, false).buttons.map((b) => b.id)).toEqual(['save', 'close'])
  })

  it('labels the toggle by the current mode', () => {
    expect(previewLayout(1280, 720, false, true).buttons[1].label).toContain('NO\nPHOTO')
    expect(previewLayout(1280, 720, true, true).buttons[1].label).toContain('PHOTO')
  })
})

describe('buttonAt', () => {
  const L = previewLayout(1280, 720, false, true)
  it('finds the button under a click and ignores empty space', () => {
    for (const b of L.buttons) expect(buttonAt(L.buttons, b.cx, b.cy)).toBe(b.id)
    expect(buttonAt(L.buttons, 1, 1)).toBeNull()
  })
  it('treats the circle edge as inside and just outside as a miss', () => {
    const b = L.buttons[0]
    expect(buttonAt(L.buttons, b.cx + b.r, b.cy)).toBe('save')
    expect(buttonAt(L.buttons, b.cx + b.r + 1, b.cy)).toBeNull()
  })
})

describe('end-screen button lockout (R1.4)', () => {
  it('is not live for PREVIEW_INPUT_DELAY_MS after the preview opens or closes', () => {
    lockEndButtons(1000)
    expect(endButtonsLive(1000)).toBe(false)
    expect(endButtonsLive(1000 + PREVIEW_INPUT_DELAY_MS - 1)).toBe(false)
    expect(endButtonsLive(1000 + PREVIEW_INPUT_DELAY_MS)).toBe(true)
  })
})

describe('preview buttons on a narrow portrait canvas', () => {
  it('keeps a usable radius and non-overlapping buttons at 390 px wide', () => {
    const L = previewLayout(390, 844, false, true)
    for (const b of L.buttons) expect(b.r).toBeGreaterThanOrEqual(36)
    for (let i = 1; i < L.buttons.length; i++) {
      expect(L.buttons[i].cx - L.buttons[i - 1].cx).toBeGreaterThanOrEqual(L.buttons[i].r * 2)
    }
  })
})
