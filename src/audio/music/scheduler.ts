/**
 * Look-ahead step scheduler. Pure logic on an injected clock: the caller
 * passes the audio clock time to `tick`, and `onStep` receives the exact audio
 * time at which each step must start. Step n starts at start + n * stepDuration
 * (multiplication, never accumulation), so there is no drift.
 */

export const LOOKAHEAD_SEC = 0.1
export const TICK_MS = 25
export const MAX_LATE_SEC = 0.05

export interface SchedulerOptions {
  bpm: number
  steps: number                      // steps in one loop of the pattern
  lookAheadSec?: number
  maxLateSec?: number
  onStep(step: number, time: number): void
}

export class StepScheduler {
  readonly stepDuration: number      // seconds per 1/16 note
  private readonly steps: number
  private readonly lookAhead: number
  private readonly maxLate: number
  private readonly onStep: (step: number, time: number) => void
  private startTime = 0
  private next = 0                   // absolute index of the next unscheduled step
  private started = false

  constructor(o: SchedulerOptions) {
    if (!(o.bpm > 0) || !Number.isFinite(o.bpm)) throw new Error('bpm must be positive')
    if (!Number.isInteger(o.steps) || o.steps <= 0) throw new Error('steps must be a positive integer')
    this.stepDuration = 60 / o.bpm / 4
    this.steps = o.steps
    this.lookAhead = o.lookAheadSec ?? LOOKAHEAD_SEC
    this.maxLate = o.maxLateSec ?? MAX_LATE_SEC
    this.onStep = o.onStep
  }

  start(time: number): void {
    this.startTime = time
    this.next = 0
    this.started = true
  }

  /** Absolute index of the next step that has not been visited. */
  get nextIndex(): number { return this.next }

  /** Start time of absolute step n. */
  timeOf(n: number): number { return this.startTime + n * this.stepDuration }

  /** Schedule every step starting before now + lookAhead. Returns steps fired. */
  tick(now: number): number {
    if (!this.started) return 0
    const horizon = now + this.lookAhead
    let fired = 0
    while (this.timeOf(this.next) < horizon) {
      const t = this.timeOf(this.next)
      if (t >= now - this.maxLate) {
        this.onStep(this.next % this.steps, t)
        fired++
      }
      this.next++
    }
    return fired
  }
}
