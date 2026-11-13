import { describe, it, expect, vi } from 'vitest'

vi.mock('../audio/index', () => ({ isMuted: () => false }))

import { renderFrame } from './render'
import { createInitialState, makeEnemy } from './state'
import type { GameState } from './state'

function recorder(w = 640, h = 360) {
  let n = 0
  const ctx = new Proxy({ canvas: { width: w, height: h } } as Record<string, unknown>, {
    get(t, k: string) {
      if (k in t) return t[k]
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} })
      if (k === 'measureText') return () => ({ width: 10 })
      return () => { n++ }
    },
    set(t, k: string, v) { t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, count: () => n }
}

const state: GameState = { ...createInitialState(), phase: 'playing' }
const ghost = makeEnemy({
  id: 'g', type: 'ghost', x: 100, y: 100, targetX: 320, targetY: 180, speed: 0.2,
  hitbox: { x: 60, y: 60, w: 80, h: 80 },
})

describe('renderFrame options (two-player R7.1)', () => {
  it('without options it draws exactly what an explicit empty banished list draws (1P unchanged)', () => {
    const a = recorder(); renderFrame(a.ctx, state, 1000)
    const b = recorder(); renderFrame(b.ctx, state, 1000, { banished: [] })
    expect(a.count()).toBe(b.count())
    expect(a.count()).toBeGreaterThan(0)
  })

  it('opts.banished draws the white flash frame of that seat', () => {
    const a = recorder(); renderFrame(a.ctx, state, 1000, { banished: [] })
    const b = recorder(); renderFrame(b.ctx, state, 1000, { banished: [{ ...ghost, hitFlashFrames: 1 }] })
    expect(b.count()).toBeGreaterThan(a.count())
  })
})
