/**
 * Local top-10 high-score table (more-content R8). Scores only: name, score, stage reached,
 * date and 1P / 2P. Never video, images or any camera data. Pure helpers plus a thin
 * localStorage layer that swallows every storage error and honours the demo persistence switch.
 */

import { highScorePersistence } from './persistence'
import { STAGES } from './stages'

export type PlayMode = '1P' | '2P'

export interface ScoreEntry {
  /** Random token used to rename the entry after name entry; no personal data. */
  id: string
  name: string
  score: number
  stage: number
  /** YYYY-MM-DD */
  date: string
  mode: PlayMode
}

export const TABLE_SIZE = 10
export const NAME_MAX = 8
export const MAX_STAGE = STAGES.length
export const STORAGE_KEY = 'exorcise-highscores'
export const LEGACY_KEY = 'exorcise-highscore'
export const MIGRATED_NAME = 'OLD-BEST'
export const NAME_WORDS = ['GHOST', 'BOO', 'SPOOK', 'BAT', 'WISP', 'MOON', 'CRYPT', 'WITCH'] as const
const NAME_RE = /^[A-Z0-9-]{1,8}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ID_RE = /^[a-z0-9]{1,16}$/
export const ENTRY_KEYS: readonly (keyof ScoreEntry)[] = ['id', 'name', 'score', 'stage', 'date', 'mode']

export type Rand = () => number

/** Upper-cases and keeps only A–Z, 0–9 and '-', at most 8 characters ('' when nothing is left). */
export function sanitizeName(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, NAME_MAX)
}

export function isValidName(n: unknown): n is string {
  return typeof n === 'string' && NAME_RE.test(n)
}

/** A spooky default name, e.g. "GHOST-7F" (WORD-XX, at most 8 characters). */
export function generateName(rand: Rand = Math.random): string {
  const word = NAME_WORDS[Math.min(NAME_WORDS.length - 1, Math.floor(rand() * NAME_WORDS.length))]
  const hex = Math.min(255, Math.floor(rand() * 256)).toString(16).toUpperCase().padStart(2, '0')
  return `${word}-${hex}`.slice(0, NAME_MAX)
}

export function newId(rand: Rand = Math.random): string {
  return Math.floor(rand() * 2 ** 40).toString(36).padStart(8, '0').slice(0, 12)
}

/** Today's date in local time as YYYY-MM-DD. */
export function today(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function isValidEntry(e: unknown): e is ScoreEntry {
  if (typeof e !== 'object' || e === null || Array.isArray(e)) return false
  const r = e as Record<string, unknown>
  return typeof r.id === 'string' && ID_RE.test(r.id)
    && isValidName(r.name)
    && typeof r.score === 'number' && Number.isInteger(r.score) && r.score >= 1 && r.score <= 1e9
    && typeof r.stage === 'number' && Number.isInteger(r.stage) && r.stage >= 1 && r.stage <= MAX_STAGE
    && typeof r.date === 'string' && DATE_RE.test(r.date)
    && (r.mode === '1P' || r.mode === '2P')
}

/** Only the allowed fields, in a fixed order (nothing else is ever stored). */
function clean(e: ScoreEntry): ScoreEntry {
  return { id: e.id, name: e.name, score: e.score, stage: e.stage, date: e.date, mode: e.mode }
}

/** Sorted by score, descending; equal scores keep their existing order (stable: older first). */
function sortTable(t: readonly ScoreEntry[]): ScoreEntry[] {
  return t.map((e, i) => [e, i] as const).sort((a, b) => b[0].score - a[0].score || a[1] - b[1]).map(([e]) => e)
}

/** True when `score` would enter the table. */
export function qualifies(table: readonly ScoreEntry[], score: number): boolean {
  if (!Number.isInteger(score) || score < 1) return false
  return table.length < TABLE_SIZE || score > table[table.length - 1].score
}

/** Inserts an entry (after every equal score: the older entry stays first). rank 1-based, 0 if it did not make it. */
export function insertScore(table: readonly ScoreEntry[], entry: ScoreEntry): { table: ScoreEntry[]; rank: number } {
  if (!isValidEntry(entry) || !qualifies(table, entry.score)) return { table: [...table], rank: 0 }
  const next = sortTable([...table, clean(entry)]).slice(0, TABLE_SIZE)
  const rank = next.findIndex((e) => e.id === entry.id) + 1
  return { table: next, rank }
}

/** Renames the entry with `id`; an invalid name leaves it unchanged. */
export function renameEntry(table: readonly ScoreEntry[], id: string, name: string): ScoreEntry[] {
  const n = sanitizeName(name)
  if (!isValidName(n)) return [...table]
  return table.map((e) => (e.id === id ? { ...e, name: n } : e))
}

/** Parses stored JSON: invalid entries dropped, sorted, cut to 10. Never throws. */
export function parseTable(json: string | null): ScoreEntry[] {
  if (json === null) return []
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return [] }
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const ok: ScoreEntry[] = []
  for (const e of raw) {
    if (!isValidEntry(e) || seen.has(e.id)) continue
    seen.add(e.id)
    ok.push(clean(e))
  }
  return sortTable(ok).slice(0, TABLE_SIZE)
}

