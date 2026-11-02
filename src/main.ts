/**
 * main.ts — entry point.
 */

import './style.css'
import { initWebcam } from './webcam/capture'
import { startLoop, requestStart } from './game/loop'
import { showWebcamError, hideWebcamError } from './ui/screens'
import { toggleDebug } from './game/render'
import { toggleMute, getAudioContext } from './audio/index'
import { hudFontSize, muteButtonRect } from './ui/hud'

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

// Unlock AudioContext on first user gesture (browser autoplay policy)
function unlockAudio() {
  try { getAudioContext() } catch { /* ignore */ }
  window.removeEventListener('pointerdown', unlockAudio)
  window.removeEventListener('keydown', unlockAudio)
}
window.addEventListener('pointerdown', unlockAudio)
window.addEventListener('keydown', unlockAudio)

document.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') toggleDebug()
  if (e.key === 'm' || e.key === 'M') toggleMute()
  if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); requestStart() }
})

// Tap / click on the HUD mute button (top-right) toggles audio too.
// Canvas pixel size equals its CSS size, so client coords map 1:1.
gameCanvas.addEventListener('pointerdown', (e) => {
  const r = muteButtonRect(gameCanvas.width, hudFontSize(gameCanvas.width))
  if (e.clientX >= r.x && e.clientX <= r.x + r.w && e.clientY >= r.y && e.clientY <= r.y + r.h) {
    toggleMute()
  }
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
