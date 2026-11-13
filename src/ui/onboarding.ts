/**
 * Onboarding UI — first-run guide over the live mirrored webcam, 3-step
 * how-to-play, and the camera-denied screen. Pure helpers (geometry, error
 * classification, copy) are unit-tested; DOM/canvas code is thin glue around
 * the reducer in game/onboarding.ts.
 */

import {
  createOnboarding, onboardingReducer, shouldPersist, persistSeen,
  PRIVACY_LINE, GUIDE_TITLE, GUIDE_TEXT, HOWTO_STEPS,
  type OnboardingState, type OnboardingEvent, type OnboardingStorage,
} from '../game/onboarding'
import {
  checkFraming, isFramingStable, FRAMING_HINTS, FRAMING_INTERVAL_MS,
} from '../webcam/framing'
import { drawWebcamFrame } from '../webcam/capture'
import { drawWebcamTint } from '../game/atmosphere'

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export interface GuideGeometry {
  head: { cx: number; cy: number; rx: number; ry: number }
  /** Shoulders arc: centre, radius, start/end angle (radians, canvas convention). */
  shoulders: { cx: number; cy: number; r: number; from: number; to: number }
  hands: Array<{ cx: number; cy: number; r: number }>
}

/** Procedural silhouette: head, shoulders and two hand targets, all inside the canvas. */
export function guideGeometry(w: number, h: number): GuideGeometry {
  // Everything sits in the upper ~55 % so the bottom-anchored panel never covers the targets.
  const unit = Math.min(h, w * 0.6)
  const head = { cx: w / 2, cy: h * 0.2, rx: unit * 0.075, ry: unit * 0.095 }
  const shR = Math.min(w * 0.17, unit * 0.2)
  // The arc's top sits just below the chin, so the head stays visible above the shoulders.
  const shCy = head.cy + head.ry + h * 0.01 + shR
  return {
    head,
    shoulders: { cx: w / 2, cy: shCy, r: shR, from: Math.PI, to: 2 * Math.PI },
    hands: [
      { cx: w * 0.2, cy: h * 0.42, r: unit * 0.07 },
      { cx: w * 0.8, cy: h * 0.42, r: unit * 0.07 },
    ],
  }
}

export type CameraErrorKind = 'blocked' | 'unavailable'

/** Permission refused vs. no camera / camera busy. */
export function classifyCameraError(err: unknown): CameraErrorKind {
  const name = typeof err === 'object' && err !== null && 'name' in err ? String((err as { name: unknown }).name) : ''
  return name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError'
    ? 'blocked'
    : 'unavailable'
}

export const DENIED_TITLE = 'Exorcise needs your camera'
export const DENIED_LEAD: Record<CameraErrorKind, string> = {
  blocked: 'The camera is blocked for this page, so the ghosts cannot see your hands.',
  unavailable: 'No working camera was found, or another app is using it.',
}
/** Steps for a blocked permission: fix the browser setting first. */
export const DENIED_INSTRUCTIONS: readonly string[] = [
  'Click the camera or lock icon in your browser’s address bar.',
  'Set Camera to “Allow” for this page.',
  'Close other apps or tabs that might be using the camera.',
  'Press “Try again” below.',
]
/** Steps when no camera works: check the device first, permission last. */
export const DENIED_INSTRUCTIONS_UNAVAILABLE: readonly string[] = [
  'Plug in a camera, or turn it on if it has a switch.',
  'Close other apps or tabs that might be using the camera.',
  'If asked, set Camera to “Allow” for this page.',
  'Press “Try again” below.',
]

export function deniedInstructions(kind: CameraErrorKind): readonly string[] {
  return kind === 'blocked' ? DENIED_INSTRUCTIONS : DENIED_INSTRUCTIONS_UNAVAILABLE
}

// ─── Camera-denied screen ─────────────────────────────────────────────────────

let deniedEl: HTMLElement | null = null

export function showCameraDenied(kind: CameraErrorKind, onRetry: () => void): void {
  if (deniedEl) return
  const ui = document.getElementById('ui')!
  const div = document.createElement('div')
  div.className = 'screen-error screen-denied'
  div.setAttribute('role', 'alert')

  const h = document.createElement('h1'); h.textContent = '👻 ' + DENIED_TITLE
  const lead = document.createElement('p'); lead.textContent = DENIED_LEAD[kind]
  const ol = document.createElement('ol')
  for (const step of deniedInstructions(kind)) {
    const li = document.createElement('li'); li.textContent = step; ol.appendChild(li)
  }
  const privacy = document.createElement('p'); privacy.className = 'privacy'; privacy.textContent = PRIVACY_LINE
  const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Try again'
  btn.addEventListener('click', () => { hideCameraDenied(); onRetry() })

  div.append(h, lead, ol, privacy, btn)
  deniedEl = div
  ui.appendChild(div)
  btn.focus()
}

export function hideCameraDenied(): void {
  if (deniedEl) { deniedEl.remove(); deniedEl = null }
}

// ─── Guide drawing ────────────────────────────────────────────────────────────

