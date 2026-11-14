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
