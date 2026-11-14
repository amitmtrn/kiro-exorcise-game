/** Telegraph and MISSED rendering (playtest2-fixes R1.2, R1.3, R3.3): shape cues, reduced flash, colour-blind palette. */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { renderFrame } from './render'
import { createInitialState, makeEnemy } from './state'
import type { Enemy, GameState } from './state'
import { initSettings, resetSettings } from '../settings/runtime'
import { DEFAULT, OKABE_ITO } from '../ui/palette'
import { missCallout } from './callouts'
import { TELEGRAPH_MIN_MS } from './enemies/telegraph'
import { SKULL_GRACE_MS } from './enemies/skull'

interface Rec { dashes: unknown[][]; arcs: number[]; alphas: number[]; strokes: string[]; fills: string[]; texts: string[] }

function recorder(): { ctx: CanvasRenderingContext2D; rec: Rec } {
  const rec: Rec = { dashes: [], arcs: [], alphas: [], strokes: [], fills: [], texts: [] }
  const store: Record<string, unknown> = { canvas: { width: 1280, height: 720 } }
  const ctx = new Proxy(store, {
    get: (t, k: string) => {
      if (k in t) return t[k]
      return (...a: unknown[]) => {
        if (k === 'setLineDash') rec.dashes.push(a[0] as unknown[])
        if (k === 'arc') rec.arcs.push(a[2] as number)
        if (k === 'fillText') rec.texts.push(String(a[0]))
        return { addColorStop() {}, width: 10 }
      }
    },
    set: (t, k: string, v) => {
      t[k] = v
      if (k === 'globalAlpha') rec.alphas.push(v as number)
      if (k === 'strokeStyle') rec.strokes.push(String(v))
      if (k === 'fillStyle') rec.fills.push(String(v))
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, rec }
}

const ghost = (warnMs: number): Enemy => makeEnemy({
  id: 'g', type: 'ghost', x: 600, y: 300, targetX: 640, targetY: 360, speed: 0.2, hitbox: { x: 564, y: 264, w: 72, h: 72 }, warnMs,
})
const stateWith = (...es: Enemy[]): GameState => ({ ...createInitialState(1), phase: 'playing', enemies: es })
const set = (q: string) => initSettings({ storage: null, search: q, reducedMotion: false })
const dashed = (r: Rec) => r.dashes.filter((d) => d.length > 0).length

beforeEach(() => resetSettings())
afterAll(() => resetSettings())

describe('arrival telegraph', () => {
  it('a calm ghost draws no danger ring; an alarmed one draws a dashed ring and a "!" mark', () => {
    set('')
    const calm = recorder(); renderFrame(calm.ctx, stateWith(ghost(0)), 0)
    expect(dashed(calm.rec)).toBe(0)
    expect(calm.rec.texts).not.toContain('!')
    const alarmed = recorder(); renderFrame(alarmed.ctx, stateWith(ghost(200)), 0)
    expect(dashed(alarmed.rec)).toBeGreaterThan(0)
    expect(alarmed.rec.texts).toContain('!')
    expect(alarmed.rec.strokes).toContain(DEFAULT.danger)
  })

  it('the ring shrinks as the telegraph runs (a size cue, not colour only)', () => {
    set('')
    const early = recorder(); renderFrame(early.ctx, stateWith(ghost(50)), 0)
    const late = recorder(); renderFrame(late.ctx, stateWith(ghost(TELEGRAPH_MIN_MS - 50)), 0)
    expect(Math.max(...early.rec.arcs)).toBeGreaterThan(Math.max(...late.rec.arcs))
  })

  it('reduced flashing: the ring alpha is the same at any time (no pulse)', () => {
    set('?reducedflash=1')
    const a = recorder(); renderFrame(a.ctx, stateWith(ghost(300)), 0)
    const b = recorder(); renderFrame(b.ctx, stateWith(ghost(300)), 377)
    expect(a.rec.alphas).toEqual(b.rec.alphas)
  })

  it('colour-blind palette: the ring uses the palette danger colour and keeps its dashes and mark', () => {
    set('?cb=1')
    const { ctx, rec } = recorder(); renderFrame(ctx, stateWith(ghost(300)), 0)
    expect(rec.strokes).toContain(OKABE_ITO.danger)
    expect(dashed(rec)).toBeGreaterThan(0)
    expect(rec.texts).toContain('!')
  })

  it('a skull in its spawn grace shows the ring; after the grace it does not (default palette)', () => {
    set('')
    const sk = (graceMs: number) => makeEnemy({ id: 's', type: 'skull', x: 200, y: 300, targetX: 300, targetY: 300, speed: 0.1, hitbox: { x: 166, y: 266, w: 68, h: 68 }, graceMs })
    const g = recorder(); renderFrame(g.ctx, stateWith(sk(SKULL_GRACE_MS / 2)), 0)
    expect(dashed(g.rec)).toBeGreaterThan(0)
    const n = recorder(); renderFrame(n.ctx, stateWith(sk(0)), 0)
    expect(dashed(n.rec)).toBe(0)
  })

  it('a MISSED call-out is drawn in the danger colour', () => {
    set('')
    const { ctx, rec } = recorder()
    renderFrame(ctx, { ...stateWith(), callouts: [missCallout(900, 150, 1280, 720)] }, 0)
    expect(rec.texts).toContain('MISSED')
    expect(rec.fills).toContain(DEFAULT.danger)
  })
})
