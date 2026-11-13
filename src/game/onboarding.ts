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
  { icon: '☠️', text: "Don't touch the cursed skull" },
  { icon: '🔥', text: 'Chain hits to build combos' },
]

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
  | { type: 'framing'; status: FramingStatus; deltaMs: number }

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
      return { ...s, step: s.resume }
    case 'skip':
      if (s.step !== 'guide' && s.step !== 'howto') return s
      return { ...s, step: 'done', resume: 'done', seen: true }
    case 'next':
      if (s.step === 'guide') return { ...s, step: 'howto', resume: 'howto', howtoIndex: 0 }
      if (s.step === 'howto') {
        if (s.howtoIndex < 2) return { ...s, howtoIndex: (s.howtoIndex + 1) as 1 | 2 }
        return { ...s, step: 'done', resume: 'done', seen: true }
      }
      return s
    case 'back':
      if (s.step === 'howto') {
        if (s.howtoIndex > 0) return { ...s, howtoIndex: (s.howtoIndex - 1) as 0 | 1 }
        return { ...s, step: 'guide', resume: 'guide' }
      }
      return s
    case 'framing':
      if (s.step !== 'guide') return s
      return { ...s, framing: e.status, framingOkMs: tickFraming(s.framingOkMs, e.status, e.deltaMs) }
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
