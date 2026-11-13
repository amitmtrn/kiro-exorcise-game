import { describe, it, expect } from 'vitest'
import {
  makeKnock, knockPose, tickKnocks, addKnock,
  KNOCK_LIFE_MS, KNOCK_SPEED, KNOCK_DRAG, KNOCK_MIN_SCALE, KNOCK_SPIN, MAX_KNOCKS,
} from './knock'
import { makeEnemy } from './state'
import type { Swipe } from './swipe'

const H = 1000
const ghost = makeEnemy({ id: 'g', type: 'ghost', x: 400, y: 300, targetX: 0, targetY: 0, speed: 1, hitbox: { x: 0, y: 0, w: 1, h: 1 } })
const right: Swipe = { dx: 1, dy: 0, mag: 100, source: 'shift' }
const left: Swipe = { dx: -1, dy: 0, mag: 100, source: 'shift' }
const up: Swipe = { dx: 0, dy: -1, mag: 0, source: 'default' }

describe('knock-back', () => {
  it('starts at the enemy with full alpha and scale', () => {
    const p = knockPose(makeKnock(ghost, right, H))
    expect(p).toMatchObject({ x: 400, y: 300, angle: 0, scale: 1, alpha: 1, distance: 0 })
  })

  it('flies along the swipe direction', () => {
    const k = { ...makeKnock(ghost, right, H), ageMs: 200 }
    const p = knockPose(k)
    expect(p.x).toBeGreaterThan(400)
    expect(p.y).toBeCloseTo(300, 9)
    const u = { ...makeKnock(ghost, up, H), ageMs: 200 }
    expect(knockPose(u).y).toBeLessThan(300)
    expect(knockPose(u).x).toBeCloseTo(400, 9)
  })

  it('spin sign follows the horizontal swipe direction', () => {
    expect(makeKnock(ghost, right, H).spin).toBe(KNOCK_SPIN)
    expect(makeKnock(ghost, left, H).spin).toBe(-KNOCK_SPIN)
    expect(knockPose({ ...makeKnock(ghost, left, H), ageMs: 100 }).angle).toBeLessThan(0)
  })

  it('fades to 0 and shrinks to the minimum scale at the end of life', () => {
    const p = knockPose({ ...makeKnock(ghost, right, H), ageMs: KNOCK_LIFE_MS })
    expect(p.alpha).toBe(0)
    expect(p.scale).toBeCloseTo(KNOCK_MIN_SCALE, 9)
  })

  it('travel approaches speed / drag and scales with canvas height', () => {
    const far = knockPose({ ...makeKnock(ghost, { ...right, source: 'default' }, H), ageMs: 5000 })
    expect(far.distance).toBeCloseTo((KNOCK_SPEED * H) / KNOCK_DRAG, 3)
    const small = knockPose({ ...makeKnock(ghost, { ...right, source: 'default' }, H / 2), ageMs: 200 })
    const big = knockPose({ ...makeKnock(ghost, { ...right, source: 'default' }, H), ageMs: 200 })
    expect(big.distance).toBeCloseTo(small.distance * 2, 6)
  })

  it('swipe strength is clamped to [0.6, 1.5]', () => {
    const at = (mag: number) => makeKnock(ghost, { ...right, mag }, H).speed / (KNOCK_SPEED * H)
    expect(at(1)).toBeCloseTo(0.6, 9)
    expect(at(100)).toBeCloseTo(1, 9)
    expect(at(5000)).toBeCloseTo(1.5, 9)
  })

  it('expires after its lifetime', () => {
    let ks = [makeKnock(ghost, right, H)]
    ks = tickKnocks(ks, KNOCK_LIFE_MS - 1)
    expect(ks).toHaveLength(1)
    expect(tickKnocks(ks, 1)).toHaveLength(0)
  })

  it('addKnock caps the list, dropping the oldest', () => {
    let ks: ReturnType<typeof makeKnock>[] = []
    for (let i = 0; i < MAX_KNOCKS + 5; i++) ks = addKnock(ks, { ...makeKnock({ ...ghost, id: `g${i}` }, right, H) })
    expect(ks).toHaveLength(MAX_KNOCKS)
    expect(ks[0].enemy.id).toBe('g5')
  })
})
