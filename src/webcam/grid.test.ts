import { describe, it, expect, afterEach } from 'vitest'
import { GRID_LADDER, FULL_GRID, gridForLevel, getMotionGrid, setMotionGrid, resetMotionGrid } from './grid'
import { scaleHitbox, computeMotionMask, MOTION_W, MOTION_H } from './diff'
import { updateMotionPixels, motionCell } from '../game/collision'
import { resetHitGates } from '../game/hitGate'
import { cropMotionHalf, motionHalfWidth } from '../game/halves'
import { createInitialState, makeEnemy } from '../game/state'

afterEach(() => resetMotionGrid())

function imageData(w: number, h: number, fill = 0): ImageData {
  const data = new Uint8ClampedArray(w * h * 4).fill(fill)
  return { data, width: w, height: h, colorSpace: 'srgb' } as unknown as ImageData
}

describe('motion grid', () => {
  it('defaults to the full 320 x 180 grid with stride 4', () => {
    expect(getMotionGrid()).toEqual({ w: 320, h: 180, stride: 4 })
    expect(FULL_GRID.w).toBe(MOTION_W)
    expect(FULL_GRID.h).toBe(MOTION_H)
  })

  it('ladder sizes keep the 16:9 aspect', () => {
    expect(GRID_LADDER.map((g) => `${g.w}x${g.h}`)).toEqual(['320x180', '160x90', '128x72', '96x54'])
    for (const g of GRID_LADDER) expect(g.w / g.h).toBeCloseTo(16 / 9, 6)
  })

  it('maps levels to grids (0,1 full; 2 = 160x90; 3 = 96x54)', () => {
    expect(gridForLevel(0)).toBe(GRID_LADDER[0])
    expect(gridForLevel(1)).toBe(GRID_LADDER[0])
    expect(gridForLevel(2)).toBe(GRID_LADDER[1])
    expect(gridForLevel(3)).toBe(GRID_LADDER[3])
  })

  it('setMotionGrid reports changes only', () => {
    expect(setMotionGrid(GRID_LADDER[0])).toBe(false)
    expect(setMotionGrid(GRID_LADDER[1])).toBe(true)
    expect(setMotionGrid(GRID_LADDER[1])).toBe(false)
  })

  it('maps a display hitbox to the same fraction of every grid', () => {
    const hb = { x: 320, y: 120, w: 160, h: 90 }
    for (const g of GRID_LADDER) {
      setMotionGrid(g)
      const s = scaleHitbox(hb, 1280, 720)
      expect(s.x / g.w).toBeCloseTo(hb.x / 1280, 9)
      expect(s.y / g.h).toBeCloseTo(hb.y / 720, 9)
      expect(s.w / g.w).toBeCloseTo(hb.w / 1280, 9)
      expect(s.h / g.h).toBeCloseTo(hb.h / 720, 9)
    }
  })

  it('the motion mask samples the same lattice size on 320 and 160', () => {
    const a = computeMotionMask(imageData(320, 180), imageData(320, 180), 320, 180)
    setMotionGrid(GRID_LADDER[1])
    const b = computeMotionMask(imageData(160, 90), imageData(160, 90), 160, 90)
    expect(a.sampled).toBe(80 * 45)
    expect(b.sampled).toBe(80 * 45)
  })

  it('motionCell follows the grid (cell = stride * display / grid)', () => {
    for (const g of GRID_LADDER) {
      setMotionGrid(g)
      updateMotionPixels({ points: [], sampled: 1, moved: 0, changed: true }, 1280, 720)
      expect(motionCell.w).toBeCloseTo(g.stride * 1280 / g.w, 9)
      expect(motionCell.h).toBeCloseTo(g.stride * 720 / g.h, 9)
    }
  })

  it('half-frame helpers follow the grid', () => {
    setMotionGrid(GRID_LADDER[3])
    expect(motionHalfWidth()).toBe(48)
    const half = cropMotionHalf(imageData(96, 54, 7), 1)
    expect(half.width).toBe(48)
    expect(half.height).toBe(54)
  })

  it('resetHitGates clears gates and swipe centroids, leaves other fields', () => {
    const e = makeEnemy({ id: 'a', type: 'ghost', hitCount: 1, motionX: 5, motionY: 6, x: 10, y: 20, speed: 1, targetX: 0, targetY: 0, hitbox: { x: 0, y: 0, w: 10, h: 10 } })
    const st = { ...createInitialState(1), enemies: [e] }
    const out = resetHitGates(st)
    expect(out.enemies[0]).toMatchObject({ hitCount: 0, motionX: undefined, motionY: undefined, x: 10, y: 20 })
    const clean = { ...st, enemies: [{ ...e, hitCount: 0, motionX: undefined, motionY: undefined }] }
    expect(resetHitGates(clean)).toBe(clean)
  })
})
