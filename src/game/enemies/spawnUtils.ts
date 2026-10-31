/**
 * Shared helpers for enemy spawning.
 */

/** Distance from the center within which targets are randomly placed. */
const TARGET_RADIUS = 120

/** Picks a random spawn point along the four screen edges, offset outside by `margin` px. */
export function randomEdgeSpawn(
  canvasW: number,
  canvasH: number,
  margin: number,
): { x: number; y: number } {
  const edge = Math.floor(Math.random() * 4)
  switch (edge) {
    case 0: // top
      return { x: Math.random() * canvasW, y: -margin }
    case 1: // right
      return { x: canvasW + margin, y: Math.random() * canvasH }
    case 2: // bottom
      return { x: Math.random() * canvasW, y: canvasH + margin }
    default: // left
      return { x: -margin, y: Math.random() * canvasH }
  }
}

/** Returns a target near the screen center (within TARGET_RADIUS px). */
export function centerTarget(
  canvasW: number,
  canvasH: number,
): { tx: number; ty: number } {
  const angle = Math.random() * Math.PI * 2
  const dist = Math.random() * TARGET_RADIUS
  return {
    tx: canvasW / 2 + Math.cos(angle) * dist,
    ty: canvasH / 2 + Math.sin(angle) * dist,
  }
}

/** Generate a short unique id without DOM dependency. */
export function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}
