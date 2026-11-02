/**
 * main.ts — entry point.
 */

import './style.css'
import { initWebcam } from './webcam/capture'
import { startLoop } from './game/loop'
import { showWebcamError, hideWebcamError } from './ui/screens'
import { toggleDebug } from './game/render'

const webcamCanvas = document.getElementById('webcam-canvas') as HTMLCanvasElement
const gameCanvas   = document.getElementById('game-canvas') as HTMLCanvasElement

function resizeCanvases(): void {
  const w = window.innerWidth, h = window.innerHeight
  webcamCanvas.width = w; webcamCanvas.height = h
  gameCanvas.width = w;   gameCanvas.height = h
}

resizeCanvases()
window.addEventListener('resize', resizeCanvases)

const webcamCtx = webcamCanvas.getContext('2d')!
const gameCtx   = gameCanvas.getContext('2d')!

document.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') toggleDebug()
})

async function boot(): Promise<void> {
  let video: HTMLVideoElement
  try {
    video = await initWebcam()
  } catch {
    showWebcamError(() => { hideWebcamError(); boot() })
    return
  }

  await startLoop(video, webcamCtx, gameCtx)
}

boot()
