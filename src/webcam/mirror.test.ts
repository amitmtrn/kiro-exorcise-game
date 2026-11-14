/**
 * Mirror consistency (playtest1-fixes R5): the display draw, the motion capture, the card photo and the 2P half
 * snapshot all apply the same horizontal mirror, so a hand on the player's right is drawn on the screen's right
 * and a hit registers where it is drawn. This test only checks; the code needed no change.
 */
import { describe, it, expect } from 'vitest'
import { drawWebcamFrame } from './capture'
import { captureFrame, computeFrameDiff, scaleHitbox, mirrorX, MOTION_W, MOTION_H } from './diff'
import { grabMirroredSnapshot } from '../card/snapshot'
import { grabHalfSnapshot, halfSnapshotGeometry } from '../card/halfSnapshot'
import { seatOfRawColumn, seatOfX } from '../game/halves'

interface Draw { m: number[]; dx: number; dy: number; dw: number; dh: number }
/** A 2D context that tracks translate / scale / save / restore as an affine matrix and records `drawImage`. */
function tracking(width: number, height: number) {
  let m = [1, 0, 0, 1, 0, 0] // a b c d e f
  const stack: number[][] = []
  const draws: Draw[] = []
  const ctx = {
    canvas: { width, height },
    save: () => { stack.push([...m]) },
    restore: () => { m = stack.pop() ?? [1, 0, 0, 1, 0, 0] },
    translate: (x: number, y: number) => { m = [m[0], m[1], m[2], m[3], m[4] + m[0] * x + m[2] * y, m[5] + m[1] * x + m[3] * y] },
    scale: (sx: number, sy: number) => { m = [m[0] * sx, m[1] * sx, m[2] * sy, m[3] * sy, m[4], m[5]] },
    drawImage: (_i: unknown, dx: number, dy: number, dw: number, dh: number) => { draws.push({ m: [...m], dx, dy, dw, dh }) },
  } as unknown as CanvasRenderingContext2D
  return { ctx, draws }
}
/** Canvas x where the video's raw column fraction `u` (0 = left edge of the camera image) lands. */
const landsAt = (d: Draw, u: number): number => d.m[0] * (d.dx + u * d.dw) + d.m[4]

const W = 1280, H = 720
const video = {} as HTMLVideoElement

describe('one mirror everywhere', () => {
  // The camera sees the player from the front: the player's right hand is at the LEFT of the raw image (u small).
  const uRightHand = 0.1

  it('display, motion capture and card photo put the raw left of the camera on the right of the screen', () => {
    const display = tracking(W, H); drawWebcamFrame(display.ctx, video)
    const motion = tracking(MOTION_W, MOTION_H); captureFrame(motion.ctx, video)
    const holder = tracking(640, 360)
    grabMirroredSnapshot(video, W, H, () => ({ width: 640, height: 360, getContext: () => holder.ctx }) as unknown as HTMLCanvasElement)
    const photo = holder.draws[0]
    const photoW = holder.ctx.canvas.width

    const xs = {
      display: landsAt(display.draws[0], uRightHand) / W,
      motion: landsAt(motion.draws[0], uRightHand) / MOTION_W,
      photo: landsAt(photo, uRightHand) / photoW,
    }
    for (const f of Object.values(xs)) expect(f).toBeCloseTo(1 - uRightHand, 9) // on the screen's right
    expect(display.draws).toHaveLength(1)
  })

  it('the 2P half snapshot shows the same side of the room as the live half', () => {
    for (const seat of [0, 1] as const) {
      const g = halfSnapshotGeometry(seat, W, H)
      const holder = tracking(g.w, g.h)
      grabHalfSnapshot(video, seat, W, H, () => ({ width: g.w, height: g.h, getContext: () => holder.ctx }) as unknown as HTMLCanvasElement)
      const d = holder.draws[0]
      for (const u of [0.05, 0.3, 0.7, 0.95]) {
        const snapX = landsAt(d, u) // x in the snapshot
        const displayX = snapX / g.scale + g.offsetX // back to display px
        expect(displayX).toBeCloseTo(W - u * W, 6) // same mirror as the live view
        const inSnapshot = snapX >= 0 && snapX <= g.w
        expect(inSnapshot).toBe(seatOfX(displayX, W) === seat) // a half shows exactly its own players
        expect(seatOfRawColumn(u * 1000, 1000)).toBe(seatOfX(W - u * W, W))
      }
    }
  })

  it('a hit registers where the hand is drawn: raw hand on the camera left hits a box on the screen right', () => {
    const motion = tracking(MOTION_W, MOTION_H); captureFrame(motion.ctx, video)
    const d = motion.draws[0]
    const frame = (rawU: number): ImageData => {
      const data = new Uint8ClampedArray(MOTION_W * MOTION_H * 4)
      // a 24 px wide, 80 px tall bright patch at raw fraction rawU of the camera image, placed through the capture transform
      const x0 = landsAt(d, rawU) - 12
      for (let y = 50; y < 130; y++) for (let x = Math.round(x0); x < Math.round(x0) + 24; x++) {
        const i = (y * MOTION_W + x) * 4
        data[i] = data[i + 1] = data[i + 2] = 255
      }
      return { data, width: MOTION_W, height: MOTION_H } as unknown as ImageData
    }
    const empty = { data: new Uint8ClampedArray(MOTION_W * MOTION_H * 4), width: MOTION_W, height: MOTION_H } as unknown as ImageData
    const cur = frame(0.1) // the player's right hand
    const right = { x: 0.9 * W - 60, y: 0.5 * H - 60, w: 120, h: 120 } // display box around where the hand is drawn
    const left = { x: 0.1 * W - 60, y: 0.5 * H - 60, w: 120, h: 120 }
    expect(computeFrameDiff(cur, empty, scaleHitbox(right, W, H), MOTION_W)).toBe(true)
    expect(computeFrameDiff(cur, empty, scaleHitbox(left, W, H), MOTION_W)).toBe(false)
    expect(mirrorX(0.1 * MOTION_W, MOTION_W)).toBeCloseTo(0.9 * MOTION_W, 9)
  })
})
