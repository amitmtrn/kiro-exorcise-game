/**
 * main.ts — entry point.
 */

import { createSoundHintController } from './ui/soundHint'
import './style.css'
import { initWebcam, stopWebcam } from './webcam/capture'
import { startLoop, stopLoop, requestStart, handleCardKey, handleCardPointer, handleSeatCardPointer, isCardPreviewOpen, isTwoPlayerActive, isStartScreenVisible } from './game/loop'
import { showCameraDenied, classifyCameraError, runOnboarding } from './ui/onboarding'
import { createOnboarding, onboardingReducer, hasSeenOnboarding, getLocalStorage } from './game/onboarding'
import { toggleDebug } from './game/render'
import { toggleMute, getAudioContext, stopMusic } from './audio/index'
import { installAudioUnlock } from './audio/unlock'
import { modeForKey } from './game/playerMode'
import { loadTitleFont } from './ui/fonts'
import { routePointer } from './ui/pointerRoute'
import { SOUND_HINT, soundHintFontPx } from './ui/layout'
import { hudFontSize, muteButtonRect, muteButtonRect2P } from './ui/hud'
import { parseDemoParams, routeDemoKey } from './demo/params'
import type { DemoParams } from './demo/params'
import { DemoRuntime } from './demo/runtime'

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

// Demo mode (demo-mode spec): a camera-free scripted run for filming. `demo` is non-null while it is on.
let demo: DemoRuntime | null = null
/** Set once demo mode was left: later boots (camera retry) are normal whatever the URL says. */
let demoLeft = false
/** The camera of the normal game currently on screen (released when demo mode takes over). */
let activeVideo: HTMLVideoElement | null = null
/** Key events the demo handler already used: the normal key handler skips them. */
const consumedKeys = new WeakSet<Event>()
let leftDemoAt = Number.NEGATIVE_INFINITY

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
const placeSoundHint = () => { soundHint.style.fontSize = `${soundHintFontPx(gameCanvas.width)}px` }
placeSoundHint()
window.addEventListener('resize', placeSoundHint)
document.getElementById('ui')!.appendChild(soundHint)
installAudioUnlock({
  target: window,
  getCtx: getAudioContext,
  // a webcam-only player never clicks: the hint hides itself so it cannot sit over the stage label (R6.2)
  // the hint is hidden in demo mode: clicking it would leave demo (demo-mode R6.5)
  onLocked: createSoundHintController((hidden) => { soundHint.hidden = hidden || demo !== null }, SOUND_HINT_MS),
})

// Demo keys run first (registered before the normal handler). Any key leaves demo mode except the passive ones;
// `G` on the normal title screen starts it. The audio-unlock listener on window still sees the key.
document.addEventListener('keydown', (e) => {
  const route = routeDemoKey(e, { demoOn: demo !== null, onTitle: isStartScreenVisible(), msSinceLeft: performance.now() - leftDemoAt })
  if (route === 'pass') return
  consumedKeys.add(e)
  e.preventDefault()
  if (route === 'leave') leaveDemo()
  else if (route === 'enter') enterDemo()
})
// Any click / tap leaves demo mode too; it is used up (it does not also press the mute button underneath).
window.addEventListener('pointerdown', (e) => {
  if (!demo) return
  e.stopPropagation()
  leaveDemo()
}, true)

document.addEventListener('keydown', (e) => {
  if (consumedKeys.has(e)) return
  // In demo mode only a plain M (mute) reaches the game: the other passive keys (chords, F-keys) do nothing here.
  if (demo !== null && !((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey)) return
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
// Created on the first normal boot: demo mode never reads the onboarding flag (demo-mode R2.2).
let onboarding: ReturnType<typeof createOnboarding> | null = null

function denyCamera(err: unknown): void {
  onboarding = onboardingReducer(onboarding!, { type: 'cameraDenied' })
  showCameraDenied(classifyCameraError(err), () => {
    onboarding = onboardingReducer(onboarding!, { type: 'retry' })
    void boot()
  })
}

/** The page URL without the demo parameters, so a reload (or leaving demo) is the normal game. */
function urlWithoutDemo(): string {
  const u = new URL(location.href)
  for (const k of ['demo', 'seed', 'stage', 'speed']) u.searchParams.delete(k)
  return u.pathname + (u.search ? u.search : '') + u.hash
}

/** Starts demo mode: no getUserMedia, no onboarding, no video element (demo-mode R2). */
async function bootDemo(params: DemoParams): Promise<void> {
  const rt = new DemoRuntime({ seed: params.seed, stage: params.stage, speed: params.speed, w: gameCanvas.width, h: gameCanvas.height })
  demo = rt
  soundHint.hidden = true
  await loadTitleFont().catch(() => undefined)
  if (demo !== rt) return // left demo while the font was loading
  await startLoop(null, webcamCtx, gameCtx, 1, { demo: rt })
}

/** `G` on the normal title screen: release the camera and switch to the scripted run (R1.2, R1.5). */
function enterDemo(): void {
  stopLoop()
  if (activeVideo) { stopWebcam(activeVideo); activeVideo = null }
  void bootDemo(parseDemoParams(location.search))
}

/** Back to the normal game: stop the demo loop, restore clock / random / persistence, ask for the camera as usual. */
function leaveDemo(): void {
  const rt = demo
  if (!rt) return
  demo = null
  demoLeft = true
  stopLoop()
  rt.dispose()
  leftDemoAt = performance.now()
  stopMusic() // the demo's stage or boss track must not play over the camera prompt
  webcamCtx.clearRect(0, 0, webcamCanvas.width, webcamCanvas.height)
  gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height)
  try { history.replaceState(null, '', urlWithoutDemo()) } catch { /* ignore */ }
  void boot()
}

async function boot(): Promise<void> {
  // After leaving demo the URL is ignored: the normal game starts even if `replaceState` failed.
  const params = parseDemoParams(demoLeft ? '' : location.search)
  if (params.demo) { await bootDemo(params); return }

  // Start the font load alongside the permission prompt instead of delaying it.
  const fontReady = loadTitleFont().catch(() => undefined)
  const storage = getLocalStorage()
  onboarding ??= createOnboarding(hasSeenOnboarding(storage))

  let video: HTMLVideoElement
  try {
    video = await initWebcam()
  } catch (err) {
    denyCamera(err)
    return
  }
  activeVideo = video
  await fontReady

  // First run: silhouette guide + how-to over the live camera, then the usual flow.
  if (onboarding!.step !== 'done') {
    const result = await runOnboarding(video, webcamCtx, gameCtx, storage, onboarding!, (s) => { onboarding = s })
    if (result === 'cameraLost') { stopWebcam(video); activeVideo = null; denyCamera({ name: 'NotReadableError' }); return }
  }

  await startLoop(video, webcamCtx, gameCtx)
}

void boot()
