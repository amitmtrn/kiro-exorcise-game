/**
 * Live settings (playtest-polish R7). Renderers read `getSettings()`; the panel calls
 * `updateSettings()`, which saves the stored layer. URL overrides last for the visit and are
 * never written, and an explicit change in the panel replaces the override for that key.
 */

import { DEFAULT_SETTINGS, baseSettings, loadSettings, parseSettingsParams, saveSettings, prefersReducedMotion } from './settings'
import type { Settings, SettingsStorage } from './settings'

export type { Settings }

let base: Settings = DEFAULT_SETTINGS
let chosen: Partial<Settings> = {}
let override: Partial<Settings> = {}
let current: Settings = DEFAULT_SETTINGS
let store: SettingsStorage | null = null
const listeners = new Set<(s: Settings) => void>()

function recompute(): void {
  current = { ...base, ...override }
  for (const l of listeners) l(current)
}

export function getSettings(): Settings { return current }

/** Loads storage and the URL. Call once at start-up (and again to re-read after tests). */
export function initSettings(opts: { storage: SettingsStorage | null; search: string; reducedMotion?: boolean }): Settings {
  store = opts.storage
  base = baseSettings(store, opts.reducedMotion ?? prefersReducedMotion())
  chosen = loadSettings(store)
  override = parseSettingsParams(opts.search)
  recompute()
  return current
}

/** Applies a user change: it replaces any URL override of that key and is saved. */
export function updateSettings(patch: Partial<Settings>): Settings {
  base = { ...base, ...patch }
  chosen = { ...chosen, ...patch }
  const rest = { ...override }
  for (const k of Object.keys(patch) as Array<keyof Settings>) delete rest[k]
  override = rest
  saveSettings(store, chosen)
  recompute()
  return current
}

export function subscribeSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Back to defaults without touching storage (tests). */
export function resetSettings(): void {
  base = DEFAULT_SETTINGS; override = {}; chosen = {}; store = null
  recompute()
}
