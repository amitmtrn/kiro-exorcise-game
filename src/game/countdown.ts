/**
 * Countdown cues (playtest2-fixes R5.1): every stage title card (stage 1 to 6, the bonus round, 1P and 2P) plays
 * one tick per number 3, 2, 1 and an accent when play begins. The cue keeps the last number it played, so any
 * tick length (deltaMs) plays each number exactly once.
 */

import { sfxCountTick, sfxCountGo } from '../audio/sfx'

export interface CountdownCues {
  /** Call every tick: whether a title card is showing and its time left. */
  update(inTitle: boolean, stageTitleMs: number): void
}

export function createCountdownCues(): CountdownCues {
  let last: number | null = null
  return {
    update(inTitle, stageTitleMs) {
      if (inTitle) {
        const n = Math.ceil(stageTitleMs / 1000)
        if (n >= 1 && n <= 3 && n !== last) {
          last = n
          try { sfxCountTick() } catch { /* audio not ready */ }
        }
        return
      }
      if (last !== null) {
        last = null
        try { sfxCountGo() } catch { /* audio not ready */ }
      }
    },
  }
}
