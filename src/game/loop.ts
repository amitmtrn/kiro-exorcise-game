/**
 * Game loop — drives the entire game tick by tick using requestAnimationFrame.
 */

import { drawWebcamFrame } from '../webcam/capture'
import { captureFrame, calibrateDiffThreshold, MOTION_W, MOTION_H } from '../webcam/diff'
import {
  createInitialState,
  tickTimer,
  setEnemies,
  setParticles,
  decrementLife,
} from './state'
import type { GameState } from './state'
import { tickSpawners } from './enemies/spawn'
import { moveEnemies } from './enemies/movement'
import { resolveHits } from './collision'
import { tickParticles } from './particles'
import { renderFrame } from './render'
import { renderHUD } from '../ui/hud'
import { showGameOver } from '../ui/screens'

/** Enemy center must be within this many px of its target to count as "reached center". */
const CENTER_THRESHOLD = 40

let rafId = 0

export async function startLoop(
  video: HTMLVideoElement,
  webcamCtx: CanvasRenderingContext2D,
  gameCtx: CanvasRenderingContext2D,
  onRestart: () => void,
): Promise<void> {
  // Fixed-size off-screen canvases for frame differencing (fast to sample)
  const currentCanvas = document.createElement('canvas')
  currentCanvas.width = MOTION_W
  currentCanvas.height = MOTION_H
  const currentCtx = currentCanvas.getContext('2d')!

  const prevCanvas = document.createElement('canvas')
  prevCanvas.width = MOTION_W
  prevCanvas.height = MOTION_H
  const prevCtx = prevCanvas.getContext('2d')!

  // Auto-calibrate threshold from 1 s of background noise
  await calibrateDiffThreshold(currentCtx, video, 1000)
  // Prime the previous frame
  captureFrame(prevCtx, video)

  let state: GameState = createInitialState()
  let lastTimestamp = 0

  function tick(timestamp: number): void {
    if (state.phase === 'gameover') {
      showGameOver(state.score, onRestart)
      return
    }

    const deltaMs = lastTimestamp === 0 ? 16 : Math.min(timestamp - lastTimestamp, 100)
    lastTimestamp = timestamp

    const now = performance.now()
    const displayW = webcamCtx.canvas.width
    const displayH = webcamCtx.canvas.height

    // 1. Draw mirrored webcam frame to display canvas
    drawWebcamFrame(webcamCtx, video)

    // 2. Capture current video frame (mirrored) to the small motion canvas
    captureFrame(currentCtx, video)

    // 3. Tick spawn timers → may add new enemies
    state = tickSpawners(state, deltaMs, displayW, displayH)

    // 4. Move all enemies one step
    const movedEnemies = moveEnemies(state.enemies, deltaMs)
    state = setEnemies(state, movedEnemies)

    // 5. Check for enemies reaching center (ghost/bat only; skull has no arrival penalty)
    const survivors = state.enemies.filter((enemy) => {
      if (enemy.type === 'skull') return true
      const dx = enemy.x - enemy.targetX  // enemy.x/y is the CENTER
      const dy = enemy.y - enemy.targetY
      return Math.sqrt(dx * dx + dy * dy) > CENTER_THRESHOLD
    })
    // Count non-skull enemies that reached center (didn't survive)
    const nonSkullReached = state.enemies.filter((enemy) => {
      if (enemy.type === 'skull') return false
      const dx = enemy.x - enemy.targetX
      const dy = enemy.y - enemy.targetY
      return Math.sqrt(dx * dx + dy * dy) <= CENTER_THRESHOLD
    }).length
    state = setEnemies(state, survivors)
    for (let i = 0; i < nonSkullReached; i++) {
      state = decrementLife(state)
    }

    // 6. Resolve hits via frame differencing (grace period + 2-frame gate inside)
    const currentData = currentCtx.getImageData(0, 0, MOTION_W, MOTION_H)
    const prevData = prevCtx.getImageData(0, 0, MOTION_W, MOTION_H)
    state = resolveHits(state, currentData, prevData, displayW, displayH, now)

    // 7. Tick round timer (may trigger gameover)
    state = tickTimer(state, deltaMs)

    // 8. Tick particles
    state = setParticles(state, tickParticles(state.particles))

    // 9. Render enemies, particles, flash
    renderFrame(gameCtx, state, now)

    // 10. Render HUD on top
    renderHUD(gameCtx, state, now)

    // 11. Copy currentFrame → prevFrame for next tick
    prevCtx.drawImage(currentCanvas, 0, 0)

    // 12. Schedule next frame
    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)
}

export function stopLoop(): void {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}
