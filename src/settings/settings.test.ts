import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseSettingsParams, loadSettings, saveSettings, resolveSettings, baseSettings, nextTextScale,
  SETTINGS_KEY, DEFAULT_SETTINGS, TEXT_SCALES, type SettingsStorage,
} from './settings'
import { initSettings, updateSettings, getSettings, subscribeSettings, resetSettings } from './runtime'

class MemStorage implements SettingsStorage {
  data = new Map<string, string>()
  getItem(k: string) { return this.data.get(k) ?? null }
  setItem(k: string, v: string) { this.data.set(k, v) }
}

describe('URL parameters (R7.5)', () => {
  it('parses cb, bigtext and reducedflash', () => {
    expect(parseSettingsParams('?cb=1')).toEqual({ cb: true })
    expect(parseSettingsParams('?cb=0')).toEqual({ cb: false })
    expect(parseSettingsParams('?bigtext=1')).toEqual({ textScale: 1.25 })
    expect(parseSettingsParams('?bigtext=2')).toEqual({ textScale: 1.5 })
    expect(parseSettingsParams('?bigtext=0')).toEqual({ textScale: 1 })
    expect(parseSettingsParams('?reducedflash=1&cb=true&bigtext=1')).toEqual({ reducedFlash: true, cb: true, textScale: 1.25 })
  })
  it('ignores unknown values and other parameters', () => {
    expect(parseSettingsParams('')).toEqual({})
    expect(parseSettingsParams('?cb=maybe&bigtext=9&reducedflash=')).toEqual({})
    expect(parseSettingsParams('?quality=low&seed=3&demo=1')).toEqual({})
  })
})

describe('storage (R7.4)', () => {
  it('uses one key and writes only setting fields', () => {
    const st = new MemStorage()
    saveSettings(st, { cb: true, textScale: 1.5, reducedFlash: false, evil: 'x', video: 'frame' } as never)
    expect([...st.data.keys()]).toEqual([SETTINGS_KEY])
    expect(SETTINGS_KEY).toBe('exorcise-settings')
    expect(JSON.parse(st.data.get(SETTINGS_KEY)!)).toEqual({ cb: true, textScale: 1.5, reducedFlash: false })
  })
  it('round-trips', () => {
    const st = new MemStorage()
    saveSettings(st, { cb: true, textScale: 1.25, reducedFlash: true })
    expect(loadSettings(st)).toEqual({ cb: true, textScale: 1.25, reducedFlash: true })
  })
  it('drops invalid fields and survives garbage, missing and throwing storage', () => {
    const st = new MemStorage()
    st.setItem(SETTINGS_KEY, JSON.stringify({ cb: 'yes', textScale: 3, reducedFlash: true, extra: 1 }))
    expect(loadSettings(st)).toEqual({ reducedFlash: true })
    st.setItem(SETTINGS_KEY, '{nope')
    expect(loadSettings(st)).toEqual({})
    st.setItem(SETTINGS_KEY, '42')
    expect(loadSettings(st)).toEqual({})
    expect(loadSettings(null)).toEqual({})
    const bad: SettingsStorage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
    expect(loadSettings(bad)).toEqual({})
    expect(() => saveSettings(bad, DEFAULT_SETTINGS)).not.toThrow()
    expect(() => saveSettings(null, DEFAULT_SETTINGS)).not.toThrow()
  })
})

describe('resolution (R7.5, R7.6)', () => {
  it('defaults, then stored, then URL', () => {
    const st = new MemStorage()
    expect(resolveSettings({ storage: st, search: '', prefersReducedMotion: false })).toEqual(DEFAULT_SETTINGS)
    saveSettings(st, { cb: true, textScale: 1.5 })
    expect(resolveSettings({ storage: st, search: '', prefersReducedMotion: false })).toEqual({ cb: true, textScale: 1.5, reducedFlash: false })
    expect(resolveSettings({ storage: st, search: '?cb=0&bigtext=1', prefersReducedMotion: false })).toEqual({ cb: false, textScale: 1.25, reducedFlash: false })
  })
  it('prefers-reduced-motion turns reduced flashing on by default; stored and URL values win', () => {
    const st = new MemStorage()
    expect(baseSettings(st, true).reducedFlash).toBe(true)
    expect(resolveSettings({ storage: st, search: '?reducedflash=0', prefersReducedMotion: true }).reducedFlash).toBe(false)
    saveSettings(st, { reducedFlash: false })
    expect(resolveSettings({ storage: st, search: '', prefersReducedMotion: true }).reducedFlash).toBe(false)
  })
  it('cycles the text scale', () => {
    expect(TEXT_SCALES.map(nextTextScale)).toEqual([1.25, 1.5, 1])
  })
})

describe('live settings', () => {
  beforeEach(() => resetSettings())
  it('URL overrides are not saved; a panel change replaces the override and saves only chosen keys', () => {
    const st = new MemStorage()
    initSettings({ storage: st, search: '?cb=1', reducedMotion: true })
    expect(getSettings()).toEqual({ cb: true, textScale: 1, reducedFlash: true })
    expect(st.data.size).toBe(0) // nothing written by loading
    updateSettings({ textScale: 1.25 })
    expect(JSON.parse(st.data.get(SETTINGS_KEY)!)).toEqual({ textScale: 1.25 }) // no cb (URL), no reducedFlash (default)
    expect(getSettings().cb).toBe(true) // the URL still applies
    updateSettings({ cb: false })
    expect(getSettings().cb).toBe(false) // the explicit choice replaced the override
    expect(JSON.parse(st.data.get(SETTINGS_KEY)!)).toEqual({ cb: false, textScale: 1.25 })
  })
  it('notifies subscribers', () => {
    initSettings({ storage: null, search: '', reducedMotion: false })
    const seen: boolean[] = []
    const off = subscribeSettings((s) => seen.push(s.cb))
    updateSettings({ cb: true })
    off()
    updateSettings({ cb: false })
    expect(seen).toEqual([true])
  })
})
