/**
 * Synthetic camera (demo-mode R3). Produces the same two frames the loop's camera
 * branch hands to `computeMotionMask` / `resolveHits`: a MOTION_W × MOTION_H RGBA
 * `current` and `previous` frame in which a bright disc marks the hand.
 *
 * Pure: plain typed arrays, no canvas, no DOM. The frames are `ImageData`-shaped
 * objects (`data`, `width`, `height`); both consumers read only those.
 */

import { MOTION_W, MOTION_H } from '../webcam/diff'
import { DEMO } from './params'

export interface Pt { x: number; y: number }

export interface CameraFrames {
  cur: ImageData
  prev: ImageData
  /** True when this tick delivered a new camera frame (false: `cur === prev`, a duplicate tick). */
  isNew: boolean
}

/** Luminance of the scene and of the hand disc; their gap (190) is far above DIFF_THRESHOLD (≤ 60). */
export const BG_LUM = 40
export const HAND_LUM = 230
/** Sensor noise amplitude: below the lowest calibrated threshold (15), above 0. */
export const NOISE_LUM = 2
const NOISE_PIXELS = 12

interface Buffer {
  img: ImageData
  /** Bounding box (motion px, inclusive) of the disc drawn in it, to erase it cheaply. */
  box: { x0: number; y0: number; x1: number; y1: number } | null
}

function makeBuffer(): Buffer {
  const data = new Uint8ClampedArray(MOTION_W * MOTION_H * 4)
  for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = BG_LUM; data[i + 3] = 255 }
  return { img: { data, width: MOTION_W, height: MOTION_H, colorSpace: 'srgb' } as ImageData, box: null }
}

/** Noise sites: fixed points on the 4-px sampling grid of computeMotionMask. */
const NOISE_SITES: ReadonlyArray<Pt> = Array.from({ length: NOISE_PIXELS }, (_, i) => ({
  x: 4 * ((i * 13 + 5) % (MOTION_W / 4)),
  y: 4 * ((i * 7 + 3) % (MOTION_H / 4)),
}))

function setLum(data: Uint8ClampedArray, x: number, y: number, lum: number): void {
  const i = (y * MOTION_W + x) * 4
  data[i] = data[i + 1] = data[i + 2] = lum
}

export class SyntheticCamera {
  private bufs: [Buffer, Buffer] = [makeBuffer(), makeBuffer()]
  /** Index of the buffer holding the latest frame. */
  private latest = 0
  private acc = 0
  private frameNo = 0

  constructor(initialHand: Pt, handR: number, displayW: number, displayH: number) {
    // The first frame already has the hand in it (in both buffers): no appearance spike.
    for (const b of this.bufs) this.draw(b, initialHand, handR, displayW, displayH)
  }

  /** A new run begins: the camera clock restarts, so every loop sees the same frame / duplicate-tick pattern at any speed. */
  resetPhase(): void { this.acc = 0 }

  /**
   * Advances the camera clock by `deltaMs` and returns this tick's frames. A tick that falls
   * between two camera frames returns the latest frame as both `cur` and `prev`.
   */
  step(deltaMs: number, hand: Pt, handR: number, displayW: number, displayH: number): CameraFrames {
    this.acc += Math.max(0, deltaMs)
    const isNew = this.acc + 1e-6 >= DEMO.frameMs
    const prevBuf = this.bufs[this.latest]
    if (!isNew) return { cur: prevBuf.img, prev: prevBuf.img, isNew: false }
    this.acc = Math.max(0, this.acc - DEMO.frameMs)
    if (this.acc >= DEMO.frameMs) this.acc = 0 // a stalled tick delivers one frame, not a burst
    const next = 1 - this.latest
    this.frameNo++
    this.draw(this.bufs[next], hand, handR, displayW, displayH)
    this.latest = next
    return { cur: this.bufs[next].img, prev: prevBuf.img, isNew: true }
  }

  /** Erases the old disc from `b`, draws the hand disc and the sensor noise. */
  private draw(b: Buffer, hand: Pt, handR: number, displayW: number, displayH: number): void {
    const data = b.img.data
    if (b.box) {
      for (let y = b.box.y0; y <= b.box.y1; y++) for (let x = b.box.x0; x <= b.box.x1; x++) setLum(data, x, y, BG_LUM)
      b.box = null
    }
    const cx = (hand.x * MOTION_W) / displayW
    const cy = (hand.y * MOTION_H) / displayH
    const rx = Math.max(1, (handR * MOTION_W) / displayW)
    const ry = Math.max(1, (handR * MOTION_H) / displayH)
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(MOTION_W - 1, Math.ceil(cx + rx))
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(MOTION_H - 1, Math.ceil(cy + ry))
    const inside = (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
    if (x0 <= x1 && y0 <= y1) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) setLum(data, x, y, HAND_LUM)
      b.box = { x0, y0, x1, y1 }
    }
    NOISE_SITES.forEach((s, i) => {
      const n = ((this.frameNo + i) & 1) === 0 ? NOISE_LUM : -NOISE_LUM
      setLum(data, s.x, s.y, (inside(s.x, s.y) ? HAND_LUM : BG_LUM) + n)
    })
  }
}
