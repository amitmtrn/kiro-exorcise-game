import { describe, it, expect } from 'vitest'
import { makeEnemy } from '../state'
import type { Enemy } from '../state'
import { moveEnemies, hitboxFor } from './movement'
import { isHittable } from './vulnerability'
import {
  stepVariant, isVariantHittable, onMirrorAbsorb, lightWisp, isLinked, telegraphLeftMs, stateSchedule, nextState,
  speedFor, travelMs, initialState, TELEGRAPH_MS, MIN_TELEGRAPH_MS, SHIELD_MAX_MS, SOLID_MS, ETHEREAL_MS, OPEN_MS,
  ABSORB_COOLDOWN_MS, TWIN_WINDOW_MS, MIN_TRAVEL_MS, TRAVEL_S,
} from './variants'
import type { VariantType } from './variants'

function mk(type: VariantType, over: Partial<Enemy> = {}): Enemy {
  return makeEnemy({
    id: type, type, x: 0, y: 0, targetX: 320, targetY: 180, speed: 0.1,
    hitbox: hitboxFor(type, 0, 0), vState: initialState(type), ...over,
  })
}
const run = (e: Enemy, ms: number, step = 16): Enemy => {
  let left = ms
  while (left > 0) { const d = Math.min(step, left); e = stepVariant(e, d); left -= d }
  return e
}

describe('blink ghost', () => {
  it('starts solid and cycles on the 4 s rhythm', () => {
    let e = mk('blink')
    expect(e.vState).toBe('solid')
    e = run(e, SOLID_MS + 1); expect(e.vState).toBe('warnOut')
    e = run(e, TELEGRAPH_MS); expect(e.vState).toBe('ethereal')
    e = run(e, ETHEREAL_MS); expect(e.vState).toBe('warnIn')
    e = run(e, TELEGRAPH_MS); expect(e.vState).toBe('solid')
  })
  it('is vulnerable only in solid and warnOut', () => {
    const states = ['solid', 'warnOut', 'ethereal', 'warnIn'] as const
    expect(states.map((s) => isVariantHittable(mk('blink', { vState: s })))).toEqual([true, true, false, false])
    expect(isHittable(mk('blink', { vState: 'ethereal' }))).toBe(false)
  })
  it('a long tick crosses several states and keeps the remainder', () => {
    const e = stepVariant(mk('blink'), SOLID_MS + TELEGRAPH_MS + 100)
    expect(e.vState).toBe('ethereal')
    expect(e.vTimerMs).toBe(100)
  })
})

describe('mirror ghost', () => {
  it('starts shielded and cracks by itself after SHIELD_MAX_MS', () => {
    let e = mk('mirror')
    expect(isHittable(e)).toBe(false)
    e = run(e, SHIELD_MAX_MS - 20); expect(e.vState).toBe('shield')
    e = run(e, 40); expect(e.vState).toBe('cracking')
    e = run(e, TELEGRAPH_MS); expect(e.vState).toBe('open')
    expect(isHittable(e)).toBe(true)
    e = run(e, OPEN_MS); expect(e.vState).toBe('closing')
    expect(isHittable(e)).toBe(true)
    e = run(e, TELEGRAPH_MS); expect(e.vState).toBe('shield')
  })
  it('absorbs a hit with feedback and no state change on the first one', () => {
    const r = onMirrorAbsorb(mk('mirror'))
    expect(r.absorbed).toBe(true)
    expect(r.cracked).toBe(false)
    expect(r.enemy.vHits).toBe(1)
    expect(r.enemy.absorbMs).toBe(ABSORB_COOLDOWN_MS)
  })
  it('a hit inside the cool-down does not count twice', () => {
    const a = onMirrorAbsorb(mk('mirror')).enemy
    const b = onMirrorAbsorb(a)
    expect(b.absorbed).toBe(false)
    expect(b.enemy.vHits).toBe(1)
  })
  it('the second counted hit cracks the shield', () => {
    let e = onMirrorAbsorb(mk('mirror')).enemy
    e = run(e, ABSORB_COOLDOWN_MS + 1)
    const r = onMirrorAbsorb(e)
    expect(r.cracked).toBe(true)
    expect(r.enemy.vState).toBe('cracking')
    expect(r.enemy.vTimerMs).toBe(0)
  })
  it('cracking still absorbs without counting; open does not absorb', () => {
    const c = onMirrorAbsorb(mk('mirror', { vState: 'cracking' }))
    expect(c.absorbed).toBe(true)
    expect(c.enemy.vState).toBe('cracking')
    expect(onMirrorAbsorb(mk('mirror', { vState: 'open' })).absorbed).toBe(false)
  })
  it('the shield returns with a fresh hit counter', () => {
    const e = run(mk('mirror', { vHits: 1, vState: 'closing' }), TELEGRAPH_MS)
    expect(e.vState).toBe('shield')
    expect(e.vHits).toBe(0)
  })
})