export function serializeTable(table: readonly ScoreEntry[]): string {
  return JSON.stringify(table.map(clean))
}

export function tableBest(table: readonly ScoreEntry[]): number {
  return table.length > 0 ? table[0].score : 0
}

// ─── Storage ─────────────────────────────────────────────────────────────────

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

/**
 * The stored table. With persistence off (demo mode) nothing is read: empty. Migration (R8.4): no table yet
 * and a positive legacy single high score → a one-entry table "OLD-BEST", saved once.
 */
export function loadTable(now: Date = new Date()): ScoreEntry[] {
  if (!highScorePersistence()) return []
  const st = storage()
  if (!st) return []
  try {
    const json = st.getItem(STORAGE_KEY)
    if (json !== null) return parseTable(json)
    const raw = st.getItem(LEGACY_KEY) ?? ''
    const legacy = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN
    if (Number.isInteger(legacy) && legacy >= 1) {
      const t = insertScore([], { id: 'legacy', name: MIGRATED_NAME, score: Math.min(legacy, 1e9), stage: 1, date: today(now), mode: '1P' }).table
      saveTable(t)
      return t
    }
  } catch { /* unreadable storage */ }
  return []
}

/**
 * Settles the migration before anything writes the legacy key: migrates a score an older build left, or stores
 * an empty table so a later legacy write by this build is never mistaken for an old best (R8.4).
 */
export function ensureTable(now: Date = new Date()): void {
  if (!highScorePersistence()) return
  const st = storage()
  if (!st) return
  try {
    if (st.getItem(STORAGE_KEY) !== null) return
    loadTable(now)
    if (st.getItem(STORAGE_KEY) === null) saveTable([])
  } catch { /* unreadable storage */ }
}

export function saveTable(table: readonly ScoreEntry[]): void {
  if (!highScorePersistence()) return
  try { storage()?.setItem(STORAGE_KEY, serializeTable(table)) } catch { /* quota / privacy mode */ }
}

/** Records a finished run. Returns the entry and its rank (0 when it did not qualify or persistence is off). */
export function recordScore(
  run: { score: number; stage: number; mode: PlayMode }, rand: Rand = Math.random, now: Date = new Date(),
): { entry: ScoreEntry; rank: number } | null {
  if (!highScorePersistence()) return null
  if (!Number.isInteger(run.score) || run.score < 1) return null
  const table = loadTable(now)
  if (!qualifies(table, run.score)) return null
  const entry: ScoreEntry = {
    id: newId(rand), name: generateName(rand), score: run.score,
    stage: Math.min(MAX_STAGE, Math.max(1, Math.trunc(run.stage))), date: today(now), mode: run.mode,
  }
  const r = insertScore(table, entry)
  if (r.rank === 0) return null
  saveTable(r.table)
  return { entry, rank: r.rank }
}

/** Renames a stored entry (name entry accepted). */
export function renameStored(id: string, name: string): void {
  if (!highScorePersistence()) return
  saveTable(renameEntry(loadTable(), id, name))
}
