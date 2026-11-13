/**
 * Two-player split screen — session state and reducers (pure apart from the
 * module-level hit globals `resolveHits` already uses).
 *
 * A session is two ordinary GameStates ("seats"), each simulated as if the canvas
 * were W/2 wide. Stage flow and the stage timer are shared. Spec: two-player.
 */

import { createInitialState, tickTimer, STAGE_TITLE_DURATION_MS, SUMMARY_AUTO_ADVANCE_MS } from './state'
import type { GameState, Enemy } from './state'
import { tickRound, advanceToNextStage } from './round'
import { resolveHits, lastBanished } from './collision'
import { stepSimulation, tickEffects } from './step'
import { splitHitStop } from './hitstop'
import { tickParticles, tickScoreLabels } from './particles'
import { tickKnocks } from './knock'
import { tickCallouts } from './callouts'
import { setParticles, setScoreLabels } from './state'
import { cropMotionHalf, halfWidth, motionHalfWidth, pickWinner, SEATS } from './halves'
import type { Seat } from './halves'

export type TwoPlayerPhase = 'stageTitle' | 'playing' | 'summary' | 'final'
export type SeatStatus = 'title' | 'playing' | 'out' | 'cleared' | 'summary' | 'won'

export interface TwoPlayerState {
  phase: TwoPlayerPhase
  seats: [GameState, GameState]
  stage: number
  /** Shared stage clock (R3.1), counted down on real deltaMs. */
  roundTimeMs: number
  summaryShownMs: number
  /** Enemies banished this tick per seat (white flash frame); render-only. */
  banished: [Enemy[], Enemy[]]
}

/** Motion data for one tick: the full mirrored motion frames (cropped per seat inside). */
export interface MotionInput {
  cur: ImageData
  prev: ImageData
  frameIsNew: boolean
  now: number
}

/** A fresh game: both seats on the stage-1 title card. */
export function createTwoPlayer(): TwoPlayerState {
  const mk = (): GameState => ({
    ...createInitialState(1), phase: 'stageTitle', stageTitleMs: STAGE_TITLE_DURATION_MS,
  })
  return { phase: 'stageTitle', seats: [mk(), mk()], stage: 1, roundTimeMs: 0, summaryShownMs: 0, banished: [[], []] }
}

/** True once a seat has lost all lives (or failed a boss stage on time): it takes no further part. */
export function isOut(s: GameState): boolean {
  return s.phase === 'gameover'
}

export function seatStatus(t: TwoPlayerState, seat: Seat): SeatStatus {
  const s = t.seats[seat]
  if (s.phase === 'gameover') return 'out'
  if (s.phase === 'stageTitle' || s.phase === 'start') return 'title'
  if (s.phase === 'playing') return 'playing'
  if (s.phase === 'victory') return 'won'
  return t.phase === 'playing' ? 'cleared' : 'summary'
}

export function winnerOf(t: TwoPlayerState): Seat | 'tie' {
  return pickWinner(t.seats[0].score, t.seats[1].score)
}

/** Runs one playing seat for `deltaMs` against `clockMs` (the shared stage clock). */
function stepSeat(seat: Seat, s: GameState, deltaMs: number, clockMs: number, W: number, H: number, m: MotionInput | null): { s: GameState; banished: Enemy[] } {
  const hw = halfWidth(W)
  s = { ...s, roundTimeMs: clockMs }
  // Hit-stop (juice R3), per seat: freezes only this seat's simulation.
  const hs = splitHitStop(s.hitStopMs, deltaMs)
  s = { ...s, hitStopMs: hs.remainingMs }
  const simMs = hs.liveMs
  if (simMs > 0) s = stepSimulation(s, simMs, hw, H)
  if (simMs > 0) s = { ...s, knocks: tickKnocks(s.knocks, simMs), callouts: tickCallouts(s.callouts, simMs) }
  let banished: Enemy[] = []
  if (m) {
    s = resolveHits(
      s, cropMotionHalf(m.cur, seat), cropMotionHalf(m.prev, seat),
      hw, H, m.now, m.frameIsNew, deltaMs, motionHalfWidth(),
    )
    banished = lastBanished
  }
  if (simMs > 0) {
    s = setParticles(s, tickParticles(s.particles, simMs))
    s = setScoreLabels(s, tickScoreLabels(s.scoreLabels, simMs))
  }
  // Shared clock: expiry rule per seat (boss alive → out, else summary). A defeat on this tick already left 'playing'.
  if (s.phase === 'playing') s = tickTimer(s, 0)
  return { s, banished }
}

