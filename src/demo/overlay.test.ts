import { describe, it, expect } from 'vitest'
import { drawDemoBadge, drawGhostHand, drawDemoBackdrop, drawDemoPortrait, drawDemoPlayer } from './overlay'

interface Call { fn: string; args: unknown[] }
function recorder(W = 1280, H = 720) {
  const calls: Call[] = []
  const canvas = { width: W, height: H }
  const ctx = new Proxy({ canvas } as Record<string, unknown>, {
    get: (t, k: string) => {
      if (k in t) return t[k]
      return (...args: unknown[]) => { calls.push({ fn: k, args }); return { addColorStop() {} } }
    },
    set: (t, k: string, v) => { t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}
const texts = (calls: Call[]) => calls.filter((c) => c.fn === 'fillText').map((c) => c.args[0])

describe('DEMO badge (demo-mode R6.1)', () => {
  it('draws the word DEMO and a caption inside the canvas', () => {
    const { ctx, calls } = recorder()
    drawDemoBadge(ctx)
    expect(texts(calls)).toContain('DEMO')
    expect(texts(calls).some((t) => String(t).includes('no camera'))).toBe(true)
    for (const c of calls.filter((x) => x.fn === 'fillText')) {
      expect(c.args[1] as number).toBeGreaterThan(0); expect(c.args[1] as number).toBeLessThan(1280)
      expect(c.args[2] as number).toBeGreaterThan(0); expect(c.args[2] as number).toBeLessThan(720)
    }
  })
  it('fits small canvases', () => {
    const { ctx, calls } = recorder(640, 360)
    drawDemoBadge(ctx)
    expect(texts(calls)).toContain('DEMO')
  })
  it('balances save / restore', () => {
    const { ctx, calls } = recorder()
    drawDemoBadge(ctx)
    expect(calls.filter((c) => c.fn === 'save').length).toBe(calls.filter((c) => c.fn === 'restore').length)
  })
})

describe('ghost hand cursor (R6.2)', () => {
  it('draws translucent shapes at the hand position', () => {
    const { ctx, calls } = recorder()
    drawGhostHand(ctx, { x: 500, y: 300 }, [{ x: 450, y: 300 }, { x: 480, y: 300 }], 40, 1000)
    expect(calls.filter((c) => c.fn === 'ellipse').length).toBeGreaterThanOrEqual(6) // palm, 4 fingers, thumb
    expect(calls.filter((c) => c.fn === 'arc').length).toBe(2) // trail
    const ell = calls.filter((c) => c.fn === 'ellipse')[0]
    expect(ell.args[0]).toBe(500)
  })
  it('works with an empty trail', () => {
    const { ctx } = recorder()
    expect(() => drawGhostHand(ctx, { x: 0, y: 0 }, [], 30, 0)).not.toThrow()
  })
})

describe('backdrop and portrait', () => {
  it('backdrop fills the whole canvas and draws the placeholder player', () => {
    const { ctx, calls } = recorder()
    drawDemoBackdrop(ctx)
    const fill = calls.find((c) => c.fn === 'fillRect')!
    expect(fill.args).toEqual([0, 0, 1280, 720])
    expect(calls.some((c) => c.fn === 'ellipse')).toBe(true)
  })
  it('portrait is a canvas of the requested size with the silhouette drawn into it', () => {
    const { ctx, calls } = recorder(600, 480)
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
    const out = drawDemoPortrait(600, 480, () => canvas)
    expect(out.width).toBe(600); expect(out.height).toBe(480)
    expect(calls.some((c) => c.fn === 'ellipse')).toBe(true)
  })
  it('portrait without a 2D context is still a canvas', () => {
    const canvas = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement
    expect(drawDemoPortrait(10, 10, () => canvas)).toBe(canvas)
  })
  it('player silhouette draws a head', () => {
    const { ctx, calls } = recorder()
    drawDemoPlayer(ctx, 640, 1280, 720)
    expect(calls.filter((c) => c.fn === 'ellipse').length).toBeGreaterThanOrEqual(2)
  })
})
