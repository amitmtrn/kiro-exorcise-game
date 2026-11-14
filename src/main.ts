/**
 * main.ts — entry point.
 */

import './style.css'
import { initWebcam, stopWebcam } from './webcam/capture'
import { startLoop, requestStart, handleCardKey, handleCardPointer, handleSeatCardPointer, isCardPreviewOpen, isTwoPlayerActive } from './game/loop'
import { showCameraDenied, classifyCameraError, runOnboarding } from './ui/onboarding'
import { createOnboarding, onboardingReducer, hasSeenOnboarding, getLocalStorage } from './game/onboarding'
import { toggleDebug } from './game/render'
import { toggleMute, getAudioContext } from './audio/index'
import { installAudioUnlock } from './audio/unlock'
import { modeForKey } from './game/playerMode'
import { loadTitleFont } from './ui/fonts'
import { routePointer } from './ui/pointerRoute'
import { SOUND_HINT, soundHintFontPx } from './ui/layout'
import { hudFontSize, muteButtonRect, muteButtonRect2P } from './ui/hud'

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
const SOUND_HINT_MS = 8000
const soundHint = document.createElement('div')
soundHint.className = 'sound-hint'
soundHint.setAttribute('role', 'status')
soundHint.textContent = '🔊 Click or press any key to enable sound'
soundHint.style.top = `${SOUND_HINT.topFrac * 100}%`
soundHint.style.maxWidth = `${SOUND_HINT.maxWidthFrac * 100}%`
soundHint.hidden = true
const placeSoundHint = () => { soundHint.style.fontSize = `${soundHintFontPx(window.innerWidth)}px` }
placeSoundHint()
window.addEventListener('resize', placeSoundHint)
let soundHintTimer: ReturnType<typeof setTimeout> | undefined
document.getElementById('ui')!.appendChild(soundHint)
installAudioUnlock({
  target: window,
  getCtx: getAudioContext,
  onLocked: (locked) => {
    soundHint.hidden = !locked
    clearTimeout(soundHintTimer)
    // a webcam-only player never clicks: the hint hides itself so it cannot sit over the stage label (R6.2)
    if (locked) soundHintTimer = setTimeout(() => { soundHint.hidden = true }, SOUND_HINT_MS)
  },
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') toggleDebug()
  if (e.key === 'm' || e.key === 'M') toggleMute()
  const pickedMode = modeForKey(e.key)
  if (pickedMode !== null && !e.repeat) requestStart(pickedMode) // keys 1 / 2 on the start screen
  // Exorcist Card keys (C / S / N / Enter / Esc) only act on the game-over and victory screens.
  if (!isTwoPlayerActive() && (e.target as HTMLElement | null)?.tagName !== 'BUTTON' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (handleCardKey(e.key, e.repeat)) e.preventDefault()
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
  // Two-player: one shared mute button at the top centre (the 1P one is top-right).
  const fs = hudFontSize(gameCanvas.width)
  const twoPlayer = isTwoPlayerActive()
  routePointer(e.clientX, e.clientY, {
    twoPlayer,
    muteRect: twoPlayer ? muteButtonRect2P(gameCanvas.width, fs) : muteButtonRect(gameCanvas.width, fs),
    toggleMute,
    cardPointer: handleCardPointer,
    cardPreviewOpen: isCardPreviewOpen,
    seatCardPointer: handleSeatCardPointer,
  })
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
