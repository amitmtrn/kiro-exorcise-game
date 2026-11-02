/**
 * Game loop — drives all phases via requestAnimationFrame.
 */

import { drawWebcamFrame } from '../webcam/capture'
import { drawWebcamTint } from './atmosphere'
import { captureFrame, calibrateDiffThreshold, computeMotionMask, MOTION_W, MOTION_H } from '../webcam/diff'
import {
  createInitialState,
  tickTimer,
  setEnemies,
  setParticles,
  setScoreLabels,
  decrementLife,
  resetCombo,
  incrementMissed,
  saveHighScore,
  tickShake,
} from './state'
import type { GameState } from './state'
import { tickSpawners } from './enemies/spawn'
import { moveEnemies } from './enemies/movement'
import { resolveHits, updateMotionPixels } from './collision'
import { tickParticles, tickScoreLabels } from './particles'
import { renderFrame } from './render'
import { renderHUD, hudFontSize, HUD_FONT_FAMILY } from '../ui/hud'
import {
  renderStartScreen,
  renderStageTitle,
  renderSummary,
  renderGameOver,
} from '../ui/screens'
import {
  tickRound,
  startGame,
  retryStage,
  advanceToNextStage,
  spawnBoss,
} from './round'
import { sfxLifeLost, sfxStageClear, startMusic, stopMusic } from '../audio/index'

const CENTER_THRESHOLD = 40
let rafId = 0

// Keyboard fallback for the motion START button — the start screen says
// "Press Space". main.ts calls requestStart(); the start branch consumes it.
let startRequested = false
export function requestStart(): void { startRequested = true }

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

  let state: GameState = createInitialState(initialStage)
  let lastTimestamp = 0
  let prevPhase = state.phase

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

    // ── Start screen ──────────────────────────────────────────────────────────
    if (state.phase === 'start') {
      renderFrame(gameCtx, state, now)
      renderStartScreen(gameCtx, state, now, () => {
        state = startGame(state)
      })
      // Space bar fallback (only honoured while actually on the start screen)
      if (startRequested && state.phase === 'start') state = startGame(state)
      startRequested = false
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    startRequested = false // a stray Space outside the start screen is ignored

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
      renderFrame(gameCtx, state, now)
      state = resolveHits(state, currentData, prevData, displayW, displayH, now, frameIsNew)
      renderSummary(gameCtx, state, now, () => {
        state = advanceToNextStage(state, displayW, displayH)
      })
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    // ── Game Over ─────────────────────────────────────────────────────────────
    if (state.phase === 'gameover') {
      saveHighScore(state.highScore)
      state = resolveHits(state, currentData, prevData, displayW, displayH, now, frameIsNew)
      renderFrame(gameCtx, state, now)
      renderGameOver(gameCtx, state, now,
        () => { state = retryStage(state) },
        () => { state = createInitialState(1) },
      )
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    // ── Playing ───────────────────────────────────────────────────────────────

    // Screen shake counts down one frame per tick (set by resolveHits below)
    state = tickShake(state)

    // Stage 5: spawn boss once
    if (state.stage === 5 && !state.bossActive) {
      state = spawnBoss(state, displayW, displayH)
    }

    state = tickSpawners(state, deltaMs, displayW, displayH)

    const movedEnemies = moveEnemies(state.enemies, deltaMs)
    state = setEnemies(state, movedEnemies)

    // Check for enemies reaching center
    const survivors = state.enemies.filter((enemy) => {
      if (enemy.type === 'skull' || enemy.type === 'boss') return true
      const dx = enemy.x - enemy.targetX
      const dy = enemy.y - enemy.targetY
      return Math.sqrt(dx * dx + dy * dy) > CENTER_THRESHOLD
    })
    const missedCount = state.enemies.filter((enemy) => {
      if (enemy.type === 'skull' || enemy.type === 'boss') return false
      const dx = enemy.x - enemy.targetX
      const dy = enemy.y - enemy.targetY
      return Math.sqrt(dx * dx + dy * dy) <= CENTER_THRESHOLD
    }).length

    state = setEnemies(state, survivors)
    for (let i = 0; i < missedCount; i++) {
      state = decrementLife(state)
      state = resetCombo(state)
      state = incrementMissed(state)
      try { sfxLifeLost() } catch { /* audio not ready */ }
    }

    state = resolveHits(state, currentData, prevData, displayW, displayH, now, frameIsNew)
    state = tickTimer(state, deltaMs)
    state = setParticles(state, tickParticles(state.particles))
    state = setScoreLabels(state, tickScoreLabels(state.scoreLabels))

    renderFrame(gameCtx, state, now)
    renderHUD(gameCtx, state, now)

    // Phase transition hooks
    if (prevPhase !== state.phase) {
      if (state.phase === 'playing') {
        try { startMusic(state.stage) } catch { /* ignore */ }
      } else if (state.phase === 'summary') {
        try { sfxStageClear(); stopMusic() } catch { /* ignore */ }
      } else if (state.phase === 'gameover') {
        try { stopMusic() } catch { /* ignore */ }
      }
      prevPhase = state.phase
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
