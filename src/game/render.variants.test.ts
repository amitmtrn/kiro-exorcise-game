/** New ghost art (more-content R1.7, R1.8): icons per state in every palette, no strobe, slow telegraph pulses. */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fc from 'fast-check'
import { renderFrame } from './render'
import { blinkAlpha, variantPulseHz, pulse01, VARIANT_PULSE_HZ } from './renderVariants'
import { createInitialState, makeEnemy } from './state'
import type { Enemy, GameState, VariantState } from './state'
import { initSettings, resetSettings } from '../settings/runtime'
import { OKABE_ITO, DEFAULT } from '../ui/palette'
import { stateSchedule } from './enemies/variants'

interface Rec { fills: string[]; texts: string[]; dashes: number[][]; alphas: number[] }
function recorder(w = 640, h = 480): { ctx: CanvasRenderingContext2D; rec: Rec } {
  const rec: Rec = { fills: [], texts: [], dashes: [], alphas: [] }
  const store: Record<string, unknown> = { canvas: { width: w, height: h } }
  const ctx = new Proxy(store, {
    get: (t, k: string) => {
      if (k in t) return t[k]
      return (...a: unknown[]) => {
        if (k === 'fillText') rec.texts.push(String(a[0]))
        if (k === 'setLineDash') rec.dashes.push(a[0] as number[])
        return { addColorStop() {}, width: 10 }
      }
    },
    set: (t, k: string, v) => {
      t[k] = v
      if (k === 'fillStyle') rec.fills.push(String(v))
      if (k === 'globalAlpha') rec.alphas.push(Number(v))
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, rec }
}
const enemy = (type: Enemy['type'], over: Partial<Enemy> = {}): Enemy => makeEnemy({
  id: type + (over.id ?? ''), type, x: 300, y: 200, speed: 1, targetX: 320, targetY: 240, hitbox: { x: 260, y: 160, w: 80, h: 80 }, spawnedAt: -10_000, ...over,
})
const stateWith = (...es: Enemy[]): GameState => ({ ...createInitialState(1), phase: 'playing', enemies: es })
const setCb = (on: boolean) => initSettings({ storage: null, search: on ? '?cb=1' : '?cb=0', reducedMotion: false })
beforeEach(() => resetSettings())
afterAll(() => resetSettings())

const ALL: Array<[Enemy['type'], VariantState]> = [
  ['wisp', 'idle'], ['wisp', 'lit'], ['wisp', 'merging'],
  ['mirror', 'shield'], ['mirror', 'cracking'], ['mirror', 'open'], ['mirror', 'closing'],
  ['blink', 'solid'], ['blink', 'warnOut'], ['blink', 'ethereal'], ['blink', 'warnIn'],
]

describe('every state draws in both palettes', () => {
  for (const cb of [false, true]) {
    for (const [type, vState] of ALL) {
      it(`${type} ${vState} (${cb ? 'cb' : 'default'})`, () => {
        setCb(cb)
        const { ctx, rec } = recorder()
        const e = enemy(type, { vState, vTimerMs: 100, absorbMs: type === 'mirror' ? 100 : 0, pairId: 'p' })
        expect(() => renderFrame(ctx, stateWith(e), 1234)).not.toThrow()
        expect(rec.texts.length).toBeGreaterThan(0) // the state icon
      })
    }
  }
})

describe('shape redundancy', () => {
  const icons = (type: Enemy['type'], vState: VariantState): string[] => {
    setCb(true)
    const { ctx, rec } = recorder()
    renderFrame(ctx, stateWith(enemy(type, { vState })), 0)
    return rec.texts
  }
  it('blink: solid and ethereal differ by icon and outline', () => {
    expect(icons('blink', 'solid')).toContain('◆')
    expect(icons('blink', 'ethereal')).toContain('◇')
    expect(icons('blink', 'warnOut')).toContain('◆') // still vulnerable
    expect(icons('blink', 'warnIn')).toContain('◇')
  })
  it('mirror: closed and open differ by icon', () => {
    expect(icons('mirror', 'shield')).toContain('▮')
    expect(icons('mirror', 'cracking')).toContain('▮')
    expect(icons('mirror', 'open')).toContain('▯')
  })
  it('wisp carries the link icon', () => { expect(icons('wisp', 'idle')).toContain('∞') })
  it('dashed outline only when the blink ghost is not fully solid', () => {
    setCb(false)
    const dashed = (vState: VariantState) => { const { ctx, rec } = recorder(); renderFrame(ctx, stateWith(enemy('blink', { vState })), 0); return rec.dashes.some((d) => d.length > 0) }
    expect(dashed('solid')).toBe(false)
    expect(dashed('ethereal')).toBe(true)
    expect(dashed('warnOut')).toBe(true)
  })
  it('uses the cb palette colours', () => {
    setCb(true)
    const { ctx, rec } = recorder()
    renderFrame(ctx, stateWith(enemy('blink', { vState: 'solid' })), 0)
    expect(rec.fills).toContain(OKABE_ITO.blink)
    setCb(false)
    const r2 = recorder()
    renderFrame(r2.ctx, stateWith(enemy('blink', { vState: 'solid' })), 0)
    expect(r2.rec.fills).toContain(DEFAULT.blink)
  })
})

describe('reduced flashing (R1.8)', () => {
  it('the telegraph pulse is at most 3 Hz, and at most 1 Hz when reduced', () => {
    initSettings({ storage: null, search: '?reducedflash=0', reducedMotion: false })
    expect(variantPulseHz()).toBeLessThanOrEqual(3)
    initSettings({ storage: null, search: '?reducedflash=1', reducedMotion: false })
    expect(variantPulseHz()).toBeLessThanOrEqual(1)
    expect(variantPulseHz()).toBe(VARIANT_PULSE_HZ * 0.25)
  })
  it('the new content never asks for a screen flash', () => {
    const { ctx } = recorder()
    const s = stateWith(...ALL.map(([t, v], i) => enemy(t, { id: String(i), vState: v })))
    renderFrame(ctx, s, 0)
    expect(s.flashEndTime).toBe(0)
  })
  it('pulse01 never changes faster than the pulse rate allows', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 100000, noNaN: true }), (t) => {
      const dt = 1
      const maxSlope = (Math.PI * variantPulseHz()) / 1000 // d/dt of 0.5 + 0.5 sin(2π f t)
      expect(Math.abs(pulse01(t + dt) - pulse01(t))).toBeLessThanOrEqual(maxSlope * dt + 1e-9)
    }), { numRuns: 100 })
  })
  it('blink alpha is a slow ramp: no step larger than 0.7 over 500 ms, at any tick size', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100 }), (dt) => {
      let last = blinkAlpha(enemy('blink', { vState: 'solid' }))
      let t = 0
      const cycle = stateSchedule('blink')
      const total = cycle.reduce((a, s) => a + s.ms, 0)
      for (; t < total * 2; t += dt) {
        let r = t % total, st = cycle[0]
        for (const s of cycle) { if (r < s.ms) { st = s; break } r -= s.ms }
        const a = blinkAlpha(enemy('blink', { vState: st.state, vTimerMs: r }))
        expect(Math.abs(a - last)).toBeLessThanOrEqual((0.7 * dt) / 500 + 1e-9 + (dt > 0 ? 0.001 : 0))
        last = a
      }
    }), { numRuns: 20 })
  })
})

describe('the Hollow King look (R6.5)', () => {
  it('draws the crown colour and the HOLLOW KING label; the stage-5 boss keeps its label', () => {
    for (const cb of [false, true]) {
      setCb(cb)
      const { ctx, rec } = recorder()
      const king = enemy('boss', { finale: true, hitsNeeded: 10, bossPhase: 1 })
      renderFrame(ctx, stateWith(king), 0)
      expect(rec.fills).toContain((cb ? OKABE_ITO : DEFAULT).bossCrown)
      expect(rec.texts.some((t) => t.includes('HOLLOW KING'))).toBe(true)
      const r2 = recorder()
      renderFrame(r2.ctx, stateWith(enemy('boss', { hitsNeeded: 10 })), 0)
      expect(r2.rec.texts.some((t) => t.includes('HOLLOW KING'))).toBe(false)
    }
  })
})