function mapSeats(t: TwoPlayerState, f: (s: GameState, seat: Seat) => GameState): TwoPlayerState {
  return { ...t, seats: [f(t.seats[0], 0), f(t.seats[1], 1)] }
}

/** After a playing tick: leave `playing` once no seat is still playing. */
function settle(t: TwoPlayerState): TwoPlayerState {
  if (t.seats.some((s) => s.phase === 'playing')) return t
  // A seat in `summary` can continue; otherwise (both out, or the final stage is over) the game ends.
  return t.seats.some((s) => s.phase === 'summary')
    ? { ...t, phase: 'summary', summaryShownMs: 0 }
    : { ...t, phase: 'final' }
}

/**
 * Advances the session by `deltaMs`. `m` carries this tick's motion (only
 * consumed while playing); `W` × `H` is the full canvas.
 */
export function tickTwoPlayer(t: TwoPlayerState, deltaMs: number, W: number, H: number, m: MotionInput | null): TwoPlayerState {
  const hw = halfWidth(W)
  switch (t.phase) {
    case 'stageTitle': {
      const next = mapSeats(t, (s) => (s.phase === 'stageTitle' ? tickRound(s, deltaMs, hw, H) : tickEffects(s, deltaMs)))
      const live = next.seats.filter((s) => !isOut(s))
      if (live.length > 0 && live.every((s) => s.phase === 'playing')) {
        return { ...next, phase: 'playing', roundTimeMs: live[0].roundTimeMs, banished: [[], []] }
      }
      return next
    }

    case 'playing': {
      const clock = Math.max(0, t.roundTimeMs - deltaMs)
      const banished: [Enemy[], Enemy[]] = [[], []]
      const next = mapSeats(t, (s, seat) => {
        if (s.phase !== 'playing') return tickEffects(s, deltaMs) // out / cleared: frozen, no spawns
        const r = stepSeat(seat, s, deltaMs, clock, W, H, m)
        banished[seat] = r.banished
        return r.s
      })
      return settle({ ...next, roundTimeMs: clock, banished })
    }

    case 'summary': {
      const next = mapSeats(t, (s) => tickEffects(s, deltaMs))
      const summaryShownMs = t.summaryShownMs + deltaMs
      const out = { ...next, summaryShownMs, banished: [[], []] as [Enemy[], Enemy[]] }
      return summaryShownMs >= SUMMARY_AUTO_ADVANCE_MS ? advanceSession(out, W, H) : out
    }

    case 'final':
      return { ...mapSeats(t, (s) => tickEffects(s, deltaMs)), banished: [[], []] }
  }
}

/**
 * Shared summary → next stage (or bonus round). Out seats stay out (R4.5); the
 * game ends when no seat can continue (final stage finished, or both out).
 */
export function advanceSession(t: TwoPlayerState, W: number, H: number): TwoPlayerState {
  if (t.phase !== 'summary') return t
  const hw = halfWidth(W)
  const next = mapSeats(t, (s) => (s.phase === 'summary' ? advanceToNextStage(s, hw, H) : s))
  const cont = next.seats.find((s) => s.phase === 'stageTitle')
  if (!cont) return { ...next, phase: 'final' }
  return { ...next, phase: 'stageTitle', stage: cont.stage, summaryShownMs: 0, roundTimeMs: 0 }
}

export { SEATS }
