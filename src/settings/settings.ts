/**
 * Accessibility settings (playtest-polish R7): pure parsing, validation and persistence.
 *
 * One localStorage key holds the three setting values and nothing else (never video or images).
 * Precedence: URL parameter > stored value > default. `reducedFlash` defaults to the browser's
 * `prefers-reduced-motion`.
 */

export type TextScale = 1 | 1.25 | 1.5
export const TEXT_SCALES: readonly TextScale[] = [1, 1.25, 1.5]

export interface Settings {
  /** Colourblind-safe palette and shape cues. */
  cb: boolean
  /** Multiplier for HUD, call-out, menu and onboarding text. */
  textScale: TextScale
  /** Capped, ramped and rate-limited full-screen flashes; weaker shake; no white hit silhouette. */
  reducedFlash: boolean
}

export const DEFAULT_SETTINGS: Settings = { cb: false, textScale: 1, reducedFlash: false }
export const SETTINGS_KEY = 'exorcise-settings'

export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>

function parseBool(v: string | null): boolean | undefined {
  if (v === null) return undefined
  const s = v.trim().toLowerCase()
  if (s === '1' || s === 'true' || s === 'on') return true
  if (s === '0' || s === 'false' || s === 'off') return false
  return undefined
}

/** `?cb=1`, `?bigtext=1` (1.25×) / `2` (1.5×) / `0`, `?reducedflash=1`. Unknown values are ignored. */
export function parseSettingsParams(search: string): Partial<Settings> {
  let p: URLSearchParams
  try { p = new URLSearchParams(search) } catch { return {} }
  const out: Partial<Settings> = {}
  const cb = parseBool(p.get('cb'))
  if (cb !== undefined) out.cb = cb
  const rf = parseBool(p.get('reducedflash'))
  if (rf !== undefined) out.reducedFlash = rf
  const big = p.get('bigtext')?.trim().toLowerCase()
  if (big === '1' || big === 'true' || big === 'on') out.textScale = 1.25
  else if (big === '2') out.textScale = 1.5
  else if (big === '0' || big === 'false' || big === 'off') out.textScale = 1
  return out
}

function isTextScale(v: unknown): v is TextScale {
  return v === 1 || v === 1.25 || v === 1.5
}

/** Stored settings; every field is validated, anything else is dropped. Unreadable data gives `{}`. */
export function loadSettings(storage: SettingsStorage | null): Partial<Settings> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(SETTINGS_KEY)
    if (!raw) return {}
    const o: unknown = JSON.parse(raw)
    if (typeof o !== 'object' || o === null) return {}
    const r = o as Record<string, unknown>
    const out: Partial<Settings> = {}
    if (typeof r.cb === 'boolean') out.cb = r.cb
    if (typeof r.reducedFlash === 'boolean') out.reducedFlash = r.reducedFlash
    if (isTextScale(r.textScale)) out.textScale = r.textScale
    return out
  } catch {
    return {}
  }
}

/**
 * Writes only the setting fields the user has chosen (so an untouched `reducedFlash` keeps following
 * `prefers-reduced-motion`). Storage errors are ignored (private mode).
 */
export function saveSettings(storage: SettingsStorage | null, s: Partial<Settings>): void {
  if (!storage) return
  const data: Partial<Settings> = {}
  if (s.cb !== undefined) data.cb = s.cb
  if (s.textScale !== undefined) data.textScale = s.textScale
  if (s.reducedFlash !== undefined) data.reducedFlash = s.reducedFlash
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(data)) } catch { /* ignore */ }
}

export interface ResolveInput {
  storage: SettingsStorage | null
  search: string
  prefersReducedMotion: boolean
}

/** The settings of the stored layer: defaults, then `prefers-reduced-motion`, then storage. */
export function baseSettings(storage: SettingsStorage | null, prefersReducedMotion: boolean): Settings {
  return { ...DEFAULT_SETTINGS, reducedFlash: prefersReducedMotion, ...loadSettings(storage) }
}

/** URL > stored > default. */
export function resolveSettings(i: ResolveInput): Settings {
  return { ...baseSettings(i.storage, i.prefersReducedMotion), ...parseSettingsParams(i.search) }
}

/** `prefers-reduced-motion: reduce`, false where matchMedia is missing. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Next text scale in the cycle 1 → 1.25 → 1.5 → 1. */
export function nextTextScale(s: TextScale): TextScale {
  return TEXT_SCALES[(TEXT_SCALES.indexOf(s) + 1) % TEXT_SCALES.length]
}
