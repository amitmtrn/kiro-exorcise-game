/**
 * main.ts — entry point.
 */

import './style.css'
import { initWebcam } from './webcam/capture'
import { startLoop, requestStart } from './game/loop'
import { showWebcamError, hideWebcamError } from './ui/screens'
import { toggleDebug } from './game/render'
import { toggleMute, getAudioContext } from './audio/index'
import { installAudioUnlock } from './audio/unlock'
import { loadTitleFont } from './ui/fonts'
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

// Unlock the AudioContext on ANY user gesture (browser autoplay policy). A
// webcam-only player sees a hint until the first click, tap or key press.
const soundHint = document.createElement('div')
soundHint.className = 'sound-hint'
soundHint.setAttribute('role', 'status')
soundHint.textContent = '🔊 Click or press any key to enable sound'
soundHint.hidden = true
document.getElementById('ui')!.appendChild(soundHint)
installAudioUnlock({
  target: window,
  getCtx: getAudioContext,
  onLocked: (locked) => { soundHint.hidden = !locked },
})

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
  await loadTitleFont()
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
