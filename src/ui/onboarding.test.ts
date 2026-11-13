import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  guideGeometry, classifyCameraError, DENIED_TITLE, DENIED_LEAD, DENIED_INSTRUCTIONS,
} from './onboarding'
import { PRIVACY_LINE } from '../game/onboarding'

describe('guideGeometry', () => {
  it('keeps head, shoulders and hands inside common canvases', () => {
    for (const [w, h] of [[1280, 720], [1920, 1080], [800, 600], [390, 844]]) {
      const g = guideGeometry(w, h)
      expect(g.head.cx - g.head.rx).toBeGreaterThan(0)
      expect(g.head.cx + g.head.rx).toBeLessThan(w)
      expect(g.head.cy - g.head.ry).toBeGreaterThan(0)
      expect(g.shoulders.cx - g.shoulders.r).toBeGreaterThanOrEqual(0)
      expect(g.shoulders.cx + g.shoulders.r).toBeLessThanOrEqual(w)
      expect(g.hands).toHaveLength(2)
      for (const hd of g.hands) {
        expect(hd.cx - hd.r).toBeGreaterThan(0)
        expect(hd.cx + hd.r).toBeLessThan(w)
        expect(hd.cy - hd.r).toBeGreaterThan(0)
        expect(hd.cy + hd.r).toBeLessThan(h)
      }
    }
  })

  it('is mirror-symmetric and has the head above the shoulders', () => {
    const g = guideGeometry(1280, 720)
    expect(g.head.cx).toBe(640)
    expect(g.hands[0].cx + g.hands[1].cx).toBeCloseTo(1280)
    expect(g.head.cy + g.head.ry).toBeLessThan(g.shoulders.cy)
  })

  it('stays in bounds for any reasonable canvas size (property)', () => {
    fc.assert(fc.property(fc.integer({ min: 200, max: 4000 }), fc.integer({ min: 200, max: 4000 }), (w, h) => {
      const g = guideGeometry(w, h)
      for (const hd of g.hands) {
        expect(hd.cx - hd.r).toBeGreaterThanOrEqual(0)
        expect(hd.cx + hd.r).toBeLessThanOrEqual(w)
        expect(hd.cy + hd.r).toBeLessThanOrEqual(h)
      }
      expect(g.head.cx - g.head.rx).toBeGreaterThanOrEqual(0)
      expect(g.head.cx + g.head.rx).toBeLessThanOrEqual(w)
      expect(g.shoulders.cx - g.shoulders.r).toBeGreaterThanOrEqual(0)
    }))
  })
})

describe('classifyCameraError', () => {
  it('maps permission errors to blocked', () => {
    expect(classifyCameraError({ name: 'NotAllowedError' })).toBe('blocked')
    expect(classifyCameraError({ name: 'SecurityError' })).toBe('blocked')
    expect(classifyCameraError(new DOMException('x', 'NotAllowedError'))).toBe('blocked')
  })
  it('maps everything else to unavailable', () => {
    expect(classifyCameraError({ name: 'NotFoundError' })).toBe('unavailable')
    expect(classifyCameraError({ name: 'NotReadableError' })).toBe('unavailable')
    expect(classifyCameraError(new Error('boom'))).toBe('unavailable')
    expect(classifyCameraError(null)).toBe('unavailable')
    expect(classifyCameraError('x')).toBe('unavailable')
  })
})

describe('camera-denied copy', () => {
  const all = [DENIED_TITLE, ...Object.values(DENIED_LEAD), ...DENIED_INSTRUCTIONS, PRIVACY_LINE].join('\n')
  it('is link-free', () => {
    expect(all).not.toMatch(/https?:|chrome:|about:|www\.|<a\b|href/i)
  })
  it('tells the player how to fix it and ends with Try again', () => {
    expect(DENIED_INSTRUCTIONS.length).toBeGreaterThanOrEqual(3)
    expect(DENIED_INSTRUCTIONS.join(' ')).toMatch(/Allow/)
    expect(DENIED_INSTRUCTIONS[DENIED_INSTRUCTIONS.length - 1]).toMatch(/Try again/)
  })
})
