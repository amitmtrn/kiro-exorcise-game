import { describe, it, expect } from 'vitest'
import { parseDemoParams, demoKeyAction, isDemoToggleKey, routeDemoKey, DEMO } from './params'
import { mulberry32 } from './rng'

describe('parseDemoParams (demo-mode R1.1)', () => {
  it('is off without parameters or with demo=0', () => {
    expect(parseDemoParams('').demo).toBe(false)
    expect(parseDemoParams('?demo=0').demo).toBe(false)
    expect(parseDemoParams('?demo=true').demo).toBe(false)
  })
  it('turns on with demo=1 and uses the defaults', () => {
    expect(parseDemoParams('?demo=1')).toEqual({ demo: true, seed: DEMO.defaultSeed, stage: 1, speed: DEMO.timeScale })
  })
  it('reads seed, stage and speed', () => {
    expect(parseDemoParams('?demo=1&seed=42&stage=4&speed=3')).toEqual({ demo: true, seed: 42, stage: 4, speed: 3 })
  })
  it('falls back for invalid values and never throws', () => {
    const p = parseDemoParams('?demo=1&seed=-3&stage=9&speed=abc')
    expect(p).toEqual({ demo: true, seed: DEMO.defaultSeed, stage: 1, speed: DEMO.timeScale })
    expect(parseDemoParams('?demo=1&seed=1.5&stage=0').seed).toBe(DEMO.defaultSeed)
    expect(parseDemoParams('?demo=1&stage=0').stage).toBe(1)
    expect(parseDemoParams('?demo=1&seed=').seed).toBe(DEMO.defaultSeed)
    expect(parseDemoParams('?demo=1&seed=7').seed).toBe(7)
    expect(parseDemoParams('?demo=1&speed=').speed).toBe(DEMO.timeScale)
  })
  it('clamps speed to 1..4', () => {
    expect(parseDemoParams('?demo=1&speed=0.2').speed).toBe(1)
    expect(parseDemoParams('?demo=1&speed=99').speed).toBe(4)
  })
})

describe('demoKeyAction (demo-mode R1.2–R1.4)', () => {
  it('G toggles, with or without shift', () => {
    expect(demoKeyAction({ key: 'g' })).toBe('toggle')
    expect(demoKeyAction({ key: 'G' })).toBe('toggle')
  })
  it('G with Ctrl / Meta / Alt is just another key', () => {
    expect(demoKeyAction({ key: 'g', ctrlKey: true })).toBe('exit')
  })
  it('bare modifiers and M are passive', () => {
    for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'm', 'M']) expect(demoKeyAction({ key })).toBe('ignore')
  })
  it('every other key leaves demo mode', () => {
    for (const key of [' ', 'Enter', 'Escape', 'd', 'c', '1', '2', 'x', 'ArrowUp']) expect(demoKeyAction({ key })).toBe('exit')
  })
  it('does not reuse a key the game already binds', () => {
    for (const bound of ['d', 'D', 'm', 'M', '1', '2', ' ', 'c', 's', 'n', 'Enter', 'Escape']) {
      expect(isDemoToggleKey({ key: bound }, true)).toBe(false)
    }
  })
})

describe('isDemoToggleKey (R1.2)', () => {
  it('works only on the title screen and without Ctrl / Meta / Alt', () => {
    expect(isDemoToggleKey({ key: 'g' }, true)).toBe(true)
    expect(isDemoToggleKey({ key: 'G' }, true)).toBe(true)
    expect(isDemoToggleKey({ key: 'g' }, false)).toBe(false)
    expect(isDemoToggleKey({ key: 'g', ctrlKey: true }, true)).toBe(false)
    expect(isDemoToggleKey({ key: 'g', metaKey: true }, true)).toBe(false)
    expect(isDemoToggleKey({ key: 'g', altKey: true }, true)).toBe(false)
  })
})

describe('mulberry32', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = mulberry32(5), b = mulberry32(5), c = mulberry32(6)
    const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()]
    expect(sa).toEqual(sb)
    expect(sa).not.toEqual(sc)
    for (const v of sa) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
  })
})

describe('routeDemoKey (R1.2–R1.4)', () => {
  const on = { demoOn: true, onTitle: false, msSinceLeft: Infinity }
  const off = { demoOn: false, onTitle: true, msSinceLeft: Infinity }
  it('in demo: any key leaves, passive keys pass to the normal handler', () => {
    expect(routeDemoKey({ key: ' ' }, on)).toBe('leave')
    expect(routeDemoKey({ key: 'g' }, on)).toBe('leave')
    expect(routeDemoKey({ key: '1' }, on)).toBe('leave')
    expect(routeDemoKey({ key: 'm' }, on)).toBe('pass')
    expect(routeDemoKey({ key: 'Shift' }, on)).toBe('pass')
  })
  it('normal title: G enters, other keys pass', () => {
    expect(routeDemoKey({ key: 'g' }, off)).toBe('enter')
    expect(routeDemoKey({ key: 'G' }, off)).toBe('enter')
    expect(routeDemoKey({ key: ' ' }, off)).toBe('pass')
    expect(routeDemoKey({ key: 'g', repeat: true }, off)).toBe('pass')
  })
  it('normal game away from the title: G passes', () => {
    expect(routeDemoKey({ key: 'g' }, { ...off, onTitle: false })).toBe('pass')
  })
  it('swallows auto-repeats of the key that just left demo, then stops swallowing', () => {
    expect(routeDemoKey({ key: ' ', repeat: true }, { ...off, msSinceLeft: 100 })).toBe('swallow')
    expect(routeDemoKey({ key: ' ', repeat: true }, { ...off, msSinceLeft: 900 })).toBe('pass')
    expect(routeDemoKey({ key: ' ' }, { ...off, msSinceLeft: 100 })).toBe('pass')
  })
})
