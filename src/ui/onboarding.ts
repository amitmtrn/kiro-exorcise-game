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
  const unit = Math.min(h, w * 0.6)
  const head = { cx: w / 2, cy: h * 0.34, rx: unit * 0.09, ry: unit * 0.115 }
  const shR = Math.min(w * 0.17, unit * 0.3)
  return {
    head,
    shoulders: { cx: w / 2, cy: h * 0.62, r: shR, from: Math.PI, to: 2 * Math.PI },
    hands: [
      { cx: w * 0.2, cy: h * 0.62, r: unit * 0.07 },
      { cx: w * 0.8, cy: h * 0.62, r: unit * 0.07 },
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
export const DENIED_INSTRUCTIONS: readonly string[] = [
  'Click the camera or lock icon in your browser’s address bar.',
  'Set Camera to “Allow” for this page.',
  'Close other apps or tabs that might be using the camera.',
  'Press “Try again” below.',
]

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
  for (const step of DENIED_INSTRUCTIONS) {
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

/**
 * Runs the onboarding over the live webcam until the player finishes or skips.
 * Resolves once the step is `done`; the seen flag has been persisted by then.
 */
export function runOnboarding(
  video: HTMLVideoElement,
  webcamCtx: CanvasRenderingContext2D,
  gameCtx: CanvasRenderingContext2D,
  storage: OnboardingStorage | null,
): Promise<void> {
  return new Promise((resolve) => {
    let state: OnboardingState = createOnboarding(false)
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
      if (state.step === 'done') { finish(); return }
      if (changed) panel.render(state)
    }

    function finish(): void {
      if (finished) return
      finished = true
      cancelAnimationFrame(rafId)
      window.removeEventListener('keydown', onKey, true)
      panel.root.remove()
      gameCtx.clearRect(0, 0, gameCtx.canvas.width, gameCtx.canvas.height)
      resolve()
    }

    function onKey(e: KeyboardEvent): void {
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
        sinceSample += deltaMs
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
    rafId = requestAnimationFrame(tick)
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
      next.focus()
    },
    setFraming(s) {
      if (s.framing === null) { hint.textContent = ''; return }
      hint.textContent = s.framing === 'ok' && !isFramingStable(s.framingOkMs) ? '' : FRAMING_HINTS[s.framing]
      hint.dataset.status = s.framing
    },
  }
  next.addEventListener('click', () => panel.onNext())
  back.addEventListener('click', () => panel.onBack())
  skip.addEventListener('click', () => panel.onSkip())
  return panel
}
