import { describe, it, expect } from 'vitest'
import {
  halfWidth, halfOffset, seatOfX, seatOfRawColumn, cropMotionHalf, toHalfPoints, pickWinner, motionHalfWidth,
} from './halves'
import { MOTION_W, MOTION_H, scaleHitbox, mirrorHitbox } from '../webcam/diff'

function frameWith(fill: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(MOTION_W * MOTION_H * 4)
  for (let y = 0; y < MOTION_H; y++) {
    for (let x = 0; x < MOTION_W; x++) {
      const i = (y * MOTION_W + x) * 4
      data[i] = data[i + 1] = data[i + 2] = fill(x, y)
      data[i + 3] = 255
    }
  }
  return { data, width: MOTION_W, height: MOTION_H } as unknown as ImageData
}

describe('half geometry', () => {
  it('splits the canvas at W/2', () => {
    expect(halfWidth(1280)).toBe(640)
    expect(halfWidth(1281)).toBe(640) // odd canvas: integer half
    expect(Number.isInteger(halfOffset(1, 1281))).toBe(true)
    expect(halfOffset(0, 1280)).toBe(0)
    expect(halfOffset(1, 1280)).toBe(640)
    expect(motionHalfWidth()).toBe(160)
  })

  it('assigns display x to the left seat below W/2 and the right seat from W/2', () => {
    expect(seatOfX(0, 1000)).toBe(0)
    expect(seatOfX(499.9, 1000)).toBe(0)
    expect(seatOfX(500, 1000)).toBe(1)
    expect(seatOfX(999, 1000)).toBe(1)
  })
})

describe('mirror mapping', () => {
  it('the person on the left of the room (right side of the raw sensor image) owns the left half', () => {
    expect(seatOfRawColumn(630, 640)).toBe(0) // raw right edge → mirrored left
    expect(seatOfRawColumn(320, 640)).toBe(0)
    expect(seatOfRawColumn(319, 640)).toBe(1) // raw left side → mirrored right
    expect(seatOfRawColumn(0, 640)).toBe(1)
  })

  it('motion-canvas columns share the screen orientation: column 0-159 is the left seat', () => {
    expect(seatOfX(0, MOTION_W)).toBe(0)
    expect(seatOfX(159, MOTION_W)).toBe(0)
    expect(seatOfX(160, MOTION_W)).toBe(1)
  })

  it('a mirrored hitbox in the right half of the raw image lands in the left half on screen', () => {
    const rawBox = { x: 500, y: 10, w: 100, h: 50 } // raw sensor, right side
    const screenBox = mirrorHitbox(rawBox, 640)
    expect(seatOfX(screenBox.x + screenBox.w / 2, 640)).toBe(0)
  })

  it('half-local hitboxes scale with the half motion width (160), not 320', () => {
    const hb = { x: 100, y: 90, w: 200, h: 90 } // half canvas 640 x 360
    const full = scaleHitbox(hb, 640, 360)
    const half = scaleHitbox(hb, 640, 360, 160)
    expect(full.x).toBeCloseTo(50)
    expect(half.x).toBeCloseTo(25)
    expect(half.w).toBeCloseTo(50)
    expect(half.y).toBeCloseTo(full.y)
  })
})

describe('cropMotionHalf', () => {
  const f = frameWith((x) => x) // luminance == column

  it('copies columns 0-159 for the left seat and 160-319 for the right seat', () => {
    const left = cropMotionHalf(f, 0)
    const right = cropMotionHalf(f, 1)
    expect(left.width).toBe(160)
    expect(right.width).toBe(160)
    expect(left.data[0]).toBe(0)
    expect(left.data[159 * 4]).toBe(159)
    expect(right.data[0]).toBe(160)
    expect(right.data[159 * 4]).toBe(255) // 319 clamps to 255 in the Uint8ClampedArray
  })

  it('keeps rows aligned', () => {
    const g = frameWith((x, y) => (x === 200 && y === 7 ? 255 : 0))
    const right = cropMotionHalf(g, 1)
    expect(right.data[(7 * 160 + 40) * 4]).toBe(255)
    expect(Array.from(cropMotionHalf(g, 0).data).some((v, i) => i % 4 === 0 && v === 255)).toBe(false)
  })

  it('tolerates a short buffer', () => {
    const short = { data: new Uint8ClampedArray(16), width: 2, height: 2 } as unknown as ImageData
    expect(() => cropMotionHalf(short, 1)).not.toThrow()
  })
})

describe('toHalfPoints', () => {
  it('keeps only the seat\'s points and makes x half-local', () => {
    const pts = [{ x: 10, y: 1 }, { x: 159, y: 2 }, { x: 160, y: 3 }, { x: 319, y: 4 }]
    expect(toHalfPoints(pts, 0)).toEqual([{ x: 10, y: 1 }, { x: 159, y: 2 }])
    expect(toHalfPoints(pts, 1)).toEqual([{ x: 0, y: 3 }, { x: 159, y: 4 }])
  })
})

describe('pickWinner', () => {
  it('higher score wins, equal scores tie (zero included)', () => {
    expect(pickWinner(500, 100)).toBe(0)
    expect(pickWinner(100, 500)).toBe(1)
    expect(pickWinner(300, 300)).toBe('tie')
    expect(pickWinner(0, 0)).toBe('tie')
  })
})

import { displayPointsInHalf } from './halves'
describe('displayPointsInHalf', () => {
  it('keeps the seat\'s display points with half-local x', () => {
    const pts = [{ x: 100, y: 5 }, { x: 639, y: 6 }, { x: 640, y: 7 }, { x: 1279, y: 8 }]
    expect(displayPointsInHalf(pts, 0, 1280)).toEqual([{ x: 100, y: 5 }, { x: 639, y: 6 }])
    expect(displayPointsInHalf(pts, 1, 1280)).toEqual([{ x: 0, y: 7 }, { x: 639, y: 8 }])
  })
})

describe('cropMotionHalf scratch reuse', () => {
  it('reuses the buffer for the same seat+slot and still crops correctly', () => {
    const w = 8, h = 2
    const mk = (v: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(v), width: w, height: h }) as unknown as ImageData
    const a = cropMotionHalf(mk(10), 0, w, h, 0)
    const b = cropMotionHalf(mk(20), 0, w, h, 0)
    expect(b.data).toBe(a.data)
    expect(b.data[0]).toBe(20)
    const p = cropMotionHalf(mk(30), 0, w, h, 1)
    expect(p.data).not.toBe(b.data)
    expect(cropMotionHalf(mk(1), 0, w, h).data).not.toBe(b.data) // no slot → fresh
  })
})
