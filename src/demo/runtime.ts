/**
 * Demo runtime (demo-mode R5): owns the synthetic camera, the driver and the hand trail, runs
 * the game on a fixed step, and (while it exists) replaces `performance.now` and `Math.random`
 * with deterministic ones. `dispose()` puts everything back.
 */

import { DEMO } from './params'
import { mulberry32 } from './rng'
import { DemoDriver, handRadius } from './driver'
import type { DemoView } from './driver'
import { SyntheticCamera } from './camera'
import type { CameraFrames, Pt } from './camera'
import { setHighScorePersistence } from '../game/state'

export interface DemoOptions {
  seed: number
  /** Stage the run starts at (1–5). */
  stage: number
  /** Time scale multiplying the fixed step. */
  speed: number
  w: number
  h: number
}

const CLOCK_START_MS = 1000
const TRAIL_LEN = 6

export class DemoRuntime {
  readonly seed: number
  readonly startStage: number
  readonly speed: number
  readonly driver: DemoDriver
  /** Last hand position and the recent ones (oldest first), display coordinates. */
  hand: Pt
  readonly trail: Pt[] = []

  private camera: SyntheticCamera
  private clock = CLOCK_START_MS
  private lastProcessed = Number.NEGATIVE_INFINITY
  private lastDelta: number = DEMO.stepMs * DEMO.timeScale
  private rng: () => number
  private disposed = false
  private origRandom: () => number
  private origNowDesc: PropertyDescriptor | undefined
  private nowPatched = false

  constructor(opts: DemoOptions) {
    this.seed = opts.seed
    this.startStage = Math.min(5, Math.max(1, Math.round(opts.stage)))
    this.speed = opts.speed
    this.driver = new DemoDriver(opts.seed, opts.w, opts.h)
    this.hand = { ...this.driver.hand }
    this.camera = new SyntheticCamera(this.hand, handRadius(opts.h), opts.w, opts.h)
    this.rng = mulberry32(opts.seed)

    setHighScorePersistence(false)
    this.origRandom = Math.random
    Math.random = () => this.rng()
    try {
      this.origNowDesc = Object.getOwnPropertyDescriptor(performance, 'now')
      Object.defineProperty(performance, 'now', { value: () => this.clock, configurable: true, writable: true })
      this.nowPatched = true
    } catch { /* a frozen performance object: the run is then deterministic only up to frame timing */ }
  }

  /** The demo game clock in ms (what `performance.now()` returns while the runtime exists). */
  get clockMs(): number { return this.clock }

  /**
   * Called at the top of every rAF callback. Returns null when the frame is too soon after the last
   * processed one (a high-refresh display); otherwise the fixed, scaled step and advances the clock.
   */
  beginTick(timestamp: number): { deltaMs: number } | null {
    if (timestamp - this.lastProcessed < DEMO.minFrameMs) return null
    this.lastProcessed = timestamp
    this.lastDelta = DEMO.stepMs * this.speed
    this.clock += this.lastDelta
    return { deltaMs: this.lastDelta }
  }

  /** Runs the driver and the camera for this tick and returns the frames the loop feeds to the game. */
  frame(view: DemoView): CameraFrames {
    const prev = this.hand
    this.hand = { ...this.driver.update(this.lastDelta, view) }
    if (this.hand.x !== prev.x || this.hand.y !== prev.y) {
      this.trail.push(prev)
      if (this.trail.length > TRAIL_LEN) this.trail.shift()
    } else if (this.trail.length > 0) {
      this.trail.shift() // a resting hand lets its trail fade out
    }
    return this.camera.step(this.lastDelta, this.hand, handRadius(view.h), view.w, view.h)
  }

  /** A new run begins: the random stream restarts, so every loop of the attract mode plays the same game. */
  onRunStart(): void {
    this.rng = mulberry32(this.seed)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    Math.random = this.origRandom
    if (this.nowPatched) {
      try {
        if (this.origNowDesc) Object.defineProperty(performance, 'now', this.origNowDesc)
        else delete (performance as { now?: unknown }).now
      } catch { /* ignore */ }
    }
    setHighScorePersistence(true)
  }
}
