import { describe, it, expect, beforeEach, vi } from 'vitest'

// AudioContext is not available in Node — provide a minimal class mock
const mockGainValue = { value: 1 }
const mockGainNode = { gain: mockGainValue, connect: vi.fn() }

class MockAudioContext {
  state = 'running'
  destination = {}
  createGain() { return mockGainNode }
  resume() { return Promise.resolve() }
}

vi.stubGlobal('AudioContext', MockAudioContext)
vi.stubGlobal('localStorage', {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
})

// Dynamic import so stubs are in place before the module initialises
const mod = await import('./context')
const { setMuted, isMuted, toggleMute, setVolume, getVolume, getMasterGain } = mod

beforeEach(() => {
  mockGainValue.value = 1
  // Reset module-level state by calling setMuted(false) + setVolume(1)
  setMuted(false)
  setVolume(1)
})

describe('setMuted / isMuted', () => {
  it('setMuted(true) sets gain to 0', () => {
    setMuted(true)
    expect(isMuted()).toBe(true)
    expect(getMasterGain().gain.value).toBe(0)
  })

  it('setMuted(false) restores volume', () => {
    setVolume(0.8)
    setMuted(true)
    setMuted(false)
    expect(isMuted()).toBe(false)
    expect(getMasterGain().gain.value).toBe(0.8)
  })
})

describe('toggleMute', () => {
  it('flips mute state', () => {
    setMuted(false)
    toggleMute()
    expect(isMuted()).toBe(true)
    toggleMute()
    expect(isMuted()).toBe(false)
  })
})

describe('setVolume', () => {
  it('clamps to [0, 1]', () => {
    setVolume(2); expect(getVolume()).toBe(1)
    setVolume(-1); expect(getVolume()).toBe(0)
  })

  it('updates gain when not muted', () => {
    setMuted(false)
    setVolume(0.5)
    expect(getMasterGain().gain.value).toBe(0.5)
  })

  it('does not update gain when muted', () => {
    setMuted(true)
    setVolume(0.9)
    expect(getMasterGain().gain.value).toBe(0) // still 0 while muted
  })
})
