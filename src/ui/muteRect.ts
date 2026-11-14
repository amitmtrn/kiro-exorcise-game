/**
 * Pure HUD geometry shared by the HUD and the button layout (kept apart from hud.ts so the
 * layout does not depend on the canvas-drawing module).
 */

/** R5.1 — responsive font size: clamp(canvasW / 20, 24, 48). */
export function hudFontSize(canvasW: number): number {
  return Math.max(24, Math.min(48, Math.round(canvasW / 20)))
}

/** Hit rectangle for the mute button (top-right, under the timer). */
export function muteButtonRect(canvasW: number, fontSize: number) {
  const pad = 20
  const size = Math.round(fontSize * 1.1)
  return { x: canvasW - pad - size, y: pad + fontSize + 8, w: size, h: size }
}

/** Hit rectangle for the single shared mute button in two-player mode (top centre, below the HUD row so it overlaps no timer / hearts). */
export function muteButtonRect2P(canvasW: number, fontSize: number) {
  const pad = 20
  const size = Math.round(fontSize * 1.1)
  return { x: Math.round(canvasW / 2 - size / 2), y: pad + fontSize + 8, w: size, h: size }
}

