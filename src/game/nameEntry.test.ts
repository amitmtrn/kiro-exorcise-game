import { describe, it, expect } from 'vitest'
import {
  newNameEntry, pickStep, confirm, typeChar, backspace, accept, tickNameEntry, finalName, nameKey,
  IDLE_ACCEPT_MS, ACTIVE_ACCEPT_MS, CURSOR_ADVANCE_MS,
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
  it('◀ / ▶ change the letter under the cursor in place and keep the rest of the default', () => {
    let e = pickStep(newNameEntry('BOO-3A', 0), 1, 1)
    expect(e.text).toBe('COO-3A')
    expect(e.touched).toBe(true)
    e = pickStep(e, -1, 2); e = pickStep(e, -1, 3)
    expect(e.text).toBe('AOO-3A')
    e = pickStep(e, -1, 4); expect(e.text).toBe('ZOO-3A') // wraps
    e = pickStep(e, 1, 5); expect(e.text).toBe('AOO-3A')
  })
  it('a non-letter under the cursor becomes A first', () => {
    const e = { ...newNameEntry('7-X', 0), cursor: 1 }
    expect(pickStep(e, 1, 0).text).toBe('7AX')
  })
  it('OK finishes naming at once: untouched, after steps, and after the cursor moved on', () => {
    expect(confirm(newNameEntry('BOO-3A', 0), 5).done).toBe(true)
    let e = pickStep(pickStep(newNameEntry('BOO-3A', 0), 1, 1), 1, 2)
    e = confirm(e, 3)
    expect(e.done).toBe(true)
    expect(finalName(e)).toBe('DOO-3A')
    let m = pickStep(newNameEntry('BOO-3A', 0), 1, 0)
    m = tickNameEntry(m, CURSOR_ADVANCE_MS)
    expect(m.cursor).toBe(1)
    expect(confirm(m, CURSOR_ADVANCE_MS + 1).done).toBe(true)
    expect(pickStep(confirm(m, 9), 1, 10).text).toBe(m.text) // done: nothing changes
  })
  it('the cursor advances CURSOR_ADVANCE_MS after the last step, only up to PICK_LEN letters', () => {
    let e = pickStep(newNameEntry('BOO-3A', 0), 1, 1000)
    expect(tickNameEntry(e, 1000 + CURSOR_ADVANCE_MS - 1).cursor).toBe(0)
    e = tickNameEntry(e, 1000 + CURSOR_ADVANCE_MS)
    expect(e.cursor).toBe(1)
    e = pickStep(e, 1, 4000); e = tickNameEntry(e, 4000 + CURSOR_ADVANCE_MS)
    expect(e.cursor).toBe(2)
    e = pickStep(e, 1, 8000); e = tickNameEntry(e, 8000 + CURSOR_ADVANCE_MS)
    expect(e.cursor).toBe(2) // PICK_LEN − 1
    expect(e.text).toBe('CPP-3A')
  })
  it('a step before the delay restarts it', () => {
    let e = pickStep(newNameEntry('BOO-3A', 0), 1, 0)
    e = pickStep(e, 1, 1000)
    expect(tickNameEntry(e, 1000 + CURSOR_ADVANCE_MS - 1).cursor).toBe(0)
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
  it('first ◀ / ▶ after Backspace to empty gives A, like a fresh start', () => {
    let e = typeChar(newNameEntry('BOO-3A', 0), 'b', 1)
    e = backspace(e, 2)
    expect(e.text).toBe('')
    expect(pickStep(e, 1, 3).text).toBe('A')
    expect(pickStep(e, -1, 3).text).toBe('A')
  })
  it('OK on an emptied name keeps the generated default', () => {
    let e = backspace(typeChar(newNameEntry('BOO-3A', 0), 'b', 1), 2)
    e = confirm(e, 3)
    expect(e.done).toBe(true)
    expect(finalName(e)).toBe('BOO-3A')
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
