/**
 * Game loop — drives all phases via requestAnimationFrame.
 */

import { drawWebcamFrame } from '../webcam/capture'
import { captureFrame, calibrateDiffThreshold, MOTION_W, MOTION_H } from '../webcam/diff'
import {
  createInitialState,
  tickTimer,
  setEnemies,
  setParticles,
  decrementLife,
  resetCombo,
  incrementMissed,
  saveHighScore,
} from './state'
import type { GameState } from './state'
import { tickSpawners } from './enemies/spawn'
import { moveEnemies } from './enemies/movement'
import { resolveHits } from './collision'
import { tickParticles } from './particles'
import { renderFrame } from './render'
import { renderHUD } from '../ui/hud'
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

    // Always draw webcam feed
    drawWebcamFrame(webcamCtx, video)

    // Capture motion frame every tick for motion buttons to work on all screens
    captureFrame(currentCtx, video)
    const currentData = currentCtx.getImageData(0, 0, MOTION_W, MOTION_H)
    const prevData = prevCtx.getImageData(0, 0, MOTION_W, MOTION_H)

    // ── Start screen ──────────────────────────────────────────────────────────
    if (state.phase === 'start') {
      renderFrame(gameCtx, state, now)
      renderStartScreen(gameCtx, state, now, () => {
        state = startGame(state)
      })
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

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
      // Run resolveHits so motion buttons work
      state = resolveHits(state, currentData, prevData, displayW, displayH, now)
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
      // Run resolveHits so motion buttons work
      state = resolveHits(state, currentData, prevData, displayW, displayH, now)
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

    state = resolveHits(state, currentData, prevData, displayW, displayH, now)
    state = tickTimer(state, deltaMs)
    state = setParticles(state, tickParticles(state.particles))

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