const C_ORANGE = '#ff6b1a'
const C_GREEN = '#39ff14'

export function drawGuide(ctx: CanvasRenderingContext2D, stable: boolean, timeMs: number): void {
  const { width: w, height: h } = ctx.canvas
  const g = guideGeometry(w, h)
  const pulse = 0.75 + 0.25 * Math.sin(timeMs / 400) // visual only
  ctx.clearRect(0, 0, w, h)
  ctx.save()
  ctx.strokeStyle = stable ? C_GREEN : C_ORANGE
  ctx.shadowColor = ctx.strokeStyle
  ctx.shadowBlur = 14
  ctx.lineWidth = Math.max(3, h / 200)
  ctx.globalAlpha = pulse
  ctx.setLineDash([14, 10])
  ctx.fillStyle = 'rgba(232,232,240,0.06)'

  ctx.beginPath()
  ctx.ellipse(g.head.cx, g.head.cy, g.head.rx, g.head.ry, 0, 0, Math.PI * 2)
  ctx.fill(); ctx.stroke()

  ctx.beginPath()
  ctx.arc(g.shoulders.cx, g.shoulders.cy, g.shoulders.r, g.shoulders.from, g.shoulders.to)
  ctx.lineTo(g.shoulders.cx + g.shoulders.r, h)
  ctx.lineTo(g.shoulders.cx - g.shoulders.r, h)
  ctx.closePath()
  ctx.fill(); ctx.stroke()

  for (const hand of g.hands) {
    ctx.beginPath(); ctx.arc(hand.cx, hand.cy, hand.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath(); ctx.arc(hand.cx, hand.cy, hand.r * 0.35, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([14, 10])
  }
  ctx.restore()
}

// ─── Onboarding loop ──────────────────────────────────────────────────────────

const SAMPLE_W = 64
const SAMPLE_H = 36

/** A camera track muted this long is treated as lost (R8.2). */
export const MUTE_LOST_MS = 3000

export type OnboardingResult = 'done' | 'cameraLost'

/**
 * Runs the onboarding over the live webcam until the player finishes or skips
 * (`'done'`, seen flag already persisted) or the camera track ends (`'cameraLost'`).
 */
export function runOnboarding(
  video: HTMLVideoElement,
  webcamCtx: CanvasRenderingContext2D,
  gameCtx: CanvasRenderingContext2D,
  storage: OnboardingStorage | null,
  initial: OnboardingState = createOnboarding(false),
  onState: (s: OnboardingState) => void = () => {},
): Promise<OnboardingResult> {
  return new Promise((resolve) => {
    // Shared with the caller (via onState) so a camera-loss retry resumes the same step.
    let state: OnboardingState = initial
    const sample = document.createElement('canvas')
    sample.width = SAMPLE_W; sample.height = SAMPLE_H
    const sampleCtx = sample.getContext('2d', { willReadFrequently: true })!

    const panel = buildPanel()
    document.getElementById('ui')!.appendChild(panel.root)

    let rafId = 0
    let last = 0
    let sinceSample = 0
    let finished = false

    function dispatch(e: OnboardingEvent): void {
      const next = onboardingReducer(state, e)
      if (shouldPersist(state, next)) persistSeen(storage)
      const changed = next.step !== state.step || next.howtoIndex !== state.howtoIndex
      state = next
      onState(state)
      if (state.step === 'done') { finish(); return }
      if (changed) panel.render(state)
    }

    // Camera unplugged / revoked mid-onboarding: hand control back so the caller can show R5.
    const tracks = video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks() : []
    const onTrackEnded = (): void => finish('cameraLost')
    for (const t of tracks) t.addEventListener('ended', onTrackEnded)
    // A track muted for a while (camera taken by another app, black frames) counts as lost too;
    // a brief mute that recovers does not.
    let muteTimer: ReturnType<typeof setTimeout> | null = null
    const clearMute = (): void => { if (muteTimer !== null) { clearTimeout(muteTimer); muteTimer = null } }
    const onMute = (): void => { if (muteTimer === null) muteTimer = setTimeout(() => finish('cameraLost'), MUTE_LOST_MS) }
    for (const t of tracks) { t.addEventListener('mute', onMute); t.addEventListener('unmute', clearMute) }
    // A track that already ended never fires again; resolve once the panel is up.
    const alreadyEnded = tracks.some((t) => t.readyState === 'ended')

    function finish(result: OnboardingResult = 'done'): void {
      if (finished) return
      finished = true
      cancelAnimationFrame(rafId)
      window.removeEventListener('keydown', onKey, true)
      clearMute()
      for (const t of tracks) {
        t.removeEventListener('ended', onTrackEnded)
        t.removeEventListener('mute', onMute)
        t.removeEventListener('unmute', clearMute)
      }
      panel.root.remove()
      gameCtx.clearRect(0, 0, gameCtx.canvas.width, gameCtx.canvas.height)
      resolve(result)
    }

    function onKey(e: KeyboardEvent): void {
      if (e.repeat) { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); return } // holding a key must not run through every card
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dispatch({ type: 'skip' }) }
      else if (e.key === 'Enter' || e.key === ' ') {
        // let a focused button handle its own activation
        if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') { e.stopPropagation(); return }
        e.preventDefault(); e.stopPropagation(); dispatch({ type: 'next' })
      }
    }
    // Capture phase: Space here must not also reach main.ts's Space-to-start handler.
    window.addEventListener('keydown', onKey, true)
    panel.onNext = () => dispatch({ type: 'next' })
    panel.onBack = () => dispatch({ type: 'back' })
    panel.onSkip = () => dispatch({ type: 'skip' })
    panel.render(state)

    function tick(ts: number): void {
      const deltaMs = last === 0 ? 16 : Math.min(ts - last, 100)
      last = ts
      drawWebcamFrame(webcamCtx, video)
      drawWebcamTint(webcamCtx)

      if (state.step === 'guide') {
        // No frame yet (or stalled): don't bank time, so ok-time only counts observed samples.
        if (video.readyState < 2) {
          sinceSample = 0
          // Don't leave "Looking good!" over a frozen picture.
          if (state.framing !== null) { dispatch({ type: 'noFrame' }); panel.setFraming(state) }
        } else sinceSample += deltaMs
        if (sinceSample >= FRAMING_INTERVAL_MS) {
          const elapsed = sinceSample
          sinceSample = 0
          sampleCtx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H)
          const img = sampleCtx.getImageData(0, 0, SAMPLE_W, SAMPLE_H)
          const status = checkFraming(img)
          const before = state.framing
          dispatch({ type: 'framing', status, deltaMs: elapsed })
          if (before !== state.framing || status === 'ok') panel.setFraming(state)
        }
        drawGuide(gameCtx, isFramingStable(state.framingOkMs), ts)
      } else {
        gameCtx.clearRect(0, 0, gameCtx.canvas.width, gameCtx.canvas.height)
      }
      if (!finished) rafId = requestAnimationFrame(tick)
    }
    if (alreadyEnded) finish('cameraLost')
    else rafId = requestAnimationFrame(tick)
  })
}

