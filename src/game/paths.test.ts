import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../test/prng'
import {
  makePath, makeSwarm, pathPosition, pathDurationMs, pathExits, pathEnd, marginPx, WAVE_PATHS,
} from './paths'
import type { PathKind, PathSpec } from './paths'

const SIZES: Array<[number, number]> = [[960, 540], [1280, 720], [640, 360], [1920, 1080]]
const KINDS: PathKind[] = ['line', 'arc', 'flyby', 'drop']

/** Samples the path over its whole life (plus a little past the end). */
function sample(p: PathSpec, W: number, H: number, n = 60): Array<{ x: number; y: number }> {
  const dur = pathDurationMs(p, W, H)
  return Array.from({ length: n + 1 }, (_, i) => pathPosition(p, (dur * 1.1 * i) / n, W, H))
}

function inExtendedBox(pt: { x: number; y: number }, W: number, H: number): boolean {
  const m = marginPx(H) + 1e-6
  return pt.x >= -m && pt.x <= W + m && pt.y >= -m && pt.y <= H + m
}

const chordH = (p: PathSpec, W: number, H: number) => Math.hypot((p.x1 - p.x0) * W, (p.y1 - p.y0) * H) / H

describe('paths', () => {
  it('lists all five path types', () => {
    expect([...WAVE_PATHS].sort()).toEqual(['arc', 'drop', 'flyby', 'line', 'swarm'])
  })

  for (const kind of KINDS) {
    it(`${kind}: stays inside the extended canvas for its whole life (many seeds, sizes)`, () => {
      for (const [W, H] of SIZES) {
        for (let seed = 1; seed <= 60; seed++) {
          const rand = mulberry32(seed)
          const p = makePath(kind, { W, H, speed: 0.3, rand })
          for (const pt of sample(p, W, H)) expect(inExtendedBox(pt, W, H)).toBe(true)
        }
      }
    })

    it(`${kind}: starts off screen, ends exactly at its end point`, () => {
      const [W, H] = [960, 540]
      for (let seed = 1; seed <= 40; seed++) {
        const p = makePath(kind, { W, H, speed: 0.3, rand: mulberry32(seed) })
        const s = pathPosition(p, 0, W, H)
        expect(s.x < 0 || s.x > W || s.y < 0 || s.y > H).toBe(true)
        const e = pathPosition(p, pathDurationMs(p, W, H) + 5000, W, H)
        const end = pathEnd(p, W, H)
        expect(e.x).toBeCloseTo(end.x, 6)
        expect(e.y).toBeCloseTo(end.y, 6)
      }
    })
  }

  it('line / arc / landing drop end inside the canvas, away from a single point (not all the centre)', () => {
    const [W, H] = [960, 540]
    const ends = new Set<string>()
    for (let seed = 1; seed <= 60; seed++) {
      for (const kind of ['line', 'arc', 'drop'] as const) {
        const p = makePath(kind, { W, H, speed: 0.3, rand: mulberry32(seed) })
        expect(pathExits(p)).toBe(false)
        expect(p.x1).toBeGreaterThanOrEqual(0.15)
        expect(p.x1).toBeLessThanOrEqual(0.85)
        expect(p.y1).toBeGreaterThanOrEqual(0.25)
        expect(p.y1).toBeLessThanOrEqual(0.75)
        ends.add(`${Math.round(p.x1 * 10)},${Math.round(p.y1 * 10)}`)
      }
    }
    expect(ends.size).toBeGreaterThan(10)
  })

  it('flyby crosses edge to edge at the requested height and exits', () => {
    const [W, H] = [960, 540]
    for (const h of [0.2, 0.4, 0.6, 0.78]) {
      for (const dir of ['ltr', 'rtl'] as const) {
        const p = makePath('flyby', { W, H, speed: 0.3, rand: mulberry32(3), height: h, dir })
        expect(pathExits(p)).toBe(true)
        const s = pathPosition(p, 0, W, H)
        const e = pathEnd(p, W, H)
        expect(dir === 'ltr' ? s.x < 0 : s.x > W).toBe(true)
        expect(dir === 'ltr' ? e.x > W : e.x < 0).toBe(true)
        expect(Math.abs(p.y0 - h)).toBeLessThanOrEqual(0.08 + 1e-9)
        // Mid-flight it is on screen.
        const mid = pathPosition(p, pathDurationMs(p, W, H) / 2, W, H)
        expect(mid.x).toBeGreaterThan(0)
        expect(mid.x).toBeLessThan(W)
      }
    }
  })

  it('flyby heights span several bands', () => {
    const ys = new Set<number>()
    for (let seed = 1; seed <= 50; seed++) {
      ys.add(Math.round(makePath('flyby', { W: 960, H: 540, speed: 0.3, rand: mulberry32(seed) }).y0 * 4))
    }
    expect(ys.size).toBeGreaterThanOrEqual(3)
  })

  it('drop enters above the top edge and falls fast, then slows', () => {
    const [W, H] = [960, 540]
    const p = makePath('drop', { W, H, speed: 0.3, rand: mulberry32(5) })
    expect(pathPosition(p, 0, W, H).y).toBeLessThan(0)
    const dur = pathDurationMs(p, W, H)
    const a = pathPosition(p, dur * 0.25, W, H).y - pathPosition(p, 0, W, H).y
    const b = pathPosition(p, dur, W, H).y - pathPosition(p, dur * 0.75, W, H).y
    expect(a).toBeGreaterThan(b)
  })

  it('drop with through:true leaves below the bottom edge', () => {
    const p = makePath('drop', { W: 960, H: 540, speed: 0.3, rand: mulberry32(2), through: true })
    expect(pathExits(p)).toBe(true)
    expect(pathEnd(p, 960, 540).y).toBeGreaterThan(540)
  })

  it('arc bulges toward the centre of the canvas', () => {
    const [W, H] = [960, 540]
    for (let seed = 1; seed <= 40; seed++) {
      const p = makePath('arc', { W, H, speed: 0.3, rand: mulberry32(seed) })
      expect(Math.abs(p.bend)).toBeGreaterThanOrEqual(0.08)
      const dur = pathDurationMs(p, W, H)
      const mid = pathPosition(p, dur / 2, W, H)
      const chordMid = { x: ((p.x0 + p.x1) / 2) * W, y: ((p.y0 + p.y1) / 2) * H }
      const chord = Math.hypot((p.x1 - p.x0) * W, (p.y1 - p.y0) * H)
      const nx = -((p.y1 - p.y0) * H) / chord, ny = ((p.x1 - p.x0) * W) / chord
      const towardCentre = (W / 2 - chordMid.x) * nx + (H / 2 - chordMid.y) * ny
      // The midpoint moved along the normal, on the side the centre is on.
      const moved = (mid.x - chordMid.x) * nx + (mid.y - chordMid.y) * ny
      expect(Math.sign(moved)).toBe(towardCentre >= 0 ? 1 : -1)
    }
  })

  it("'leftRight' edges only start at the left or right", () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const kind of ['line', 'arc'] as const) {
        const p = makePath(kind, { W: 960, H: 540, speed: 0.3, rand: mulberry32(seed), edges: 'leftRight' })
        expect(p.x0 < 0 || p.x0 > 1).toBe(true)
        expect(p.y0).toBeGreaterThanOrEqual(0.1)
        expect(p.y0).toBeLessThanOrEqual(0.9)
      }
    }
  })

  it('swarm: n flyby members, in separate lanes, same direction', () => {
    const [W, H] = [960, 540]
    const swarm = makeSwarm(5, { W, H, speed: 0.4, rand: mulberry32(9) })
    expect(swarm).toHaveLength(5)
    expect(swarm.every((m) => m.kind === 'flyby' && pathExits(m))).toBe(true)
    const dirs = new Set(swarm.map((m) => Math.sign(m.x1 - m.x0)))
    expect(dirs.size).toBe(1)
    const starts = new Set(swarm.map((m) => `${m.x0.toFixed(3)},${m.y0.toFixed(3)}`))
    expect(starts.size).toBe(5)
    for (const m of swarm) for (const pt of sample(m, W, H)) expect(inExtendedBox(pt, W, H)).toBe(true)
  })

  it('swarm lanes stay in the 15–80 % band, even for extreme lead heights (R1.3)', () => {
    for (const height of [0.2, 0.7]) {
      for (let seed = 1; seed <= 40; seed++) {
        const swarm = makeSwarm(5, { W: 960, H: 540, speed: 0.4, height, rand: mulberry32(seed) })
        for (const m of swarm) {
          for (const y of [m.y0, m.y1]) {
            expect(y).toBeGreaterThanOrEqual(0.15 - 1e-9)
            expect(y).toBeLessThanOrEqual(0.8 + 1e-9)
          }
        }
      }
    }
  })

  it('line / arc walks are long enough to be fair (≥ 0.85 H) at 16:9, so stage 1 stays forgiving', () => {
    const [W, H] = [960, 540]
    for (const kind of ['line', 'arc'] as const) {
      for (let seed = 1; seed <= 200; seed++) {
        const p = makePath(kind, { W, H, speed: 0.2, edges: 'leftRight', rand: mulberry32(seed) })
        const chord = Math.hypot((p.x1 - p.x0) * W, (p.y1 - p.y0) * H) / H
        expect(chord).toBeGreaterThanOrEqual(0.85)
      }
    }
  })

  it('line / arc walks reach 0.85 H from every edge (edges "all"), on wide and square canvases (R1.2)', () => {
    for (const [W, H] of [[960, 540], [1920, 1080], [800, 800], [1280, 720]]) {
      for (const kind of ['line', 'arc'] as const) {
        for (let seed = 1; seed <= 400; seed++) {
          const p = makePath(kind, { W, H, speed: 0.2, edges: 'all', rand: mulberry32(seed) })
          expect(chordH(p, W, H)).toBeGreaterThanOrEqual(0.85 - 1e-9)
        }
      }
    }
  })

  it('on narrow / portrait canvases the walk is the longest reachable, up to 0.85 H (R1.2)', () => {
    for (const [W, H] of [[540, 960], [400, 900], [300, 900]]) {
      // Longest possible walk from this start into the play-area box.
      const farthest = (p: PathSpec) => {
        let m = 0
        for (const x of [0.2, 0.8]) for (const y of [0.25, 0.75]) {
          m = Math.max(m, Math.hypot((x - p.x0) * W, (y - p.y0) * H) / H)
        }
        return m
      }
      for (const edges of ['leftRight', 'all'] as const) {
        for (let seed = 1; seed <= 300; seed++) {
          const p = makePath('line', { W, H, speed: 0.2, edges, rand: mulberry32(seed) })
          expect(chordH(p, W, H)).toBeGreaterThanOrEqual(Math.min(0.85, farthest(p)) - 1e-9)
        }
      }
    }
  })

  it('swarm lanes stay distinct after clamping (R1.4)', () => {
    for (const n of [3, 4, 5]) {
      for (const height of [0.2, 0.7, undefined]) {
        for (let seed = 1; seed <= 200; seed++) {
          const swarm = makeSwarm(n, { W: 960, H: 540, speed: 0.4, height, rand: mulberry32(seed) })
          const ys = swarm.map((m) => m.y0).sort((a, b) => a - b)
          for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThan(0.01)
          const ye = swarm.map((m) => m.y1).sort((a, b) => a - b)
          for (let i = 1; i < ye.length; i++) expect(ye[i] - ye[i - 1]).toBeGreaterThan(0.01)
        }
      }
    }
  })

  it('flyby end points stay in the 15–80 % band, whatever the height (R1.3)', () => {
    for (const height of [0.15, 0.8, undefined]) {
      for (let seed = 1; seed <= 200; seed++) {
        const p = makePath('flyby', { W: 960, H: 540, speed: 0.4, height, rand: mulberry32(seed) })
        for (const y of [p.y0, p.y1]) {
          expect(y).toBeGreaterThanOrEqual(0.15 - 1e-9)
          expect(y).toBeLessThanOrEqual(0.8 + 1e-9)
        }
      }
    }
  })

  it('pathDurationMs is chord length over speed (in canvas heights)', () => {
    const p: PathSpec = { kind: 'line', x0: 0, y0: 0, x1: 1, y1: 0, bend: 0, wobble: 0, wobbleRate: 0, phase: 0, speed: 0.5 }
    // chord 960 px at 0.5 × 540 px/s = 270 px/s
    expect(pathDurationMs(p, 960, 540)).toBeCloseTo((960 / 270) * 1000, 6)
  })

  it('a zero-length path is complete immediately', () => {
    const p: PathSpec = { kind: 'line', x0: 0.5, y0: 0.5, x1: 0.5, y1: 0.5, bend: 0, wobble: 0, wobbleRate: 0, phase: 0, speed: 0.5 }
    expect(pathPosition(p, 0, 960, 540)).toEqual({ x: 480, y: 270 })
  })
})
