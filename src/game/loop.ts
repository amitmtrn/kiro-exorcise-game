/**
 * Game loop — drives all phases via requestAnimationFrame.
 */

import { drawWebcamFrame } from '../webcam/capture'
import { drawWebcamTint } from './atmosphere'
import { captureFrame, calibrateDiffThreshold, computeMotionMask, MOTION_W, MOTION_H } from '../webcam/diff'
import {
  createInitialState,
  tickTimer,
  setParticles,
  setScoreLabels,
  saveHighScore,
} from './state'
import type { GameState } from './state'
import { stepSimulation, tickEffects } from './step'
import { resolveHits, updateMotionPixels, lastMotionPixels } from './collision'
import { tickParticles, tickScoreLabels } from './particles'
import { tickKnocks } from './knock'
import { splitHitStop } from './hitstop'
import { tickCallouts } from './callouts'
import { renderFrame } from './render'
import { renderHUD, hudFontSize, HUD_FONT_FAMILY, createHudPulse, drawMuteButton, muteButtonRect2P } from '../ui/hud'
import type { HudPulse } from '../ui/hud'
import { drawDivider, drawSeatOverlay, renderTwoPlayerSummary, renderTwoPlayerFinal, resetFinalScreen } from '../ui/splitscreen'
import { createTwoPlayer, tickTwoPlayer, advanceSession, seatStatus } from './twoPlayer'
import type { TwoPlayerState } from './twoPlayer'
import { SEATS, halfOffset, displayPointsInHalf } from './halves'
import type { Seat } from './halves'
import {
  renderStartScreen,
  renderStageTitle,
  renderSummary,
  renderGameOver,
  renderVictory,
  resetVictoryScreen,
} from '../ui/screens'
import {
  tickRound,
  startGame,
  retryStage,
  advanceToNextStage,
} from './round'
import { resolveStartRequest, setPlayerMode } from './playerMode'
import type { PlayerMode, StartRequest } from './playerMode'
import { sfxStageClear, startMusic, startTitleMusic, stopMusic, setMusicCombo } from '../audio/index'

let rafId = 0

/** True while a two-player game is on screen (main.ts uses it to place the mute tap target). */
let twoPlayerActive = false
export function isTwoPlayerActive(): boolean { return twoPlayerActive }

// Keyboard fallback for the motion START button — the start screen says
// "Press Space". main.ts calls requestStart(); the start branch consumes it.
let startRequest: StartRequest | null = null
/** Space starts in the remembered mode; keys 1 / 2 pick the mode (two-player R6.2). */
export function requestStart(req: StartRequest = 'last'): void { startRequest = req }

