/**
 * Onboarding — pure state machine for the first-run screen, plus the
 * localStorage "seen" flag. No DOM, no I/O in the reducer (onboarding R1, R4).
 */

import type { FramingStatus } from '../webcam/framing'
import { tickFraming } from '../webcam/framing'

export const ONBOARDING_STORAGE_KEY = 'exorcise.onboarding.v1'

export const PRIVACY_LINE = 'Your video stays on your device. Nothing is uploaded.'
export const GUIDE_TITLE = 'Get ready!'
export const GUIDE_TEXT = 'Stand back so your head and both hands are in frame'

export const HOWTO_STEPS: ReadonlyArray<{ icon: string; text: string }> = [
  { icon: '👻', text: 'Swat the ghosts and bats with your hands' },
  { icon: '🚫', text: "Don't touch the cursed skull ☠" },
  { icon: '🔥', text: 'Chain hits to build combos' },
]

/** One line on the last how-to card about the stage-6 ghosts (more-content R7.3). */
export const HOWTO_LATER = 'Later stages bring twin wisps, mirror ghosts and blinkers'

/** Body text of how-to card `i`: the last card adds the HOWTO_LATER line. */
export function howtoBody(i: number): string {
  const step = HOWTO_STEPS[i]
  const base = `${step.icon}  ${step.text}`
  return i === HOWTO_STEPS.length - 1 ? `${base}. ${HOWTO_LATER}.` : base
}

export type OnboardingStep = 'guide' | 'howto' | 'denied' | 'done'
export type ResumeStep = 'guide' | 'howto' | 'done'

export interface OnboardingState {
  step: OnboardingStep
  howtoIndex: 0 | 1 | 2
  /** Where `retry` goes back to after a camera denial. */
  resume: ResumeStep
  framing: FramingStatus | null
  framingOkMs: number
  /** True once the player finished or skipped (or it was already stored). */
  seen: boolean
}

export type OnboardingEvent =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'skip' }
  | { type: 'cameraDenied' }
  | { type: 'retry' }
  | { type: 'noFrame' }
  | { type: 'framing'; status: FramingStatus; deltaMs: number }

const FRAMING_RESET = { framing: null, framingOkMs: 0 } as const

export function createOnboarding(seen: boolean): OnboardingState {
  return {
    step: seen ? 'done' : 'guide',
    howtoIndex: 0,
    resume: seen ? 'done' : 'guide',
    framing: null,
    framingOkMs: 0,
    seen,
  }
}

export function onboardingReducer(s: OnboardingState, e: OnboardingEvent): OnboardingState {
  switch (e.type) {
    case 'cameraDenied':
      if (s.step === 'denied') return s
      return { ...s, step: 'denied', resume: s.step }
    case 'retry':
      if (s.step !== 'denied') return s
      return { ...s, step: s.resume, ...(s.resume === 'guide' ? FRAMING_RESET : {}) }
    case 'skip':
      if (s.step !== 'guide' && s.step !== 'howto') return s
      return { ...s, step: 'done', resume: 'done', seen: true }
    case 'next':
      if (s.step === 'guide') return { ...s, step: 'howto', resume: 'howto', howtoIndex: 0, ...FRAMING_RESET }
      if (s.step === 'howto') {
        if (s.howtoIndex < 2) return { ...s, howtoIndex: (s.howtoIndex + 1) as 1 | 2 }
        return { ...s, step: 'done', resume: 'done', seen: true }
      }
      return s
    case 'back':
      if (s.step === 'howto') {
        if (s.howtoIndex > 0) return { ...s, howtoIndex: (s.howtoIndex - 1) as 0 | 1 }
        return { ...s, step: 'guide', resume: 'guide', ...FRAMING_RESET }
      }
      return s
    case 'noFrame':
      if (s.step !== 'guide' || s.framing === null) return s
      return { ...s, ...FRAMING_RESET }
    case 'framing': {
      if (s.step !== 'guide') return s
      // The first ok sample after a non-ok (or first) one only starts the clock:
      // stability is measured over observed ok time, not the interval before it.
      const base = s.framing === 'ok' ? s.framingOkMs : 0
      const ms = e.status === 'ok' && s.framing !== 'ok' ? 0 : tickFraming(base, e.status, e.deltaMs)
      return { ...s, framing: e.status, framingOkMs: ms }
    }
  }
}

/** The caller persists the flag exactly when it flips to true. */
export function shouldPersist(prev: OnboardingState, next: OnboardingState): boolean {
  return !prev.seen && next.seen
}

// ─── Storage (never throws) ───────────────────────────────────────────────────

export type OnboardingStorage = Pick<Storage, 'getItem' | 'setItem'>

export function hasSeenOnboarding(storage: OnboardingStorage | null | undefined): boolean {
  try {
    return storage?.getItem(ONBOARDING_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function persistSeen(storage: OnboardingStorage | null | undefined): void {
  try {
    storage?.setItem(ONBOARDING_STORAGE_KEY, '1')
  } catch { /* private mode / blocked storage: onboarding shows again next visit */ }
}

/** `window.localStorage`, or null when access itself throws (blocked cookies). */
export function getLocalStorage(): OnboardingStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
