import { describe, it, expect, vi } from 'vitest'
import { routePointer } from './pointerRoute'
import type { PointerRouteDeps } from './pointerRoute'

function deps(over: Partial<PointerRouteDeps> = {}): PointerRouteDeps {
  return {
    twoPlayer: false,
    muteRect: { x: 100, y: 10, w: 40, h: 40 },
    toggleMute: vi.fn(),
    cardPointer: vi.fn(),
    cardPreviewOpen: () => false,
    seatCardPointer: vi.fn(),
    ...over,
  }
}

describe('routePointer', () => {
  it('2P: mute wins over a card button underneath it', () => {
    const d = deps({ twoPlayer: true })
    routePointer(120, 30, d)
    expect(d.toggleMute).toHaveBeenCalledTimes(1)
    expect(d.seatCardPointer).not.toHaveBeenCalled()
  })

  it('2P: a click elsewhere goes to the seat cards only', () => {
    const d = deps({ twoPlayer: true })
    routePointer(300, 300, d)
    expect(d.seatCardPointer).toHaveBeenCalledWith(300, 300)
    expect(d.cardPointer).not.toHaveBeenCalled()
    expect(d.toggleMute).not.toHaveBeenCalled()
  })

  it('1P: card click path; mute still works; an open preview blocks mute', () => {
    const d = deps()
    routePointer(120, 30, d)
    expect(d.cardPointer).toHaveBeenCalledWith(120, 30)
    expect(d.toggleMute).toHaveBeenCalledTimes(1)
    expect(d.seatCardPointer).not.toHaveBeenCalled()
    const o = deps({ cardPreviewOpen: () => true })
    routePointer(120, 30, o)
    expect(o.toggleMute).not.toHaveBeenCalled()
  })
})
