/**
 * Enemy paths (waves spec) — pure, closed-form functions of accumulated path
 * time and canvas size. No per-tick integration, so the position cannot depend
 * on the frame rate, and every length is a fraction of W / H (or canvas
 * heights), so it cannot depend on the canvas size either.
 */

export type PathKind = 'line' | 'arc' | 'flyby' | 'drop'
export type WavePath = PathKind | 'swarm'
export const WAVE_PATHS: readonly WavePath[] = ['line', 'arc', 'flyby', 'drop', 'swarm']

export interface PathSpec {
  kind: PathKind
  /** Start and end as fractions of canvas W / H (may lie outside 0..1). */
  x0: number
  y0: number
  x1: number
  y1: number
  /** Arc bulge, canvas heights (signed). */
  bend: number
  /** Lateral sway amplitude, canvas heights. */
  wobble: number
  /** Sway rate, rad / s. */
  wobbleRate: number
  phase: number
  /** Mean speed along the chord, canvas heights / s. */
  speed: number
}

export type Rand = () => number
export type Edges = 'leftRight' | 'all'

export interface PathOptions {
  W: number
  H: number
  /** Canvas heights / s along the chord. */
  speed: number
  rand?: Rand
  edges?: Edges
  /** flyby height as a fraction of H (default random 0.15–0.8). */
  height?: number
  /** flyby direction; default random. */
  dir?: 'ltr' | 'rtl'
  /** drop: fall through the bottom edge instead of landing. */
  through?: boolean
}

const MARGIN_H = 0.12
const MIN_MARGIN_PX = 64

/** The extended box every position must stay in: the canvas plus this many px. */
export function marginPx(H: number): number {
  return Math.max(MARGIN_H * H, MIN_MARGIN_PX)
}

