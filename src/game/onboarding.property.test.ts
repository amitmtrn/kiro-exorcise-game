import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { createOnboarding, onboardingReducer, shouldPersist, type OnboardingEvent } from './onboarding'

const eventArb: fc.Arbitrary<OnboardingEvent> = fc.oneof(
  fc.constant<OnboardingEvent>({ type: 'next' }),
  fc.constant<OnboardingEvent>({ type: 'back' }),
  fc.constant<OnboardingEvent>({ type: 'skip' }),
  fc.constant<OnboardingEvent>({ type: 'cameraDenied' }),
  fc.constant<OnboardingEvent>({ type: 'retry' }),
  fc.record({
    type: fc.constant('framing' as const),
    status: fc.constantFrom('ok', 'too-dark', 'too-close', 'low-detail' as const),
    deltaMs: fc.integer({ min: 0, max: 500 }),
  }) as fc.Arbitrary<OnboardingEvent>,
)

describe('onboarding reducer (property)', () => {
  it('always stays in a valid state', () => {
    fc.assert(fc.property(fc.boolean(), fc.array(eventArb, { maxLength: 60 }), (seen, events) => {
      let s = createOnboarding(seen)
      for (const e of events) {
        s = onboardingReducer(s, e)
        expect(['guide', 'howto', 'denied', 'done']).toContain(s.step)
        expect([0, 1, 2]).toContain(s.howtoIndex)
        expect(['guide', 'howto', 'done']).toContain(s.resume)
        expect(s.framingOkMs).toBeGreaterThanOrEqual(0)
        if (s.step === 'done') expect(s.seen).toBe(true)
      }
    }))
  })

  it('seen never reverts, and persists exactly once per run', () => {
    fc.assert(fc.property(fc.array(eventArb, { maxLength: 80 }), (events) => {
      let s = createOnboarding(false)
      let persists = 0
      for (const e of events) {
        const n = onboardingReducer(s, e)
        if (shouldPersist(s, n)) persists++
        if (s.seen) expect(n.seen).toBe(true)
        s = n
      }
      expect(persists).toBe(s.seen ? 1 : 0)
    }))
  })

  it('denied never marks seen by itself', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom<OnboardingEvent>({ type: 'next' }, { type: 'back' }, { type: 'cameraDenied' }), { maxLength: 2 }), (events) => {
      const s = [...events, { type: 'cameraDenied' } as OnboardingEvent].reduce(onboardingReducer, createOnboarding(false))
      expect(s.step).toBe('denied')
      expect(s.seen).toBe(false)
    }))
  })

  it('a stored flag always starts done', () => {
    expect(createOnboarding(true).step).toBe('done')
  })
})
