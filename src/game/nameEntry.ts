/**
 * Name entry (more-content R9). Pure state; times are the screen clock (`now`, ms), never frames.
 *
 * The default (generated) name is already in the table. ◀ / ▶ start the picker: the first press
 * replaces the default with "A" at position 1, presses cycle A–Z with wrap-around, OK moves on to
 * the next of PICK_LEN positions and accepts on the last. Keyboard typing replaces the default too.
 */

import { NAME_MAX, sanitizeName, isValidName } from './highScores'

export const PICK_LEN = 3
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** An untouched screen accepts the default after this long. */
export const IDLE_ACCEPT_MS = 10_000
/** Once used, the screen accepts what is there this long after the last input. */
export const ACTIVE_ACCEPT_MS = 30_000

export interface NameEntry {
  /** The default (generated) name: what is kept when the player does nothing. */
  defaultName: string
  text: string
  /** True once a button or key changed the name. */
  touched: boolean
  /** Picker position (the letter ◀ / ▶ change): 0…PICK_LEN-1 when picking, the last typed letter when typing. */
  cursor: number
  done: boolean
  startedAt: number
  lastInputAt: number
}

export function newNameEntry(defaultName: string, now: number): NameEntry {
  return { defaultName, text: defaultName, touched: false, cursor: 0, done: false, startedAt: now, lastInputAt: now }
}

function cycle(ch: string, dir: -1 | 1): string {
  const i = LETTERS.indexOf(ch)
  const n = LETTERS.length
  return LETTERS[(((i < 0 ? 0 : i) + dir) % n + n) % n]
}

/** ◀ (−1) / ▶ (+1). */
export function pickStep(e: NameEntry, dir: -1 | 1, now: number): NameEntry {
  if (e.done) return e
  if (!e.touched) return { ...e, text: 'A', touched: true, cursor: 0, lastInputAt: now }
  // An emptied name restarts at 'A' (like an untouched one) instead of cycling away from it.
  if (e.text.length === 0) return { ...e, text: 'A', cursor: 0, lastInputAt: now }
  const chars = [...e.text]
  while (chars.length <= e.cursor) chars.push('A')
  chars[e.cursor] = cycle(chars[e.cursor], dir)
  return { ...e, text: chars.join('').slice(0, NAME_MAX), lastInputAt: now }
}

/** OK: accept the letter and move on; on the last position (or an untouched default) accept the name. */
export function confirm(e: NameEntry, now: number): NameEntry {
  if (e.done) return e
  if (!e.touched || e.cursor >= PICK_LEN - 1) return { ...e, done: true, lastInputAt: now }
  const cur = e.text.length === 0 ? e.text + 'A' : e.text // OK on an emptied name accepts 'A' first
  const cursor = Math.min(PICK_LEN - 1, (e.text.length === 0 ? 0 : e.cursor) + 1)
  const text = cur.length <= cursor ? (cur + 'A').slice(0, NAME_MAX) : cur
  return { ...e, cursor, text, lastInputAt: now }
}

/** Keyboard: A–Z 0–9 '-' (lower case upper-cased). The first key replaces the default. Others are ignored. */
export function typeChar(e: NameEntry, key: string, now: number): NameEntry {
  if (e.done || key.length !== 1) return e
  const ch = sanitizeName(key)
  if (ch.length !== 1) return e
  const base = e.touched ? e.text : ''
  if (base.length >= NAME_MAX) return { ...e, lastInputAt: now }
  const text = base + ch
  return { ...e, text, touched: true, cursor: text.length - 1, lastInputAt: now }
}

export function backspace(e: NameEntry, now: number): NameEntry {
  if (e.done) return e
  const base = e.touched ? e.text : ''
  const text = base.slice(0, -1)
  return { ...e, text, touched: true, cursor: Math.max(0, text.length - 1), lastInputAt: now }
}

/** Enter: accept. */
export function accept(e: NameEntry, now: number): NameEntry {
  return e.done ? e : { ...e, done: true, lastInputAt: now }
}

/** Applies the timeouts (R9.4). */
export function tickNameEntry(e: NameEntry, now: number): NameEntry {
  if (e.done) return e
  const limit = e.touched ? e.lastInputAt + ACTIVE_ACCEPT_MS : e.startedAt + IDLE_ACCEPT_MS
  return now >= limit ? { ...e, done: true } : e
}

/** The name to store: the typed / picked one, or the default when it is empty or invalid. */
export function finalName(e: NameEntry): string {
  const n = sanitizeName(e.text)
  return isValidName(n) ? n : e.defaultName
}

/** Routes a keyboard key: handled → the new entry, else null. */
export function nameKey(e: NameEntry, key: string, now: number): NameEntry | null {
  if (e.done) return null
  if (key === 'Enter') return accept(e, now)
  if (key === 'Backspace') return backspace(e, now)
  if (key.length === 1 && sanitizeName(key).length === 1) return typeChar(e, key, now)
  return null
}
