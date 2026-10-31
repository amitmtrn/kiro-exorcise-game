/**
 * main.ts — entry point.
 * Initialises webcam, sizes canvases, starts the game loop.
 */

import './style.css'
import { initWebcam } from './webcam/capture'
import { startLoop, stopLoop } from './game/loop'
import { showWebcamError } from './ui/screens'

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

async function boot(): Promise<void> {
  let video: HTMLVideoElement
  try {
    video = await initWebcam()
  } catch {
    showWebcamError(() => boot())
    return
  }

  function restart(): void {
    stopLoop()
    startLoop(video, webcamCtx, gameCtx, restart)
  }

  startLoop(video, webcamCtx, gameCtx, restart)
}

boot()
