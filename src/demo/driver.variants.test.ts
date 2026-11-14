/** Demo driver and the new ghosts (more-content R12.3). */
import { describe, it, expect } from 'vitest'
import { DemoDriver } from './driver'
import type { DemoView } from './driver'
import { makeEnemy } from '../game/state'
import type { Enemy, VariantState } from '../game/state'

const W = 1280, H = 720
const DT = 1000 / 30
const mk = (id: string, type: Enemy['type'], x: number, y: number, vState: VariantState, over: Partial<Enemy> = {}): Enemy =>
  makeEnemy({ id, type, x, y, targetX: W / 2, targetY: H / 2, speed: 0.05, hitbox: { x: x - 40, y: y - 40, w: 80, h: 80 }, vState, ...over })
const view = (enemies: Enemy[]): DemoView =>
  ({ phase: 'playing', stage: 6, bonus: false, enemies, w: W, h: H, now: 100000, cardOpen: false, hasPhoto: true, noPhoto: false })

/** The point the hand gets closest to over `n` ticks, measured against each enemy. */
function closest(d: DemoDriver, es: Enemy[], n = 60): Record<string, number> {
  const best: Record<string, number> = Object.fromEntries(es.map((e) => [e.id, Infinity]))
  for (let i = 0; i < n; i++) {
    const p = d.update(DT, view(es))
    for (const e of es) best[e.id] = Math.min(best[e.id], Math.hypot(p.x - e.x, p.y - e.y))
  }
  return best
}

describe('demo driver and the new ghosts', () => {
  it('never swipes an ethereal blink ghost or a shielded mirror ghost', () => {
    for (const seed of [1, 2, 3]) {
      const d = new DemoDriver(seed, W, H)
      const es = [mk('b', 'blink', 300, 200, 'ethereal'), mk('m', 'mirror', 1000, 200, 'shield')]
      const c = closest(d, es)
      expect(c.b).toBeGreaterThan(100)
      expect(c.m).toBeGreaterThan(100)
    }
  })
  it('swipes a solid blink ghost', () => {
    const d = new DemoDriver(1, W, H)
    expect(closest(d, [mk('b', 'blink', 640, 200, 'solid')]).b).toBeLessThan(40)
  })
  it('goes for the partner of a lit wisp, not the lit wisp', () => {
    for (const seed of [1, 2, 3, 4]) {
      const d = new DemoDriver(seed, W, H)
      const lit = mk('w1', 'wisp', 400, 250, 'lit', { pairId: 'p' })
      const partner = mk('w2', 'wisp', 900, 250, 'idle', { pairId: 'p' })
      const c = closest(d, [lit, partner], 40)
      expect(c.w2).toBeLessThan(40)
    }
  })
})
