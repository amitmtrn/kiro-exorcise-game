/**
 * Game loop — drives the entire game tick by tick using requestAnimationFrame.
 */

import { drawWebcamFrame } from '../webcam/capture'
import { captureFrame } from '../webcam/diff'
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

const CENTER_THRESHOLD = 40 // px — enemy this close to its target is "at center"

let rafId = 0

export function startLoop(
  video: HTMLVideoElement,
  webcamCtx: CanvasRenderingContext2D,
  gameCtx: CanvasRenderingContext2D,
  onRestart: () => void,
): void {
  const canvasW = webcamCtx.canvas.width
  const canvasH = webcamCtx.canvas.height

  // Off-screen canvases for frame differencing
  const currentCanvas = document.createElement('canvas')
  currentCanvas.width = canvasW
  currentCanvas.height = canvasH
  const currentCtx = currentCanvas.getContext('2d')!

  const prevCanvas = document.createElement('canvas')
  prevCanvas.width = canvasW
  prevCanvas.height = canvasH
  const prevCtx = prevCanvas.getContext('2d')!

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

    // 1. Draw mirrored webcam frame
    drawWebcamFrame(webcamCtx, video)

    // 2. Capture current video frame to off-screen canvas
    captureFrame(currentCtx, video)

    // 3. Tick spawn timers → may add new enemies
    state = tickSpawners(state, deltaMs, canvasW, canvasH)

    // 4. Move all enemies one step
    const movedEnemies = moveEnemies(state.enemies, deltaMs)
    state = setEnemies(state, movedEnemies)

    // 5. Check for enemies reaching center (ghost/bat only — skull has no life penalty on arrival)
    const survivors = state.enemies.filter((enemy) => {
      if (enemy.type === 'skull') return true
      const dx = enemy.x - enemy.targetX
      const dy = enemy.y - enemy.targetY
      return Math.sqrt(dx * dx + dy * dy) > CENTER_THRESHOLD
    })
    const reachedCount = state.enemies.filter((enemy) => {
      if (enemy.type === 'skull') return false
      const dx = enemy.x - enemy.targetX
      const dy = enemy.y - enemy.targetY
      return Math.sqrt(dx * dx + dy * dy) <= CENTER_THRESHOLD
    }).length
    state = setEnemies(state, survivors)
    for (let i = 0; i < reachedCount; i++) {
      state = decrementLife(state)
    }

    // 6. Resolve hits via frame differencing
    const currentData = currentCtx.getImageData(0, 0, canvasW, canvasH)
    const prevData = prevCtx.getImageData(0, 0, canvasW, canvasH)
    state = resolveHits(state, currentData, prevData, canvasW, now)

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
