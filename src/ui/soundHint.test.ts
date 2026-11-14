import { describe, it, expect, vi } from 'vitest'
import { createSoundHintController } from './soundHint'

describe('sound hint auto-hide (motion-ui-ergonomics R6.2)', () => {
  it('shows while locked, hides after the timeout, and hides on unlock', () => {
    vi.useFakeTimers()
    const hidden: boolean[] = []
    const on = createSoundHintController((h) => hidden.push(h), 8000)
    on(true)
    expect(hidden[hidden.length - 1]).toBe(false)
    vi.advanceTimersByTime(7999)
    expect(hidden[hidden.length - 1]).toBe(false)
    vi.advanceTimersByTime(1)
    expect(hidden[hidden.length - 1]).toBe(true)
    on(true); on(false)
    expect(hidden[hidden.length - 1]).toBe(true)
    vi.advanceTimersByTime(10000)
    expect(hidden.filter((h) => !h).length).toBe(2)
    vi.useRealTimers()
  })
})

describe('sound hint default timers (motion-ui-ergonomics R6.2)', () => {
  it('call the globals unbound (browsers throw Illegal invocation otherwise)', () => {
    const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout
    const thisSeen: unknown[] = []
    const strict = (fn: (...a: never[]) => unknown) =>
      function (this: unknown, ...a: never[]) {
        thisSeen.push(this)
        if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
        return fn(...a)
      }
    globalThis.setTimeout = strict(realSet as never) as never
    globalThis.clearTimeout = strict(realClear as never) as never
    try {
      const on = createSoundHintController(() => {}, 10)
      expect(() => { on(true); on(false) }).not.toThrow()
      expect(thisSeen.length).toBeGreaterThan(0)
    } finally {
      globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear
    }
  })
})
