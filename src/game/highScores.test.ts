import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  sanitizeName, generateName, qualifies, insertScore, renameEntry, parseTable, serializeTable, loadTable, saveTable,
  recordScore, renameStored, tableBest, today, isValidEntry, STORAGE_KEY, LEGACY_KEY, TABLE_SIZE, MIGRATED_NAME, NAME_WORDS,
} from './highScores'
import type { ScoreEntry } from './highScores'
import { setHighScorePersistence, loadHighScore } from './state'
import { mulberry32 } from '../test/prng'

const e = (id: string, score: number, o: Partial<ScoreEntry> = {}): ScoreEntry =>
  ({ id, name: 'BOO-01', score, stage: 3, date: '2025-10-31', mode: '1P', ...o })

function fakeStorage(init: Record<string, string> = {}) {
  const data: Record<string, string> = { ...init }
  return {
    data,
    getItem: vi.fn((k: string) => (k in data ? data[k] : null)),
    setItem: vi.fn((k: string, v: string) => { data[k] = v }),
  }
}
let st: ReturnType<typeof fakeStorage>
beforeEach(() => { st = fakeStorage(); vi.stubGlobal('localStorage', st); setHighScorePersistence(true) })
afterEach(() => { vi.unstubAllGlobals(); setHighScorePersistence(true) })

describe('names', () => {
  it('sanitizes to A–Z 0–9 - and 8 characters', () => {
    expect(sanitizeName('ghost hunter!')).toBe('GHOSTHUN')
    expect(sanitizeName('a-b_c')).toBe('A-BC')
    expect(sanitizeName('🎃')).toBe('')
  })
  it('generates WORD-XX names of at most 8 characters', () => {
    const rand = mulberry32(7)
    for (let i = 0; i < 200; i++) {
      const n = generateName(rand)
      expect(n).toMatch(/^[A-Z]+-[0-9A-F]{2}$/)
      expect(n.length).toBeLessThanOrEqual(8)
      expect(NAME_WORDS.some((w) => n.startsWith(w + '-'))).toBe(true)
    }
    expect(generateName(() => 0)).toBe('GHOST-00')
    expect(generateName(() => 0.9999)).toBe('WITCH-FF')
  })
  it('today() formats the local date', () => {
    expect(today(new Date(2025, 9, 31))).toBe('2025-10-31')
  })
})

describe('table logic', () => {
  it('sorts by score descending; equal scores keep the older entry first', () => {
    let t: ScoreEntry[] = []
    t = insertScore(t, e('a', 100)).table
    t = insertScore(t, e('b', 300)).table
    const r = insertScore(t, e('c', 100))
    expect(r.table.map((x) => x.id)).toEqual(['b', 'a', 'c'])
    expect(r.rank).toBe(3)
  })
  it('keeps 10 entries and a score must beat the last to enter a full table', () => {
    let t: ScoreEntry[] = []
    for (let i = 1; i <= TABLE_SIZE; i++) t = insertScore(t, e('x' + i, i * 10)).table
    expect(t).toHaveLength(10)
    expect(qualifies(t, 10)).toBe(false)
    expect(insertScore(t, e('y', 10)).rank).toBe(0)
    const r = insertScore(t, e('z', 11))
    expect(r.table).toHaveLength(10)
    expect(r.table[9].score).toBe(11)
    expect(qualifies([], 0)).toBe(false)
    expect(qualifies([], 1)).toBe(true)
  })
  it('renames an entry, ignores invalid names', () => {
    const t = [e('a', 5)]
    expect(renameEntry(t, 'a', 'zed')[0].name).toBe('ZED')
    expect(renameEntry(t, 'a', '!!!')[0].name).toBe('BOO-01')
  })
  it('parse drops invalid entries, duplicates and extra fields; never throws', () => {
    const json = JSON.stringify([
      e('a', 5), { ...e('b', 9), photo: 'data:image/png;base64,AAAA' }, e('a', 50),
      { ...e('c', 1), stage: 7 }, { ...e('d', 1), name: 'lower' }, { ...e('f', 1.5) }, null, 'x',
    ])
    const t = parseTable(json)
    expect(t.map((x) => x.id)).toEqual(['b', 'a'])
    expect(Object.keys(t[0]).sort()).toEqual(['date', 'id', 'mode', 'name', 'score', 'stage'])
    for (const bad of ['{', '{}', '42', 'null', '"x"', '[[]]']) expect(parseTable(bad)).toEqual([])
    expect(parseTable(null)).toEqual([])
  })
  it('round-trips through JSON', () => {
    const t = [e('a', 9), e('b', 5, { mode: '2P', stage: 6 })]
    expect(parseTable(serializeTable(t))).toEqual(t)
  })
  it('isValidEntry rejects a missing mode and a bad date', () => {
    expect(isValidEntry({ ...e('a', 1), mode: '3P' })).toBe(false)
    expect(isValidEntry({ ...e('a', 1), date: '31/10/2025' })).toBe(false)
    expect(tableBest([])).toBe(0)
  })
})

