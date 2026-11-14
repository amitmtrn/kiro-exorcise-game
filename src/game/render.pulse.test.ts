import { describe, it, expect, afterEach } from 'vitest'
import { pulseRate } from './render'
import { updateSettings, resetSettings } from '../settings/runtime'

afterEach(() => resetSettings())

describe('wind-up pulse rate (R10.3)', () => {
  it('is full speed normally and a quarter with reduced flashing', () => {
    updateSettings({ reducedFlash: false })
    expect(pulseRate()).toBe(1)
    updateSettings({ reducedFlash: true })
    expect(pulseRate()).toBe(0.25)
  })

  it('keeps the fastest wind-up pulse (period 2π·50 ms) at or under 1 Hz when reduced', () => {
    updateSettings({ reducedFlash: true })
    const hz = pulseRate() * 1000 / (2 * Math.PI * 50)
    expect(hz).toBeLessThanOrEqual(1)
  })
})
