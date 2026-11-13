import { describe, it, expect } from 'vitest'
import { drawCard, composeCard } from './draw'
import { rankForScore } from '../game/rank'

function recorder() {
  const calls: Array<[string, unknown[]]> = []
  const gradient = { addColorStop: () => {} }
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(t, p: string) {
      if (p in t) return t[p]
      if (p === 'createLinearGradient') return () => gradient
      return (...args: unknown[]) => { calls.push([p, args]) }
    },
    set(t, p: string, v) { t[p] = v; calls.push([`set:${p}`, [v]]); return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

const data = { score: 4200, bestCombo: 3, stage: 4, stageCount: 5, banished: 61, rank: rankForScore(4200) }

describe('drawCard', () => {
  it('paints the camera photo, cover-cropped, when one is given', () => {
    const { ctx, calls } = recorder()
    const source = {} as CanvasImageSource
    drawCard(ctx, 600, 840, data, { source, width: 640, height: 480 })
    const img = calls.find(([n]) => n === 'drawImage')
    expect(img).toBeTruthy()
    expect(img![1][0]).toBe(source)
    expect(img![1]).toHaveLength(9) // cropped source rect → destination rect
    expect(calls.some(([n]) => n === 'ellipse')).toBe(false)
  })

  it('paints a silhouette instead when there is no photo', () => {
    const { ctx, calls } = recorder()
    drawCard(ctx, 600, 840, data, null)
    expect(calls.some(([n]) => n === 'drawImage')).toBe(false)
    expect(calls.some(([n]) => n === 'ellipse')).toBe(true)
  })

  it('writes the title, rank and every stat in Creepster-first fonts', () => {
    const { ctx, calls } = recorder()
    drawCard(ctx, 600, 840, data, null)
    const texts = calls.filter(([n]) => n === 'fillText').map(([, a]) => a[0])
    expect(texts).toEqual(expect.arrayContaining(['EXORCIST', 'Haunt Hunter', '4,200', 'x3', '4 / 5', '61']))
    const fonts = calls.filter(([n]) => n === 'set:font').map(([, a]) => String(a[0]))
    expect(fonts.some((f) => f.includes('Creepster'))).toBe(true)
  })

  it('never draws text outside the card width (maxWidth is passed)', () => {
    const { ctx, calls } = recorder()
    drawCard(ctx, 300, 420, { ...data, rank: 'Grand Exorcist of the Very Long Name Indeed' }, null)
    for (const [n, a] of calls) {
      if (n !== 'fillText') continue
      expect(typeof a[3]).toBe('number')
      expect(a[3] as number).toBeLessThanOrEqual(300)
    }
  })
})

describe('drawCard background', () => {
  it('fades from midnight (top) to deep purple (bottom)', () => {
    const stops: Array<[number, string]> = []
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(t, p: string) {
        if (p in t) return t[p]
        if (p === 'createLinearGradient') return () => ({ addColorStop: (o: number, c: string) => stops.push([o, c]) })
        return () => {}
      },
      set(t, p: string, v) { t[p] = v; return true },
    }) as unknown as CanvasRenderingContext2D
    drawCard(ctx, 600, 840, data, null)
    expect(stops[0]).toEqual([0, '#0d0014'])
    expect(stops[1]).toEqual([1, '#2a0845'])
  })
})

describe('composeCard', () => {
  it('creates a canvas of the requested size and paints it', () => {
    const { ctx, calls } = recorder()
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
    const out = composeCard(data, null, 300, 420, () => canvas)
    expect(out).toBe(canvas)
    expect(canvas.width).toBe(300)
    expect(canvas.height).toBe(420)
    expect(calls.length).toBeGreaterThan(10)
  })
})
