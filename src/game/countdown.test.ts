/** Countdown cues on every stage title card (playtest2-fixes R5.1): one tick per number, one "go". */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'

vi.mock('../audio/sfx', () => ({ sfxCountTick: vi.fn(), sfxCountGo: vi.fn() }))

import { createCountdownCues } from './countdown'
import { sfxCountTick, sfxCountGo } from '../audio/sfx'
import { STAGE_TITLE_DURATION_MS } from './state'

const tick = sfxCountTick as ReturnType<typeof vi.fn>
const go = sfxCountGo as ReturnType<typeof vi.fn>
beforeEach(() => { tick.mockClear(); go.mockClear() })

describe('countdown cues', () => {
  it('3, 2, 1 tick once each and "go" once, at any frame rate, for every title card in a row', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 10 }), fc.integer({ min: 1, max: 4 }), (dts, cards) => {
      tick.mockClear(); go.mockClear()
      const cues = createCountdownCues()
      for (let c = 0; c < cards; c++) {
        let ms = STAGE_TITLE_DURATION_MS
        const seen: number[] = []
        for (let i = 0; ms > 0; i++) {
          const before = tick.mock.calls.length
          cues.update(true, ms)
          if (tick.mock.calls.length > before) seen.push(Math.ceil(ms / 1000))
          ms = Math.max(0, ms - dts[i % dts.length])
        }
        for (let k = 0; k < 5; k++) cues.update(false, 0) // playing
        expect(seen).toEqual([3, 2, 1])
      }
      expect(tick).toHaveBeenCalledTimes(3 * cards)
      expect(go).toHaveBeenCalledTimes(cards)
    }), { numRuns: 200 })
  })

  it('outside a title card nothing plays', () => {
    const cues = createCountdownCues()
    for (let i = 0; i < 10; i++) cues.update(false, 0)
    expect(tick).not.toHaveBeenCalled()
    expect(go).not.toHaveBeenCalled()
  })
})
