import { describe, it, expect, afterEach } from 'vitest'
import { createInitialState, addParticles } from './state'
import { spawnGhostPuff } from './particles'
import { addCallout, makeCallout } from './callouts'
import { drawAtmosphere } from './atmosphere'
import { setQualityLevel, resetQuality, formatQualityLine, getQualityInfo, configureQuality } from './quality'

afterEach(() => resetQuality())

const co = (i: number) => makeCallout(10 * i, 10, { text: `c${i}`, kind: 'praise' }, 640, 480)

describe('quality level effects (R3.4)', () => {
  it('level 0 keeps every particle (identity)', () => {
    const p = spawnGhostPuff(100, 100)
    expect(addParticles(createInitialState(1), p).particles).toEqual(p)
  })

  it('level 1+ keeps every 2nd particle', () => {
    const p = spawnGhostPuff(100, 100)
    setQualityLevel(1)
    expect(addParticles(createInitialState(1), p).particles.length).toBe(Math.ceil(p.length / 2))
  })

  it('call-outs cap at 3 at level 0 and 1 below', () => {
    let l: ReturnType<typeof addCallout> = []
    for (let i = 0; i < 5; i++) l = addCallout(l, co(i))
    expect(l.map((c) => c.text)).toEqual(['c2', 'c3', 'c4'])
    setQualityLevel(2)
    l = []
    for (let i = 0; i < 5; i++) l = addCallout(l, co(i))
    expect(l.map((c) => c.text)).toEqual(['c4'])
  })

  function recorder() {
    const calls: string[] = []
    const ctx = new Proxy({ canvas: { width: 640, height: 480 } } as Record<string, unknown>, {
      get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => { calls.push(k + ':' + a.join(',')); return { addColorStop() {} } }),
      set: () => true,
    }) as unknown as CanvasRenderingContext2D
    return { ctx, calls }
  }

  it('fog is drawn below level 3 and skipped at level 3', () => {
    const a = recorder(); drawAtmosphere(a.ctx, 5000, 2)
    const b = recorder(); drawAtmosphere(b.ctx, 5000, 3)
    expect(a.calls.filter((c) => c.startsWith('createLinearGradient')).length).toBe(1) // fog base gradient
    expect(b.calls.filter((c) => c.startsWith('createLinearGradient')).length).toBe(0)
    expect(b.calls.some((c) => c.startsWith('createRadialGradient'))).toBe(true) // candles still lit
  })

  it('level 3 candles do not flicker: the same drawing at any time', () => {
    const a = recorder(); drawAtmosphere(a.ctx, 1234, 3)
    const b = recorder(); drawAtmosphere(b.ctx, 98765, 3)
    expect(a.calls).toEqual(b.calls)
  })

  it('debug line shows level, mode, frame time and resolution', () => {
    configureQuality('med')
    expect(formatQualityLine(getQualityInfo(), { w: 160, h: 90 })).toBe('Q2 med  0.0 ms  160×90')
    expect(formatQualityLine({ level: 1, mode: 'auto', avgMs: 17.44 }, { w: 320, h: 180 })).toBe('Q1 auto  17.4 ms  320×180')
  })
})
