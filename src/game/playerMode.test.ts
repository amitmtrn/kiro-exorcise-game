import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getPlayerMode, setPlayerMode, resetPlayerMode, modeForKey, resolveStartRequest } from './playerMode'

beforeEach(() => resetPlayerMode())

describe('player mode (two-player R6)', () => {
  it('defaults to 1 player', () => {
    expect(getPlayerMode()).toBe(1)
  })

  it('remembers the last chosen mode', () => {
    setPlayerMode(2)
    expect(getPlayerMode()).toBe(2)
    setPlayerMode(1)
    expect(getPlayerMode()).toBe(1)
  })

  it('keys 1 and 2 map to a mode, everything else does not', () => {
    expect(modeForKey('1')).toBe(1)
    expect(modeForKey('2')).toBe(2)
    for (const k of ['3', '0', ' ', 'a', 'Enter', '12', '']) expect(modeForKey(k)).toBeNull()
  })

  it('an explicit start request sets the mode; Space ("last") keeps it', () => {
    expect(resolveStartRequest('last')).toBe(1)
    expect(resolveStartRequest(2)).toBe(2)
    expect(resolveStartRequest('last')).toBe(2)
    expect(resolveStartRequest(1)).toBe(1)
    expect(resolveStartRequest('last')).toBe(1)
  })

  it('is memory only: nothing touches localStorage, sessionStorage, document.cookie or the URL', () => {
    const touch = vi.fn()
    const trap = { getItem: touch, setItem: touch, removeItem: touch, clear: touch }
    vi.stubGlobal('localStorage', trap)
    vi.stubGlobal('sessionStorage', trap)
    setPlayerMode(2)
    resolveStartRequest(1)
    resolveStartRequest('last')
    expect(touch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
