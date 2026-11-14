/** A motion button that fires plays the soft confirm sound exactly once (playtest2-fixes R4.2). */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../webcam/diff', () => ({
  computeFrameDiff: vi.fn(), scaleHitbox: vi.fn((hb: unknown) => hb),
  DIFF_THRESHOLD: 30, HIT_RATIO: 0.15, SAMPLE_STRIDE: 4, MOTION_W: 320, MOTION_H: 180,
}))
vi.mock('../audio/sfx', () => ({ sfxConfirm: vi.fn() }))

import { MotionButton, updateExclusive, DWELL_MS } from './motionButton'
import { updateMotionPixels } from '../game/collision'
import { sfxConfirm } from '../audio/sfx'

/** Grid points (4 px cells) covering most of a circle. */
function disc(cx: number, cy: number, r: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  const rr = r * Math.sqrt(0.8)
  for (let y = cy - rr; y <= cy + rr; y += 4) for (let x = cx - rr; x <= cx + rr; x += 4) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= rr * rr) out.push({ x, y })
  }
  return out
}

const confirm = sfxConfirm as ReturnType<typeof vi.fn>
const frame = (pts: Array<{ x: number; y: number }>) => updateMotionPixels({ points: pts, sampled: 100, moved: pts.length, changed: true }, 320, 180)

beforeEach(() => confirm.mockClear())

describe('confirm sound on a motion-button fire', () => {
  it('one wave = one fire = one confirm, however long the hand stays', () => {
    const a = new MotionButton(80, 90, 30, 'A'), b = new MotionButton(240, 90, 30, 'B')
    let fires = 0
    for (let t = 0; t < DWELL_MS * 4; t += 33) {
      frame(disc(80, 90, 30))
      if (updateExclusive([a, b], t, true) >= 0) fires++
    }
    expect(fires).toBe(1)
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('a second wave after the hand left plays it again; a locked screen never does', () => {
    const a = new MotionButton(80, 90, 30, 'A')
    let t = 0
    const wave = (live: boolean) => { for (let k = 0; k < 40; k++, t += 33) { frame(disc(80, 90, 30)); updateExclusive([a], t, live) } for (let k = 0; k < 10; k++, t += 33) { frame([]); updateExclusive([a], t, live) } }
    wave(true); wave(true)
    expect(confirm).toHaveBeenCalledTimes(2)
    wave(false)
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('a motion button that only fills (never fires) is silent', () => {
    const a = new MotionButton(80, 90, 30, 'A')
    for (let t = 0; t < DWELL_MS - 150; t += 33) { frame(disc(80, 90, 30)); updateExclusive([a], t, true) }
    expect(confirm).not.toHaveBeenCalled()
  })
})
