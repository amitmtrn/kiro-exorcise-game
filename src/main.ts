/**
 * main.ts — entry point.
 */

import './style.css'
import { initWebcam, stopWebcam } from './webcam/capture'
import { startLoop, requestStart, handleCardKey, handleCardPointer } from './game/loop'
import { showCameraDenied, classifyCameraError, runOnboarding } from './ui/onboarding'
import { createOnboarding, onboardingReducer, hasSeenOnboarding, getLocalStorage } from './game/onboarding'
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
  // Exorcist Card keys (C / S / N / Enter / Esc) only act on the game-over and victory screens.
  if ((e.target as HTMLElement | null)?.tagName !== 'BUTTON' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (handleCardKey(e.key)) e.preventDefault()
  }
  if (e.key === ' ' || e.code === 'Space') {
    // Space on a focused button (e.g. "Try again") activates that button; it must not also start the game.
    if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') return
    e.preventDefault(); requestStart()
  }
})

// Tap / click on the HUD mute button (top-right) toggles audio too.
// Canvas pixel size equals its CSS size, so client coords map 1:1.
gameCanvas.addEventListener('pointerdown', (e) => {
  handleCardPointer(e.clientX, e.clientY) // card offer / preview buttons (end screens only)
  const r = muteButtonRect(gameCanvas.width, hudFontSize(gameCanvas.width))
  if (e.clientX >= r.x && e.clientX <= r.x + r.w && e.clientY >= r.y && e.clientY <= r.y + r.h) {
    toggleMute()
  }
})

// Module-level so a retry (camera denied, or lost mid-onboarding) resumes the same state.
let onboarding = createOnboarding(hasSeenOnboarding(getLocalStorage()))

function denyCamera(err: unknown): void {
  onboarding = onboardingReducer(onboarding, { type: 'cameraDenied' })
  showCameraDenied(classifyCameraError(err), () => {
    onboarding = onboardingReducer(onboarding, { type: 'retry' })
    void boot()
  })
}

async function boot(): Promise<void> {
  // Start the font load alongside the permission prompt instead of delaying it.
  const fontReady = loadTitleFont().catch(() => undefined)
  const storage = getLocalStorage()

  let video: HTMLVideoElement
  try {
    video = await initWebcam()
  } catch (err) {
    denyCamera(err)
    return
  }
  await fontReady

  // First run: silhouette guide + how-to over the live camera, then the usual flow.
  if (onboarding.step !== 'done') {
    const result = await runOnboarding(video, webcamCtx, gameCtx, storage, onboarding, (s) => { onboarding = s })
    if (result === 'cameraLost') { stopWebcam(video); denyCamera({ name: 'NotReadableError' }); return }
  }

  await startLoop(video, webcamCtx, gameCtx)
}

void boot()
