/**
 * Routes a canvas pointer-down to the mute button or a card control (two-player-card R1.8).
 * Pure apart from the injected callbacks, so it is unit-testable without a DOM.
 */

export interface PointerRouteDeps {
  twoPlayer: boolean
  /** Mute button rect for the current mode. */
  muteRect: { x: number; y: number; w: number; h: number }
  toggleMute: () => void
  /** 1P card offer / preview click. */
  cardPointer: (x: number, y: number) => unknown
  cardPreviewOpen: () => boolean
  /** 2P per-half card click. */
  seatCardPointer: (x: number, y: number) => unknown
}

export function routePointer(x: number, y: number, d: PointerRouteDeps): void {
  if (!d.twoPlayer) {
    d.cardPointer(x, y) // card offer / preview buttons (1P end screens only)
    if (d.cardPreviewOpen()) return // the preview covers the HUD, so its mute button is not clickable
  }
  const r = d.muteRect
  if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
    d.toggleMute() // the mute button is drawn above the card layers, so it wins
    return
  }
  if (d.twoPlayer) d.seatCardPointer(x, y)
}