describe('twin wisps', () => {
  it('idle has no timer; the first hit lights it', () => {
    const idle = run(mk('wisp'), 5000)
    expect(idle.vState).toBe('idle')
    expect(idle.vTimerMs).toBe(0)
    expect(lightWisp(idle).vState).toBe('lit')
    expect(isLinked(lightWisp(idle))).toBe(true)
  })
  it('lit lasts 1500 ms, merging 500 ms, then returns to idle', () => {
    let e = lightWisp(mk('wisp'))
    e = run(e, 1400); expect(e.vState).toBe('lit')
    e = run(e, 200); expect(e.vState).toBe('merging')
    expect(isLinked(e)).toBe(true)
    expect(telegraphLeftMs(e)).toBeGreaterThan(0)
    e = run(e, TELEGRAPH_MS); expect(e.vState).toBe('idle')
    expect(isLinked(e)).toBe(false)
  })
  it('lighting a lit wisp does not restart the window', () => {
    const e = run(lightWisp(mk('wisp')), 700)
    expect(lightWisp(e).vTimerMs).toBe(e.vTimerMs)
  })
  it('the window is TWIN_WINDOW_MS in total', () => {
    expect(stateSchedule('wisp').reduce((a, s) => a + s.ms, 0)).toBe(TWIN_WINDOW_MS)
  })
})

describe('telegraphs and travel', () => {
  it('every telegraph lasts at least the minimum', () => {
    for (const t of ['wisp', 'mirror', 'blink'] as const) {
      for (const s of stateSchedule(t)) {
        if (['warnOut', 'warnIn', 'cracking', 'closing', 'merging'].includes(s.state)) expect(s.ms).toBeGreaterThanOrEqual(MIN_TELEGRAPH_MS)
      }
    }
  })
  it('non-variants are untouched', () => {
    const g = makeEnemy({ id: 'g', type: 'ghost', x: 0, y: 0, targetX: 1, targetY: 1, speed: 1, hitbox: hitboxFor('ghost', 0, 0) })
    expect(stepVariant(g, 1000)).toBe(g)
  })
  it('nextState wraps the cycle', () => {
    expect(nextState('blink', 'warnIn')).toBe('solid')
    expect(nextState('mirror', 'closing')).toBe('shield')
  })
  it('speedFor gives exactly the stated travel time', () => {
    for (const t of ['wisp', 'mirror', 'blink'] as const) {
      const e = mk(t, { x: -100, y: 180, speed: speedFor(t, Math.hypot(420, 0), 360) })
      expect(travelMs(e, 360)).toBeCloseTo(TRAVEL_S[t] * 1000, 3)
      expect(travelMs(e, 360)).toBeGreaterThanOrEqual(MIN_TRAVEL_MS)
    }
  })
  it('moveEnemies moves a blink ghost and advances its clock', () => {
    const e = mk('blink', { x: 0, y: 0, speed: 0.2 })
    const [m] = moveEnemies([e], 100, 640, 360)
    expect(m.x).toBeGreaterThan(0)
    expect(m.vTimerMs).toBe(100)
  })
})
