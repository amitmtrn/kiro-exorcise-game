import { describe, it, expect, afterEach } from 'vitest'
import { RING_OUTSET } from './layout'
import { initSettings, resetSettings } from '../settings/runtime'
import { cardKeyAction, previewLayout, buttonAt, CARD_ASPECT, lockEndButtons, endButtonsLive, PREVIEW_INPUT_DELAY_MS, CardPreview, offerButton, offerHit } from './cardScreen'

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
    expect(previewLayout(1280, 720, false, true).buttons.map((b) => b.id)).toEqual(['toggle', 'close', 'save'])
    expect(previewLayout(1280, 720, false, false).buttons.map((b) => b.id)).toEqual(['close', 'save'])
  })

  it('labels the toggle by the current mode', () => {
    expect(previewLayout(1280, 720, false, true).buttons[0].label).toContain('NO\nPHOTO')
    expect(previewLayout(1280, 720, true, true).buttons[0].label).toContain('PHOTO')
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
    expect(buttonAt(L.buttons, b.cx + b.r, b.cy)).toBe('toggle')
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
  it('keeps a usable radius and buttons a radius apart at 390 px wide', () => {
    const L = previewLayout(390, 844, false, true)
    for (const b of L.buttons) expect(b.r).toBeGreaterThanOrEqual(20)
    for (let i = 0; i < L.buttons.length; i++) for (let j = i + 1; j < L.buttons.length; j++) {
      const d = Math.hypot(L.buttons[i].cx - L.buttons[j].cx, L.buttons[i].cy - L.buttons[j].cy)
      expect(d).toBeGreaterThanOrEqual(3 * L.buttons[i].r - 1e-9)
    }
  })

  it('SAVE is in raised-hand height, alone in its column and has the longer dwell', () => {
    const L = previewLayout(1280, 720, false, true)
    const save = L.buttons.find((b) => b.id === 'save')!
    expect(save.cy).toBeLessThanOrEqual(0.4 * 720)
    expect(save.destructive).toBe(true)
  })
})

describe('offer geometry and preview reopen (review fixes)', () => {
  it('the offer button is positioned from its layout spec and hit-tested by clicks', () => {
    const spec = { id: 'offer', label: 'x', cx: 100, cy: 100, r: 40, destructive: false, seat: null }
    const b = offerButton(spec)
    expect([b.cx, b.cy, b.radius]).toEqual([100, 100, 40])
    expect(offerHit(110, 100)).toBe(true)
    expect(offerHit(150, 100)).toBe(false)
  })
  it('open() forgets the previous layout so a stale click cannot hit', () => {
    const p = new CardPreview()
    ;(p as unknown as { lastLayout: unknown }).lastLayout = previewLayout(600, 800, false, true)
    const b = previewLayout(600, 800, false, true).buttons[0]
    expect(p.hit(b.cx, b.cy)).not.toBeNull()
    p.open(0)
    expect(p.hit(b.cx, b.cy)).toBeNull()
  })
})

describe('buttons and rings stay clear of the card (playtest1-fixes R4.2)', () => {
  const sizes: Array<[number, number]> = [[640, 360], [800, 450], [1024, 576], [1280, 720], [1366, 768], [1600, 900], [1920, 1080]]
  const MIN_GAP = 6 // px between a progress ring's outer edge and the card edge
  const gap = (b: { cx: number; cy: number; r: number }, card: { x: number; y: number; w: number; h: number }) => {
    const R = b.r + RING_OUTSET
    const dx = Math.max(card.x - b.cx, 0, b.cx - (card.x + card.w))
    const dy = Math.max(card.y - b.cy, 0, b.cy - (card.y + card.h))
    return Math.hypot(dx, dy) - R
  }
  afterEach(() => resetSettings())
  for (const scale of [0, 2]) { // ?bigtext=0 (1×) and ?bigtext=2 (1.5×)
    it(`1P at text scale ${scale === 0 ? 1 : 1.5}: every ring is ${MIN_GAP}+ px from the card, the card is whole`, () => {
      initSettings({ storage: null, search: `?bigtext=${scale}`, reducedMotion: false })
      for (const [W, H] of sizes) for (const hasPhoto of [true, false]) {
        const L = previewLayout(W, H, false, hasPhoto)
        expect(L.card.x).toBeGreaterThan(0)
        expect(L.card.x + L.card.w).toBeLessThan(W)
        for (const b of L.buttons) expect(gap(b, L.card), `${W}x${H} ${b.id}`).toBeGreaterThanOrEqual(MIN_GAP)
      }
    })
    it(`2P halves at text scale ${scale === 0 ? 1 : 1.5}: the same in each half`, () => {
      initSettings({ storage: null, search: `?bigtext=${scale}`, reducedMotion: false })
      for (const [W, H] of sizes) for (const seat of [0, 1] as const) {
        const L = previewLayout(Math.floor(W / 2), H, false, true, seat)
        for (const b of L.buttons) expect(gap(b, L.card), `${W}x${H} seat ${seat} ${b.id}`).toBeGreaterThanOrEqual(MIN_GAP)
        expect(L.card.x).toBeGreaterThan(0)
        expect(L.card.x + L.card.w).toBeLessThan(Math.floor(W / 2))
      }
    })
  }
})

describe('the preview draws no motion circle other than its buttons (playtest1-fixes R4.1)', () => {
  it('every circle the preview draws is a button body or its ring; the card moon is card art, never a zone', () => {
    const W = 1280, H = 720
    const L = previewLayout(W, H, false, true)
    const circles: Array<{ x: number; y: number; r: number }> = []
    const ctx = new Proxy({ canvas: { width: W, height: H } } as Record<string, unknown>, {
      get(t, k: string) {
        if (k === 'arc') return (x: number, y: number, r: number) => circles.push({ x, y, r })
        if (k === 'drawImage') return () => {} // the card image is drawn, not its inner art, so no moon here
        return k in t ? t[k] : () => ({ width: 10, addColorStop() {} })
      },
      set(t, k: string, v) { t[k] = v; return true },
    }) as unknown as CanvasRenderingContext2D
    const p = new CardPreview(); p.open(0)
    p.render(ctx, 1, {} as CanvasImageSource, false, true)
    for (const c of circles) {
      const owner = L.buttons.find((b) => Math.hypot(c.x - b.cx, c.y - b.cy) < 0.5 && (Math.abs(c.r - b.r) < 0.5 || Math.abs(c.r - (b.r + RING_OUTSET - 3)) < 0.5))
      expect(owner, `circle ${c.x.toFixed(0)},${c.y.toFixed(0)} r${c.r.toFixed(0)} is a button`).toBeDefined()
    }
    // the top-right corner of the card has no button zone
    expect(L.buttons.some((b) => Math.hypot(b.cx - (L.card.x + L.card.w), b.cy - L.card.y) < b.r)).toBe(false)
  })
})
