/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import { PRIVACY_LINE } from '../game/onboarding'

const raw = import.meta.glob<string>(
  ['./*.ts', '!./*.test.ts', '../ui/cardScreen.ts', '../ui/seatCard.ts', '../game/rank.ts', '../game/runStats.ts'],
  { query: '?raw', import: 'default', eager: true })
const sources = Object.entries(raw)

// Strip comments so the doc comments that *mention* the rules don't trip the check.
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('exorcist card privacy', () => {
  it('has source files to check', () => {
    expect(sources.length).toBeGreaterThanOrEqual(4)
    const names = sources.map(([f]) => f)
    for (const f of ['../ui/cardScreen.ts', '../ui/seatCard.ts', '../game/rank.ts', '../game/runStats.ts', './halfSnapshot.ts', './twoPlayerCard.ts']) expect(names).toContain(f)
  })

  it.each(sources)('%s uses no network or storage API', (_f, src) => {
    const c = code(src)
    for (const banned of [
      'fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource',
      'localStorage', 'sessionStorage', 'indexedDB', 'caches.', 'document.cookie',
      'navigator.share', 'http://', 'https://',
    ]) {
      expect(c, `${_f} mentions ${banned}`).not.toContain(banned)
    }
  })

  it('keeps the exact onboarding privacy line', () => {
    expect(PRIVACY_LINE).toBe('Your video stays on your device. Nothing is uploaded.')
  })
})