describe('storage', () => {
  it('migrates the legacy single high score once', () => {
    st = fakeStorage({ [LEGACY_KEY]: '4200' }); vi.stubGlobal('localStorage', st)
    const t = loadTable(new Date(2025, 9, 31))
    expect(t).toEqual([{ id: 'legacy', name: MIGRATED_NAME, score: 4200, stage: 1, date: '2025-10-31', mode: '1P' }])
    expect(JSON.parse(st.data[STORAGE_KEY])).toEqual(t)
    expect(st.data[LEGACY_KEY]).toBe('4200') // kept for older builds
    st.data[LEGACY_KEY] = '9999'
    expect(loadTable()).toEqual(t) // the table exists: no second migration
  })
  it('no legacy score: empty table, nothing written', () => {
    expect(loadTable()).toEqual([])
    expect(st.setItem).not.toHaveBeenCalled()
    st.data[LEGACY_KEY] = 'junk'
    expect(loadTable()).toEqual([])
  })
  it('records a run with a generated name and renames it', () => {
    const r = recordScore({ score: 1234, stage: 6, mode: '2P' }, mulberry32(1))!
    expect(r.rank).toBe(1)
    expect(r.entry.name).toMatch(/^[A-Z]+-[0-9A-F]{2}$/)
    expect(loadTable()[0]).toMatchObject({ score: 1234, stage: 6, mode: '2P' })
    renameStored(r.entry.id, 'ann')
    expect(loadTable()[0].name).toBe('ANN')
    expect(recordScore({ score: 0, stage: 1, mode: '1P' })).toBeNull()
  })
  it('the best shown is the larger of the legacy key and the table', () => {
    st = fakeStorage({ [LEGACY_KEY]: '300', [STORAGE_KEY]: JSON.stringify([e('a', 900)]) }); vi.stubGlobal('localStorage', st)
    expect(loadHighScore()).toBe(900)
  })
  it('storage errors are swallowed', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') } })
    expect(loadTable()).toEqual([])
    expect(() => saveTable([e('a', 1)])).not.toThrow()
    expect(recordScore({ score: 10, stage: 1, mode: '1P' })).not.toBeNull()
  })
  it('demo mode (persistence off): nothing read, nothing written (R8.5)', () => {
    st = fakeStorage({ [LEGACY_KEY]: '4200', [STORAGE_KEY]: JSON.stringify([e('a', 900)]) }); vi.stubGlobal('localStorage', st)
    setHighScorePersistence(false)
    expect(loadTable()).toEqual([])
    expect(recordScore({ score: 99999, stage: 6, mode: '1P' })).toBeNull()
    renameStored('a', 'X')
    saveTable([e('b', 5)])
    expect(loadHighScore()).toBe(0)
    expect(st.getItem).not.toHaveBeenCalled()
    expect(st.setItem).not.toHaveBeenCalled()
  })
})
