import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { saveHighScore, loadHighScore, setHighScorePersistence, createInitialState, addScore } from '../game/state'

describe('demo scores never reach localStorage (demo-mode R6.4)', () => {
  const store = new Map<string, string>()
  const setItem = vi.fn((k: string, v: string) => { store.set(k, v) })
  beforeEach(() => {
    store.clear(); setItem.mockClear()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem })
  })
  afterEach(() => { setHighScorePersistence(true); vi.unstubAllGlobals() })

  it('persists normally by default', () => {
    saveHighScore(1234)
    expect(store.get('exorcise-highscore')).toBe('1234')
    expect(loadHighScore()).toBe(1234)
  })
  it('writes nothing and reads 0 while off', () => {
    store.set('exorcise-highscore', '999')
    setHighScorePersistence(false)
    saveHighScore(5000)
    expect(setItem).not.toHaveBeenCalled()
    expect(store.get('exorcise-highscore')).toBe('999')
    expect(loadHighScore()).toBe(0)
    expect(createInitialState(1).highScore).toBe(0)
  })
  it('in-memory best still follows demo scoring, but is never saved', () => {
    setHighScorePersistence(false)
    const s = addScore(createInitialState(1), 300)
    expect(s.highScore).toBe(300)
    saveHighScore(s.highScore)
    expect(setItem).not.toHaveBeenCalled()
  })
  it('is restored when switched back on', () => {
    setHighScorePersistence(false)
    setHighScorePersistence(true)
    saveHighScore(7)
    expect(store.get('exorcise-highscore')).toBe('7')
  })
})
