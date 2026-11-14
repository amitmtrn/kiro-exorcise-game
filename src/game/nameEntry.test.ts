import { describe, it, expect } from 'vitest'
import {
  newNameEntry, pickStep, confirm, typeChar, backspace, accept, tickNameEntry, finalName, nameKey,
  IDLE_ACCEPT_MS, ACTIVE_ACCEPT_MS,
} from './nameEntry'
import { buttonLayout, areaButtons, nameStepOf, NAME_PREV, NAME_NEXT } from '../ui/layout'
import { halfWidth } from './halves'

describe('name picker', () => {
  it('keeps the default when nothing is touched', () => {
    let e = newNameEntry('BOO-3A', 0)
    e = confirm(e, 10)
    expect(e.done).toBe(true)
    expect(finalName(e)).toBe('BOO-3A')
  })
  it('first ◀ / ▶ replaces the default with A; steps cycle with wrap-around', () => {
    let e = pickStep(newNameEntry('BOO-3A', 0), 1, 1)
    expect(e.text).toBe('A')
    e = pickStep(e, -1, 2); expect(e.text).toBe('Z')
    e = pickStep(e, 1, 3); expect(e.text).toBe('A')
    e = pickStep(e, 1, 4); expect(e.text).toBe('B')
  })
  it('OK moves through three letters and accepts on the last', () => {
    let e = pickStep(newNameEntry('X-00', 0), 1, 0) // A
    e = pickStep(e, 1, 0) // B
    e = confirm(e, 0); expect([e.text, e.cursor, e.done]).toEqual(['BA', 1, false])
    e = pickStep(e, -1, 0); expect(e.text).toBe('BZ')
    e = confirm(e, 0); expect([e.text, e.cursor]).toEqual(['BZA', 2])
    e = confirm(e, 0)
    expect(e.done).toBe(true)
    expect(finalName(e)).toBe('BZA')
    expect(pickStep(e, 1, 0)).toBe(e) // done: nothing changes
  })
  it('keyboard: types, upper-cases, backspaces, Enter accepts, ignores other keys', () => {
    let e = newNameEntry('BAT-01', 0)
    e = nameKey(e, 'z', 1)!; expect(e.text).toBe('Z')
    e = nameKey(e, '9', 2)!; e = nameKey(e, '-', 3)!; expect(e.text).toBe('Z9-')
    expect(nameKey(e, ' ', 4)).toBeNull()
    expect(nameKey(e, 'Shift', 4)).toBeNull()
    e = nameKey(e, 'Backspace', 5)!; expect(e.text).toBe('Z9')
    e = nameKey(e, 'Enter', 6)!; expect(e.done).toBe(true)
    expect(nameKey(e, 'a', 7)).toBeNull()
  })
  it('typing is capped at 8 characters', () => {
    let e = newNameEntry('BAT-01', 0)
    for (const c of 'ABCDEFGHIJK') e = typeChar(e, c, 0)
    expect(e.text).toBe('ABCDEFGH')
  })
  it('an emptied name falls back to the default', () => {
    let e = backspace(newNameEntry('MOON-7F', 0), 0)
    e = accept(e, 0)
    expect(finalName(e)).toBe('MOON-7F')
  })
  it('timeouts: untouched after 10 s, used after 30 s since the last input', () => {
    const e = newNameEntry('BOO-01', 1000)
    expect(tickNameEntry(e, 1000 + IDLE_ACCEPT_MS - 1).done).toBe(false)
    expect(tickNameEntry(e, 1000 + IDLE_ACCEPT_MS).done).toBe(true)
    const used = pickStep(e, 1, 5000)
    expect(tickNameEntry(used, 1000 + IDLE_ACCEPT_MS + 1).done).toBe(false)
    expect(tickNameEntry(used, 5000 + ACTIVE_ACCEPT_MS).done).toBe(true)
  })
})

describe('name-screen layout', () => {
  it('1P: ◀ and OK stacked on the left, ▶ alone on the right', () => {
    const [a, ok, s] = buttonLayout('name', 1280, 720)
    expect([a.label, ok.label, s.label]).toEqual([NAME_PREV, 'OK', NAME_NEXT])
    expect(a.cx).toBe(ok.cx)
    expect(a.cx).toBeLessThan(640)
    expect(s.cx).toBeGreaterThan(640)
    expect(ok.cy).toBeGreaterThan(a.cy)
    expect([a, ok, s].map(nameStepOf)).toEqual([-1, 0, 1])
  })
  it('2P: each half has its own three buttons and its left arrow is on the left', () => {
    const bs = buttonLayout('name2p', 1280, 720)
    expect(bs).toHaveLength(6)
    for (const seat of [0, 1] as const) {
      const mine = bs.filter((b) => b.seat === seat)
      expect(mine.map((b) => b.id)).toEqual(['stepA', 'ok', 'stepS'])
      const prev = mine.find((b) => b.label === NAME_PREV)!
      const next = mine.find((b) => b.label === NAME_NEXT)!
      expect(prev.cx).toBeLessThan(next.cx)
    }
    const hw = halfWidth(1280)
    expect(areaButtons('name2p', hw, 720, 1)[0].label).toBe(NAME_NEXT) // stacked column is on the right in P2's half
  })
  it('no name button is destructive (none abandons anything)', () => {
    for (const s of ['name', 'name2p'] as const) for (const b of buttonLayout(s, 1280, 720)) expect(b.destructive).toBe(false)
  })
})

describe('emptied name', () => {
  it('first ◀ / ▶ after Backspace to empty gives A, like an untouched name', () => {
    let e = typeChar(newNameEntry('BOO-3A', 0), 'b', 1)
    e = backspace(e, 2)
    expect(e.text).toBe('')
    expect(pickStep(e, 1, 3).text).toBe('A')
    expect(pickStep(e, -1, 3).text).toBe('A')
  })
  it('OK on an emptied name accepts A and keeps cursor and text consistent', () => {
    let e = backspace(typeChar(newNameEntry('BOO-3A', 0), 'b', 1), 2)
    e = confirm(e, 3)
    expect(e.cursor).toBe(1)
    expect(e.text.length).toBeGreaterThanOrEqual(e.cursor + 1)
  })
})

describe('cursor after long typed names', () => {
  it('follows the last typed letter and ◀ / ▶ change it', () => {
    let e = newNameEntry('AAA', 0)
    for (const c of 'ABCDEF') e = typeChar(e, c, 0)
    expect(e.cursor).toBe(5)
    e = pickStep(e, 1, 0)
    expect(e.text).toBe('ABCDEG')
    e = backspace(e, 0)
    expect(e.cursor).toBe(4)
  })
})
