import { describe, it, expect } from 'vitest'
import {
  createOnboarding, onboardingReducer as r, shouldPersist, hasSeenOnboarding, persistSeen,
  ONBOARDING_STORAGE_KEY, PRIVACY_LINE, HOWTO_STEPS, GUIDE_TEXT,
  type OnboardingState, type OnboardingEvent, type OnboardingStorage,
} from './onboarding'

const run = (s: OnboardingState, ...ev: OnboardingEvent[]) => ev.reduce(r, s)
const memStore = (init: Record<string, string> = {}): OnboardingStorage & { map: Record<string, string> } => ({
  map: init,
  getItem(k) { return k in this.map ? this.map[k] : null },
  setItem(k, v) { this.map[k] = v },
})

describe('copy', () => {
  it('uses the exact privacy line', () => {
    expect(PRIVACY_LINE).toBe('Your video stays on your device. Nothing is uploaded.')
  })
  it('has the three how-to steps in order', () => {
    expect(HOWTO_STEPS.map(s => s.text)).toEqual([
      'Swat the ghosts and bats with your hands',
      "Don't touch the cursed skull",
      'Chain hits to build combos',
    ])
  })
  it('has the guide text', () => {
    expect(GUIDE_TEXT).toBe('Stand back so your head and both hands are in frame')
  })
})

describe('first run', () => {
  it('starts in guide when nothing is stored', () => {
    const s = createOnboarding(false)
    expect(s.step).toBe('guide')
    expect(s.seen).toBe(false)
  })

  it('walks guide → howto 0 → 1 → 2 → done and marks seen', () => {
    let s = createOnboarding(false)
    s = run(s, { type: 'next' })
    expect([s.step, s.howtoIndex]).toEqual(['howto', 0])
    s = run(s, { type: 'next' }); expect(s.howtoIndex).toBe(1)
    s = run(s, { type: 'next' }); expect(s.howtoIndex).toBe(2)
    expect(s.seen).toBe(false)
    s = run(s, { type: 'next' })
    expect(s.step).toBe('done')
    expect(s.seen).toBe(true)
  })

  it('back goes one step back and stops at the guide', () => {
    let s = run(createOnboarding(false), { type: 'next' }, { type: 'next' })
    s = run(s, { type: 'back' }); expect(s.howtoIndex).toBe(0)
    s = run(s, { type: 'back' }); expect(s.step).toBe('guide')
    expect(run(s, { type: 'back' })).toBe(s)
  })
})

describe('skip', () => {
  it('skips from the guide and marks seen', () => {
    const s = run(createOnboarding(false), { type: 'skip' })
    expect(s.step).toBe('done'); expect(s.seen).toBe(true)
  })
  it('skips from a how-to step', () => {
    const s = run(createOnboarding(false), { type: 'next' }, { type: 'next' }, { type: 'skip' })
    expect(s.step).toBe('done'); expect(s.seen).toBe(true)
  })
  it('is ignored once done or denied', () => {
    const done = createOnboarding(true)
    expect(run(done, { type: 'skip' })).toBe(done)
    const den = run(createOnboarding(false), { type: 'cameraDenied' })
    expect(run(den, { type: 'skip' })).toBe(den)
  })
})

describe('remembered', () => {
  it('starts done when the flag is stored', () => {
    const store = memStore({ [ONBOARDING_STORAGE_KEY]: '1' })
    const s = createOnboarding(hasSeenOnboarding(store))
    expect(s.step).toBe('done')
  })
  it('round-trips through storage', () => {
    const store = memStore()
    expect(hasSeenOnboarding(store)).toBe(false)
    persistSeen(store)
    expect(store.map[ONBOARDING_STORAGE_KEY]).toBe('1')
    expect(hasSeenOnboarding(store)).toBe(true)
  })
  it('ignores other values', () => {
    expect(hasSeenOnboarding(memStore({ [ONBOARDING_STORAGE_KEY]: 'yes' }))).toBe(false)
  })
  it('never throws when storage throws or is missing', () => {
    const bad: OnboardingStorage = {
      getItem() { throw new Error('denied') },
      setItem() { throw new Error('denied') },
    }
    expect(hasSeenOnboarding(bad)).toBe(false)
    expect(() => persistSeen(bad)).not.toThrow()
    expect(hasSeenOnboarding(null)).toBe(false)
    expect(() => persistSeen(undefined)).not.toThrow()
  })
  it('shouldPersist fires exactly when seen flips', () => {
    const a = createOnboarding(false)
    const b = run(a, { type: 'skip' })
    expect(shouldPersist(a, a)).toBe(false)
    expect(shouldPersist(a, b)).toBe(true)
    expect(shouldPersist(b, b)).toBe(false)
    expect(shouldPersist(createOnboarding(true), createOnboarding(true))).toBe(false)
  })
})

describe('permission denied', () => {
  it('enters denied from the guide and resumes it on retry, without marking seen', () => {
    const d = run(createOnboarding(false), { type: 'cameraDenied' })
    expect(d.step).toBe('denied'); expect(d.seen).toBe(false)
    expect(shouldPersist(createOnboarding(false), d)).toBe(false)
    expect(run(d, { type: 'retry' }).step).toBe('guide')
  })
  it('resumes the how-to step it was on', () => {
    const s = run(createOnboarding(false), { type: 'next' }, { type: 'next' }, { type: 'cameraDenied' }, { type: 'retry' })
    expect([s.step, s.howtoIndex]).toEqual(['howto', 1])
  })
  it('a returning player denied the camera resumes to done', () => {
    const s = run(createOnboarding(true), { type: 'cameraDenied' })
    expect(s.step).toBe('denied')
    expect(run(s, { type: 'retry' }).step).toBe('done')
  })
  it('only retry leaves denied; repeated denial keeps the resume step', () => {
    const d = run(createOnboarding(false), { type: 'cameraDenied' })
    expect(run(d, { type: 'next' }, { type: 'back' }, { type: 'cameraDenied' })).toEqual(d)
  })
  it('retry outside denied is a no-op', () => {
    const s = createOnboarding(false)
    expect(run(s, { type: 'retry' })).toBe(s)
  })
})

describe('framing events', () => {
  it('accumulates ok time in the guide and resets on a bad reading', () => {
    let s = createOnboarding(false)
    s = run(s, { type: 'framing', status: 'ok', deltaMs: 250 }, { type: 'framing', status: 'ok', deltaMs: 250 })
    expect(s.framingOkMs).toBe(500)
    s = run(s, { type: 'framing', status: 'too-close', deltaMs: 250 })
    expect([s.framing, s.framingOkMs]).toEqual(['too-close', 0])
  })
  it('is ignored outside the guide', () => {
    const s = run(createOnboarding(false), { type: 'next' })
    expect(run(s, { type: 'framing', status: 'ok', deltaMs: 250 })).toBe(s)
  })
})
