import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadTitleFont } from './fonts'

describe('loadTitleFont timeout timer (nit 9)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
  it('clears its timeout once the font resolves', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('document', { fonts: { load: () => Promise.resolve([]) } })
    await loadTitleFont(1500)
    expect(vi.getTimerCount()).toBe(0)
  })
})
