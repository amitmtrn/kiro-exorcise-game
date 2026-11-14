/** Colourblind rendering (playtest-polish R8.1, R8.2): palette in use, plus shape cues that do not depend on colour. */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { renderFrame } from './render'
import { renderHUD, createHudPulse } from '../ui/hud'
import { MotionButton } from '../ui/motionButton'
import { createInitialState, makeEnemy } from './state'
import type { Enemy, GameState } from './state'
import { initSettings, resetSettings } from '../settings/runtime'
import { DEFAULT, OKABE_ITO } from '../ui/palette'

interface Rec { calls: Array<[string, unknown[]]>; fills: string[]; strokes: string[]; shadows: string[]; texts: string[] }

function recorder(w = 640, h = 480): { ctx: CanvasRenderingContext2D; rec: Rec } {
  const rec: Rec = { calls: [], fills: [], strokes: [], shadows: [], texts: [] }
  const store: Record<string, unknown> = { canvas: { width: w, height: h } }
  const ctx = new Proxy(store, {
    get: (t, k: string) => {
      if (k in t) return t[k]
      return (...a: unknown[]) => {
        rec.calls.push([k, a])
        if (k === 'fillText' || k === 'strokeText') rec.texts.push(String(a[0]))
        return { addColorStop() {}, width: 10 }
      }
    },
    set: (t, k: string, v) => {
      t[k] = v
      if (k === 'fillStyle') rec.fills.push(String(v))
      if (k === 'strokeStyle') rec.strokes.push(String(v))
      if (k === 'shadowColor') rec.shadows.push(String(v))
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, rec }
}

const enemy = (type: Enemy['type'], over: Partial<Enemy> = {}): Enemy => makeEnemy({
  id: type, type, x: 300, y: 200, speed: 1, targetX: 320, targetY: 240, hitbox: { x: 260, y: 160, w: 80, h: 80 }, spawnedAt: -10_000, ...over,
})
const stateWith = (...es: Enemy[]): GameState => ({ ...createInitialState(1), phase: 'playing', enemies: es })

const setCb = (on: boolean) => initSettings({ storage: null, search: on ? '?cb=1' : '?cb=0', reducedMotion: false })
beforeEach(() => resetSettings())
afterAll(() => resetSettings())

describe('enemy colours', () => {
  it('default palette draws the steering colours', () => {
    setCb(false)
    const { ctx, rec } = recorder()
    renderFrame(ctx, stateWith(enemy('skull'), enemy('pumpkin', { x: 100, hitbox: { x: 60, y: 160, w: 80, h: 80 } })), 0)
    expect(rec.fills).toContain(DEFAULT.skull)
    expect(rec.fills).toContain(DEFAULT.skullEye)
    expect(rec.shadows).toContain(DEFAULT.danger)
  })

  it('colourblind palette draws Okabe-Ito colours and no default skull / pumpkin orange', () => {
    setCb(true)
    const { ctx, rec } = recorder()
    renderFrame(ctx, stateWith(enemy('skull'), enemy('pumpkin', { x: 100, hitbox: { x: 60, y: 160, w: 80, h: 80 } })), 0)
    expect(rec.fills).toContain(OKABE_ITO.skull)
    expect(rec.fills).toContain(OKABE_ITO.pumpkin)
    expect(rec.fills).not.toContain(DEFAULT.skull)
    expect(rec.fills).not.toContain(DEFAULT.skullEye)
  })
})

describe('shape redundancy', () => {
  const dashes = (rec: Rec) => rec.calls.filter(([k, a]) => k === 'setLineDash' && (a[0] as number[]).length > 0)

  it('the skull gets a dashed ring and a "!" only with the colourblind palette; its shape is the same', () => {
    setCb(false)
    const off = recorder(); renderFrame(off.ctx, stateWith(enemy('skull')), 0)
    setCb(true)
    const on = recorder(); renderFrame(on.ctx, stateWith(enemy('skull')), 0)
    expect(dashes(off.rec).length).toBe(0)
    expect(off.rec.texts).not.toContain('!')
    expect(dashes(on.rec).length).toBeGreaterThan(0)
    expect(on.rec.texts).toContain('!')
    // same body: every path call of the default skull is also in the cb skull
    const path = (r: Rec) => r.calls.filter(([k]) => k === 'ellipse' || k === 'roundRect').map((c) => JSON.stringify(c))
    for (const p of path(off.rec)) expect(path(on.rec)).toContain(p)
  })

  it('other enemies get no danger cue', () => {
    setCb(true)
    const { ctx, rec } = recorder(); renderFrame(ctx, stateWith(enemy('ghost')), 0)
    expect(rec.texts).not.toContain('!')
    expect(dashes(rec).length).toBe(0)
  })

  it('P1 gets a dot and P2 a square mark, in different colours, only with the colourblind palette', () => {
    const st: GameState = { ...createInitialState(1), phase: 'playing' }
    setCb(false)
    let r = recorder(); renderHUD(r.ctx, st, 0, { pulse: createHudPulse(), showMute: false, label: 'P1' })
    expect(r.rec.texts).toContain('P1'); expect(r.rec.texts.some((t) => /[●■]/.test(t))).toBe(false)
    setCb(true)
    r = recorder(); renderHUD(r.ctx, st, 0, { pulse: createHudPulse(), showMute: false, label: 'P1' })
    expect(r.rec.texts).toContain('● P1'); expect(r.rec.fills).toContain(OKABE_ITO.p1)
    r = recorder(); renderHUD(r.ctx, st, 0, { pulse: createHudPulse(), showMute: false, label: 'P2' })
    expect(r.rec.texts).toContain('■ P2'); expect(r.rec.fills).toContain(OKABE_ITO.p2)
    expect(OKABE_ITO.p1).not.toBe(OKABE_ITO.p2)
  })

  it('lives stay hearts (full vs. hollow) and the combo keeps its x-N text', () => {
    setCb(true)
    const st: GameState = { ...createInitialState(1), phase: 'playing', lives: 2, combo: 3 }
    const { ctx, rec } = recorder(); renderHUD(ctx, st, 0, { pulse: createHudPulse() })
    expect(rec.texts).toContain('♥♥♡')
    expect(rec.texts).toContain('×3')
  })

  it('button rings use a pattern per state: dotted idle, solid filling, dashed destructive', () => {
    setCb(true)
    const idle = recorder(); new MotionButton(100, 100, 40, 'GO').render(idle.ctx, 0)
    const dashed = (r: Rec) => r.calls.filter(([k, a]) => k === 'setLineDash' && (a[0] as number[]).length > 0).map(([, a]) => JSON.stringify(a[0]))
    expect(dashed(idle.rec)).toContain('[3,7]')
    const destructive = new MotionButton(100, 100, 40, 'GO', null, 1300)
    ;(destructive as unknown as { progress: number }).progress = 600
    const d = recorder(); destructive.render(d.ctx, 0)
    expect(dashed(d.rec)).toContain('[12,6]')
    expect(d.rec.strokes).toContain(OKABE_ITO.ringDanger)
    setCb(false)
    const off = recorder(); new MotionButton(100, 100, 40, 'GO').render(off.ctx, 0)
    expect(dashed(off.rec).length).toBe(0)
    expect(off.rec.strokes).toContain('rgba(255, 107, 26, 0.6)')
  })
})
