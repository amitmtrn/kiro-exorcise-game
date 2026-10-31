/**
 * main.ts — entry point.
 * Initialises webcam, sizes canvases, starts the game loop.
 */

import './style.css'
import { initWebcam } from './webcam/capture'
import { startLoop, stopLoop } from './game/loop'
import { showWebcamError } from './ui/screens'
import { toggleDebug } from './game/render'

const webcamCanvas = document.getElementById('webcam-canvas') as HTMLCanvasElement
const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement

function resizeCanvases(): void {
  const w = window.innerWidth
  const h = window.innerHeight
  webcamCanvas.width = w
  webcamCanvas.height = h
  gameCanvas.width = w
  gameCanvas.height = h
}

resizeCanvases()
window.addEventListener('resize', resizeCanvases)

const webcamCtx = webcamCanvas.getContext('2d')!
const gameCtx = gameCanvas.getContext('2d')!

// Debug overlay toggle
document.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') toggleDebug()
})

async function boot(): Promise<void> {
  let video: HTMLVideoElement
  try {
    video = await initWebcam()
  } catch {
    showWebcamError(() => boot())
    return
  }

  async function restart(): Promise<void> {
    stopLoop()
    await startLoop(video, webcamCtx, gameCtx, restart)
  }

  await startLoop(video, webcamCtx, gameCtx, restart)
}

boot()