interface Panel {
  root: HTMLElement
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  render(s: OnboardingState): void
  setFraming(s: OnboardingState): void
}

function buildPanel(): Panel {
  const root = document.createElement('div')
  root.className = 'onboarding'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-label', 'How to play Exorcise')

  const title = document.createElement('h1'); title.className = 'onboarding-title'
  const body = document.createElement('p'); body.className = 'onboarding-body'
  const hint = document.createElement('p'); hint.className = 'onboarding-hint'; hint.setAttribute('role', 'status')
  const dots = document.createElement('div'); dots.className = 'onboarding-dots'; dots.setAttribute('aria-hidden', 'true')
  const privacy = document.createElement('p'); privacy.className = 'privacy'; privacy.textContent = PRIVACY_LINE

  const buttons = document.createElement('div'); buttons.className = 'onboarding-buttons'
  const mk = (label: string, cls: string): HTMLButtonElement => {
    const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; return b
  }
  const back = mk('Back', 'secondary'), skip = mk('Skip', 'secondary'), next = mk('Next', 'primary')
  buttons.append(skip, back, next)
  root.append(title, body, hint, dots, buttons, privacy)

  let focusTarget: HTMLButtonElement | null = null
  const panel: Panel = {
    root,
    onNext: () => {}, onBack: () => {}, onSkip: () => {},
    render(s) {
      if (s.step === 'guide') {
        title.textContent = GUIDE_TITLE
        body.textContent = GUIDE_TEXT
        hint.hidden = false
        dots.hidden = true
        back.hidden = true
        next.textContent = 'Next'
        panel.setFraming(s)
      } else if (s.step === 'howto') {
        const step = HOWTO_STEPS[s.howtoIndex]
        title.textContent = `How to play ${s.howtoIndex + 1}/${HOWTO_STEPS.length}`
        body.textContent = `${step.icon}  ${step.text}`
        hint.hidden = true
        dots.hidden = false
        dots.textContent = HOWTO_STEPS.map((_, i) => (i === s.howtoIndex ? '●' : '○')).join(' ')
        back.hidden = false
        next.textContent = s.howtoIndex === HOWTO_STEPS.length - 1 ? 'Let’s play!' : 'Next'
      }
      // Keep focus on the button the player just used if it is still shown (Back, then Enter, goes back again).
      const target = focusTarget && !focusTarget.hidden ? focusTarget : next
      target.focus()
    },
    setFraming(s) {
      if (s.framing === null) { hint.textContent = ''; delete hint.dataset.status; return }
      hint.textContent = s.framing === 'ok' && !isFramingStable(s.framingOkMs) ? '' : FRAMING_HINTS[s.framing]
      hint.dataset.status = s.framing
    },
  }
  next.addEventListener('click', () => { focusTarget = next; panel.onNext() })
  back.addEventListener('click', () => { focusTarget = back; panel.onBack() })
  skip.addEventListener('click', () => panel.onSkip())
  return panel
}