/** Start / exit points sit 90 % of the margin out, leaving room for lane offsets and sway. */
function entryPx(H: number): number {
  return 0.9 * marginPx(H)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const between = (r: Rand, a: number, b: number) => lerp(a, b, r())

function chordPx(p: PathSpec, W: number, H: number): number {
  return Math.hypot((p.x1 - p.x0) * W, (p.y1 - p.y0) * H)
}

/** Total time to travel the whole path, ms. */
export function pathDurationMs(p: PathSpec, W: number, H: number): number {
  return (chordPx(p, W, H) / (p.speed * H)) * 1000
}

/** 0..1 progress along the chord after `ageMs` of path time. */
export function pathProgress(p: PathSpec, ageMs: number, W: number, H: number): number {
  const len = chordPx(p, W, H)
  if (len === 0) return 1
  return Math.min(1, Math.max(0, ageMs / 1000) * p.speed * H / len)
}

/** True when the path ends outside the canvas (the enemy leaves and is culled). */
export function pathExits(p: PathSpec): boolean {
  return p.x1 < 0 || p.x1 > 1 || p.y1 < 0 || p.y1 > 1
}

export function pathEnd(p: PathSpec, W: number, H: number): { x: number; y: number } {
  return { x: p.x1 * W, y: p.y1 * H }
}

export function pathPosition(p: PathSpec, ageMs: number, W: number, H: number): { x: number; y: number } {
  const ax = p.x0 * W, ay = p.y0 * H
  const bx = p.x1 * W, by = p.y1 * H
  const len = Math.hypot(bx - ax, by - ay)
  const s = pathProgress(p, ageMs, W, H)
  const e = p.kind === 'drop' ? 1 - (1 - s) * (1 - s) : s
  let x = ax + (bx - ax) * e
  let y = ay + (by - ay) * e
  if (len > 0) {
    const env = Math.sin(Math.PI * s)
    const sway = p.wobble * Math.sin(p.phase + p.wobbleRate * Math.max(0, ageMs) / 1000)
    const lateral = (p.bend * env + sway * env) * H
    x += (-(by - ay) / len) * lateral
    y += ((bx - ax) / len) * lateral
  }
  return { x, y }
}

// ─── Generators ──────────────────────────────────────────────────────────────

function edgeStart(r: Rand, W: number, H: number, edges: Edges): { x: number; y: number } {
  const mx = entryPx(H) / W
  const my = entryPx(H) / H
  const side = edges === 'leftRight' ? Math.floor(r() * 2) * 2 + 1 : Math.floor(r() * 4)
  switch (side) {
    case 0: return { x: between(r, 0.1, 0.9), y: -my }       // top
    case 1: return { x: 1 + mx, y: between(r, 0.1, 0.9) }    // right
    case 2: return { x: between(r, 0.1, 0.9), y: 1 + my }    // bottom
    default: return { x: -mx, y: between(r, 0.1, 0.9) }      // left
  }
}

/** Build one path. `swarm` is not a kind of its own: see makeSwarm. */
export function makePath(kind: PathKind, o: PathOptions): PathSpec {
  const r = o.rand ?? Math.random
  const { W, H, speed } = o
  const mx = entryPx(H) / W
  const my = entryPx(H) / H
  const base = { bend: 0, wobble: 0, wobbleRate: 0, phase: r() * Math.PI * 2, speed }

  if (kind === 'flyby') {
    const h = o.height ?? between(r, 0.15, 0.8)
    const ltr = (o.dir ?? (r() < 0.5 ? 'ltr' : 'rtl')) === 'ltr'
    return {
      ...base, kind,
      x0: ltr ? -mx : 1 + mx, y0: h + between(r, -0.08, 0.08),
      x1: ltr ? 1 + mx : -mx, y1: h + between(r, -0.08, 0.08),
      wobble: between(r, 0.03, 0.06), wobbleRate: between(r, 5, 8),
    }
  }

  if (kind === 'drop') {
    const x = between(r, 0.15, 0.85)
    return {
      ...base, kind,
      x0: x, y0: -my,
      x1: x, y1: o.through ? 1 + my : between(r, 0.45, 0.7),
      wobble: 0.02, wobbleRate: between(r, 3, 5),
    }
  }

  // line / arc: edge → a spread-out point in the play area (never the centre on purpose)
  const start = edgeStart(r, W, H, o.edges ?? 'all')
  const x1 = between(r, 0.2, 0.8)
  const y1 = between(r, 0.25, 0.75)
  let bend = 0
  if (kind === 'arc') {
    const mag = between(r, 0.08, 0.18)
    // Bulge toward the canvas centre so the curve never leaves the extended box.
    const dx = (x1 - start.x) * W, dy = (y1 - start.y) * H
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len, ny = dx / len
    const mxp = ((start.x + x1) / 2) * W, myp = ((start.y + y1) / 2) * H
    const towardCentre = (W / 2 - mxp) * nx + (H / 2 - myp) * ny
    bend = (towardCentre >= 0 ? 1 : -1) * mag
  }
  return { ...base, kind, x0: start.x, y0: start.y, x1, y1, bend }
}

/**
 * A small cluster of flyby members moving together: one lane each (lateral
 * offsets), tiny speed and sway differences. Members share the lead's start
 * and end margins, so they all start and finish off screen.
 */
export function makeSwarm(count: number, o: PathOptions): PathSpec[] {
  const r = o.rand ?? Math.random
  const lead = makePath('flyby', { ...o, height: o.height ?? between(r, 0.2, 0.7) })
  const out: PathSpec[] = []
  for (let k = 0; k < count; k++) {
    // Lanes span ±0.12 H around the lead path, with a little jitter.
    const lane = ((k + 0.5) / count - 0.5) * 0.24 + between(r, -0.01, 0.01)
    // Vertical lanes: flybys travel (nearly) horizontally, and a purely vertical
    // shift never moves the start / exit points off their margin.
    out.push({
      ...lead,
      y0: lead.y0 + lane,
      y1: lead.y1 + lane,
      speed: lead.speed * between(r, 0.95, 1.05),
      phase: r() * Math.PI * 2,
    })
  }
  return out
}
