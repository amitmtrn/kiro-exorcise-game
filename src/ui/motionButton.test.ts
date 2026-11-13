import { describe, it, expect, vi } from 'vitest'
import { MotionButton, FILL_DURATION_MS, MIN_MOTION_PIXELS, IDLE_GRACE_MS } from './motionButton'
import { updateMotionPixels } from '../game/collision'

vi.mock('../webcam/diff', () => ({
  computeFrameDiff: vi.fn(),
  scaleHitbox: vi.fn((hb: unknown) => hb),
  DIFF_THRESHOLD: 30, HIT_RATIO: 0.15, SAMPLE_STRIDE: 4, MOTION_W: 320, MOTION_H: 180,
}))

/** Publish `n` motion pixels inside the button (display coords; mask is 1:1 here). */
function motion(n: number, cx: number, cy: number) {
  const points = Array.from({ length: n }, (_, i) => ({ x: cx + i, y: cy }))
  updateMotionPixels({ points, sampled: 100, moved: n, changed: true }, 320, 180)
}

describe('MotionButton (stages T3) — fed by the whole-frame motion mask', () => {
  it('fills while motion is held inside and triggers after FILL_DURATION_MS', () => {
    const btn = new MotionButton(160, 90, 40, 'START')
    motion(10, 160, 90)
    expect(btn.update(0)).toBe('filling')
    expect(btn.update(FILL_DURATION_MS / 2)).toBe('filling')
    expect(btn.fillProgress(FILL_DURATION_MS / 2)).toBeCloseTo(0.5)
    expect(btn.update(FILL_DURATION_MS)).toBe('triggered')
  })

  it('keeps filling across duplicate camera frames (pixels persist)', () => {
    const btn = new MotionButton(160, 90, 40, 'START')
    motion(10, 160, 90)
    expect(btn.update(0)).toBe('filling')
    updateMotionPixels({ points: [], sampled: 100, moved: 0, changed: false }, 320, 180)
    expect(btn.update(400)).toBe('filling')
  })

  it('resets when motion stops for longer than IDLE_GRACE_MS', () => {
    const btn = new MotionButton(160, 90, 40, 'START')
    motion(10, 160, 90)
    btn.update(0)
    updateMotionPixels({ points: [], sampled: 100, moved: 0, changed: true }, 320, 180)
    expect(btn.update(IDLE_GRACE_MS + 1)).toBe('idle')
    motion(10, 160, 90)
    expect(btn.update(600)).toBe('filling')
    expect(btn.update(600 + FILL_DURATION_MS - 1)).toBe('filling')
  })

  it('keeps filling through a brief still moment (hand reversing direction)', () => {
    const btn = new MotionButton(160, 90, 40, 'START')
    motion(10, 160, 90)
    expect(btn.update(0)).toBe('filling')
    updateMotionPixels({ points: [], sampled: 100, moved: 0, changed: true }, 320, 180)
    expect(btn.update(IDLE_GRACE_MS - 50)).toBe('filling')
    motion(10, 160, 90)
    expect(btn.update(IDLE_GRACE_MS)).toBe('filling')
    expect(btn.update(FILL_DURATION_MS)).toBe('triggered')
  })

  it('does not start filling from a gap alone when it was idle', () => {
    const btn = new MotionButton(160, 90, 40, 'START')
    updateMotionPixels({ points: [], sampled: 100, moved: 0, changed: true }, 320, 180)
    expect(btn.update(0)).toBe('idle')
    expect(btn.update(50)).toBe('idle')
  })

  it('ignores motion outside the circle and fewer than MIN_MOTION_PIXELS inside', () => {
    const btn = new MotionButton(160, 90, 40, 'START')
    motion(10, 10, 10)
    expect(btn.update(0)).toBe('idle')
    motion(MIN_MOTION_PIXELS - 1, 160, 90)
    expect(btn.update(10)).toBe('idle')
    motion(MIN_MOTION_PIXELS, 160, 90)
    expect(btn.update(20)).toBe('filling')
  })
})

describe('MotionButton one-wave-one-trigger (exorcist-card review fix)', () => {
  const none = () => updateMotionPixels({ points: [], sampled: 100, moved: 0, changed: true }, 320, 180)

  it('does not re-trigger while the hand keeps waving on the button', () => {
    const btn = new MotionButton(160, 90, 40, 'SAVE')
    motion(10, 160, 90)
    btn.update(0)
    expect(btn.update(FILL_DURATION_MS)).toBe('triggered')
    for (let t = FILL_DURATION_MS + 16; t < FILL_DURATION_MS * 4; t += 16) expect(btn.update(t)).toBe('idle')
  })

  it('re-arms once the motion has left the circle', () => {
    const btn = new MotionButton(160, 90, 40, 'SAVE')
    motion(10, 160, 90)
    btn.update(0); btn.update(FILL_DURATION_MS)
    none()
    expect(btn.update(FILL_DURATION_MS + IDLE_GRACE_MS + 1)).toBe('idle')
    motion(10, 160, 90)
    expect(btn.update(FILL_DURATION_MS + 400)).toBe('filling')
  })

  it('updateGated ignores motion while not live and needs it to leave before filling', () => {
    const btn = new MotionButton(160, 90, 40, 'X')
    motion(10, 160, 90)
    expect(btn.updateGated(0, false)).toBe('idle')
    expect(btn.updateGated(1000, true)).toBe('idle') // hand still there: held
    none()
    expect(btn.updateGated(1000 + IDLE_GRACE_MS + 1, true)).toBe('idle')
    motion(10, 160, 90)
    expect(btn.updateGated(2000, true)).toBe('filling')
  })

  it('reset drops a partial fill', () => {
    const btn = new MotionButton(160, 90, 40, 'X')
    motion(10, 160, 90)
    btn.update(0); btn.update(500)
    btn.reset()
    expect(btn.fillProgress(500)).toBe(0)
  })
})