/** hit-detection-fix T4: tell the player to hold still while we sample noise. */
function drawCalibratingBanner(ctx: CanvasRenderingContext2D): void {
  const { width: W, height: H } = ctx.canvas
  ctx.save()
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(13, 0, 20, 0.6)'
  ctx.fillRect(0, 0, W, H)
  ctx.font = `bold ${hudFontSize(W)}px ${HUD_FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffd166'
  ctx.shadowColor = '#ffd166'
  ctx.shadowBlur = 14
  ctx.fillText('Calibrating… hold still 👻', W / 2, H / 2)
  ctx.restore()
}

export async function startLoop(
  video: HTMLVideoElement,
  webcamCtx: CanvasRenderingContext2D,
  gameCtx: CanvasRenderingContext2D,
  initialStage = 1,
): Promise<() => void> {
  startRequest = null // a Space pressed during permission/onboarding must not skip the title
  const currentCanvas = document.createElement('canvas')
  currentCanvas.width = MOTION_W; currentCanvas.height = MOTION_H
  const currentCtx = currentCanvas.getContext('2d')!

  const prevCanvas = document.createElement('canvas')
  prevCanvas.width = MOTION_W; prevCanvas.height = MOTION_H
  const prevCtx = prevCanvas.getContext('2d')!

  // Show the first webcam frame + a banner while the 1 s noise calibration runs
  drawWebcamFrame(webcamCtx, video)
  drawWebcamTint(webcamCtx)
  drawCalibratingBanner(gameCtx)
  await calibrateDiffThreshold(currentCtx, video, 1000)
  captureFrame(prevCtx, video)
  startRequest = null // ...nor one pressed during the 1 s calibration above

  let state: GameState = createInitialState(initialStage)
  let lastTimestamp = 0
  let prevPhase = state.phase

  // ── Two-player session (two-player spec). `two` is non-null while a 2P game is on screen. ──
  let two: TwoPlayerState | null = null
  let prevTwoPhase: TwoPlayerState['phase'] | null = null
  const halfCanvases: HTMLCanvasElement[] = []
  const pulses: HudPulse[] = [] // created on first use per seat
  const hudCanvases: HTMLCanvasElement[] = [] // transparent per-seat HUD layers, drawn above the divider
  /** Action requested by a 2P screen button during a tick; applied after the tick returns (so it is not overwritten). */
  let twoAction: 'next' | 'again' | 'menu' | null = null

  /** Start a game in `mode` (remembered for the session). */
  function begin(mode: PlayerMode): void {
    setPlayerMode(mode)
    if (mode === 2) {
      two = createTwoPlayer()
      prevTwoPhase = null
    } else {
      state = startGame(state)
    }
  }

  /** Back to the title screen from the two-player end screen. */
  function toMenu(): void {
    two = null
    prevTwoPhase = null
    state = createInitialState(1)
    prevPhase = state.phase
    try { stopMusic() } catch { /* ignore */ }
  }

  function halfCtx(seat: Seat, w: number, h: number): CanvasRenderingContext2D {
    let c = halfCanvases[seat]
    if (!c) { c = document.createElement('canvas'); halfCanvases[seat] = c }
    if (c.width !== w) c.width = w
    if (c.height !== h) c.height = h
    return c.getContext('2d')!
  }

  function hudCtx(seat: Seat, w: number, h: number): CanvasRenderingContext2D {
    let c = hudCanvases[seat]
    if (!c) { c = document.createElement('canvas'); hudCanvases[seat] = c }
    if (c.width !== w) c.width = w
    if (c.height !== h) c.height = h
    const x = c.getContext('2d')!
    x.clearRect(0, 0, w, h)
    return x
  }

  /** One tick of a two-player game: simulate both seats, then draw the halves, divider and overlays. */
  function tickTwo(t: TwoPlayerState, deltaMs: number, now: number, W: number, H: number,
    cur: ImageData, prev: ImageData, frameIsNew: boolean): TwoPlayerState {
    const motion = t.phase === 'playing' ? { cur, prev, frameIsNew, now } : null
    t = tickTwoPlayer(t, deltaMs, W, H, motion)

    // Phase hooks (music / sfx), once per transition
    if (prevTwoPhase !== t.phase) {
      try {
        if (t.phase === 'playing') startMusic(t.stage)
        else if (t.phase === 'summary') { sfxStageClear(); stopMusic() }
        else if (t.phase === 'final') { resetFinalScreen(); sfxStageClear(); stopMusic() }
      } catch { /* ignore */ }
      prevTwoPhase = t.phase
    }
    if (t.phase === 'playing') {
      try { setMusicCombo(Math.max(...t.seats.filter((s) => s.phase === 'playing').map((s) => s.combo), 1)) } catch { /* ignore */ }
    }

    gameCtx.clearRect(0, 0, W, H)
    const hw = W / 2
    const huds: Array<[CanvasRenderingContext2D, Seat]> = []
    for (const seat of SEATS) {
      const s = t.seats[seat]
      const hctx = halfCtx(seat, hw, H)
      renderFrame(hctx, s, now, {
        banished: t.banished[seat],
        motionPixels: displayPointsInHalf(lastMotionPixels, seat, W),
      })
      const pulse = (pulses[seat] ??= createHudPulse())
      if (s.phase === 'playing') {
        const hud = hudCtx(seat, hw, H)
        renderHUD(hud, s, now, { pulse, showMute: false, label: `P${seat + 1}` })
        huds.push([hud, seat])
      } else pulse.lastCombo = 1
      if (t.phase === 'stageTitle' && s.phase === 'stageTitle') renderStageTitle(hctx, s)
      const status = seatStatus(t, seat)
      if (t.phase !== 'final' && (status === 'out' || status === 'cleared')) drawSeatOverlay(hctx, status, s.score, now)
      gameCtx.drawImage(hctx.canvas, halfOffset(seat, W), 0)
    }
    drawDivider(gameCtx) // below the HUD text (R1.5)
    for (const [hud, seat] of huds) gameCtx.drawImage(hud.canvas, halfOffset(seat, W), 0)
    drawMuteButton(gameCtx, muteButtonRect2P(W, hudFontSize(W)))

    if (t.phase === 'summary') {
      renderTwoPlayerSummary(gameCtx, t, now, () => { twoAction = 'next' })
    } else if (t.phase === 'final') {
      renderTwoPlayerFinal(gameCtx, t, now,
        () => { twoAction = 'again' },
        () => { twoAction = 'menu' },
      )
    }
    return t
  }

  function tick(timestamp: number): void {
    const deltaMs = lastTimestamp === 0 ? 16 : Math.min(timestamp - lastTimestamp, 100)
    lastTimestamp = timestamp
    const now = performance.now()
    const displayW = webcamCtx.canvas.width
    const displayH = webcamCtx.canvas.height

    // Always draw webcam feed, then the haunted purple tint (spooky-skin R1.1)
    drawWebcamFrame(webcamCtx, video)
    drawWebcamTint(webcamCtx)

    // Capture motion frame every tick for motion buttons to work on all screens
    captureFrame(currentCtx, video)
    const currentData = currentCtx.getImageData(0, 0, MOTION_W, MOTION_H)
    const prevData = prevCtx.getImageData(0, 0, MOTION_W, MOTION_H)

    // Whole-frame motion mask: drives the motion buttons + debug overlay, and
    // tells us whether the camera actually delivered a new frame this tick.
    const mask = computeMotionMask(currentData, prevData, MOTION_W, MOTION_H)
    updateMotionPixels(mask, displayW, displayH)
    const frameIsNew = mask.changed

    // ── Two-player game (own state machine; the 1P branches below are untouched) ──
    twoPlayerActive = two !== null
    if (two) {
      twoAction = null
      two = tickTwo(two, deltaMs, now, displayW, displayH, currentData, prevData, frameIsNew)
      // Apply a button pressed during this tick *after* the tick result is stored.
      const action: typeof twoAction = twoAction
      twoAction = null
      if (action === 'next' && two.phase === 'summary') two = advanceSession(two, displayW, displayH)
      else if (action === 'again') { two = createTwoPlayer(); prevTwoPhase = null }
      else if (action === 'menu') toMenu()
      startRequest = null // keys pressed during a 2P game must not leak to the start screen (R6.2)
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    // ── Start screen ──────────────────────────────────────────────────────────
    if (state.phase === 'start') {
      try { startTitleMusic() } catch { /* ignore */ }
      renderFrame(gameCtx, state, now)
      renderStartScreen(gameCtx, state, now, (mode) => { begin(mode) })
      // Space / 1 / 2 fallback (only honoured while actually on the start screen)
      if (startRequest !== null && state.phase === 'start') begin(resolveStartRequest(startRequest))
      startRequest = null
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    startRequest = null // a stray key outside the start screen is ignored

    // ── Stage title card ──────────────────────────────────────────────────────
    if (state.phase === 'stageTitle') {
      state = tickRound(state, deltaMs, displayW, displayH)
      renderFrame(gameCtx, state, now)
      renderStageTitle(gameCtx, state)
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    if (state.phase === 'summary') {
      saveHighScore(state.highScore)
      state = tickRound(state, deltaMs, displayW, displayH)
      state = tickEffects(state, deltaMs)
      renderFrame(gameCtx, state, now)
      state = resolveHits(state, currentData, prevData, displayW, displayH, now, frameIsNew, deltaMs)
      // tickRound may just have auto-advanced (e.g. into the bonus title card):
      // only offer NEXT while the summary is still showing, so it cannot skip a stage.
      if (state.phase === 'summary') {
        renderSummary(gameCtx, state, now, () => {
          if (state.phase === 'summary') state = advanceToNextStage(state, displayW, displayH)
        })
      }
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    // ── Game Over ─────────────────────────────────────────────────────────────
    if (state.phase === 'gameover') {
      saveHighScore(state.highScore)
      state = tickEffects(state, deltaMs)
      renderFrame(gameCtx, state, now)
      renderGameOver(gameCtx, state, now,
        () => { state = retryStage(state) },
        () => { state = createInitialState(1) },
      )
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    // ── Victory (boss-phases R6.3) ────────────────────────────────────────────
    if (state.phase === 'victory') {
      saveHighScore(state.highScore)
      if (prevPhase !== 'victory') {
        // Entry hooks live here so every route into victory gets the lockout reset.
        resetVictoryScreen()
        try { sfxStageClear(); stopMusic() } catch { /* ignore */ }
        prevPhase = 'victory'
      }
      state = tickEffects(state, deltaMs)
      renderFrame(gameCtx, state, now)
      renderVictory(gameCtx, state, now,
        () => { state = startGame(createInitialState(1)) },
        () => { state = createInitialState(1) },
      )
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    // ── Playing ───────────────────────────────────────────────────────────────

    // Hit-stop (juice R3): game time freezes for a beat after a banish. The camera,
    // motion capture and hit detection keep running on the real delta; only the
    // simulation uses `simMs`, so the freeze lasts HITSTOP_MS at any frame rate.
    const hs = splitHitStop(state.hitStopMs, deltaMs)
    state = { ...state, hitStopMs: hs.remainingMs }
    const simMs = hs.liveMs

    if (simMs > 0) state = stepSimulation(state, simMs, displayW, displayH)

    // Age effects *before* resolveHits so ones spawned this tick start at age 0
    // (identical pose through the freeze at any frame rate).
    if (simMs > 0) {
      state = { ...state, knocks: tickKnocks(state.knocks, simMs), callouts: tickCallouts(state.callouts, simMs) }
    }

    state = resolveHits(state, currentData, prevData, displayW, displayH, now, frameIsNew, deltaMs)

    if (simMs > 0) {
      state = tickTimer(state, simMs)
      state = setParticles(state, tickParticles(state.particles, simMs))
      state = setScoreLabels(state, tickScoreLabels(state.scoreLabels, simMs))
    }

    renderFrame(gameCtx, state, now)
    renderHUD(gameCtx, state, now)

    // Music intensity follows the combo tier (cheap when unchanged)
    if (state.phase === 'playing') {
      try { setMusicCombo(state.combo) } catch { /* ignore */ }
    }

    // Phase transition hooks
    if (prevPhase !== state.phase) {
      if (state.phase === 'playing') {
        try { startMusic(state.stage) } catch { /* ignore */ }
      } else if (state.phase === 'summary') {
        try { sfxStageClear(); stopMusic() } catch { /* ignore */ }
      } else if (state.phase === 'gameover') {
        try { stopMusic() } catch { /* ignore */ }
      }
      // 'victory' is handled at the top of its own branch next frame.
      if (state.phase !== 'victory') prevPhase = state.phase
    }

    prevCtx.drawImage(currentCanvas, 0, 0)
    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)

  return () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
  }
}

export function stopLoop(): void {
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
}
