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
import { lockEndButtons } from '../ui/cardScreen'

export interface DemoOptions {
  seed: number
  /** Stage the run starts at (1–5). */
  stage: number
  /** Time scale multiplying the fixed step. */
  speed: number
  w: number
  h: number
}

/**
 * Every demo run starts its clock here: one fixed value, so the clock arithmetic (and every comparison made
 * with it) is bit-identical from run to run, and far above any real `performance.now()`, so a timestamp left
 * in a module by the normal game (or an earlier demo run, see `lockEndButtons`) can never lie in its future.
 */
export const CLOCK_START_MS = 2 ** 40
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
  private lastTimestamp: number | null = null
  /** Real time banked towards the next fixed step, ms. */
  private acc = 0
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
    // The end-screen lock and the card offer button keep a timestamp across loops: restart them on the demo clock.
    lockEndButtons(this.clock)
  }

  /** The demo game clock in ms (what `performance.now()` returns while the runtime exists). */
  get clockMs(): number { return this.clock }

  /**
   * Called at the top of every rAF callback. Real elapsed time is banked; a frame runs one fixed,
   * scaled step once a full real step (1/60 s) has accumulated, so the pace is 60 ticks per second on
   * any refresh rate of 60 Hz or more (frames in between return null). Below 60 Hz it is one step per frame.
   */
  beginTick(timestamp: number): { deltaMs: number } | null {
    const gap = this.lastTimestamp === null ? DEMO.stepMs : timestamp - this.lastTimestamp
    this.lastTimestamp = timestamp
    const stalled = gap > DEMO.maxGapMs
    this.acc += Math.min(DEMO.maxGapMs, Math.max(0, gap))
    if (this.acc < DEMO.stepMs - DEMO.stepSlackMs) return null
    this.acc = stalled ? 0 : Math.max(-DEMO.stepSlackMs, Math.min(this.acc - DEMO.stepMs, DEMO.stepMs))
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
    // ...and back on the real clock, so the normal game's end-screen buttons are not held by a demo timestamp.
    try { lockEndButtons(performance.now()) } catch { /* ignore */ }
  }
}
