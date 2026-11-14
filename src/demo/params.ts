/**
 * Demo mode parameters and key rules (demo-mode R1, R5). Pure: no DOM.
 */

export const DEMO = {
  /** Fixed real step per processed tick, ms. */
  stepMs: 1000 / 60,
  /** rAF frames arriving sooner than this after the last processed one are skipped (high-refresh displays). */
  minFrameMs: 12,
  /** Default time scale: game, driver and clock advance stepMs × scale per processed tick. */
  timeScale: 2,
  /** Synthetic camera frame interval in demo time (a 30 fps webcam). */
  frameMs: 1000 / 30,
  /** Plays a clean run (no game over) at the common window sizes; any seed works (demo-mode R5.2). */
  defaultSeed: 7,
  defaultStage: 1,
  minSpeed: 1,
  maxSpeed: 4,
  /** Hand disc radius as a fraction of the canvas height, clamped to [handMinPx, handMaxPx]. */
  handRadiusH: 0.055,
  handMinPx: 36,
  handMaxPx: 60,
} as const

/** The key that switches demo mode on (title screen) and off (demo-mode R1.2). */
export const DEMO_TOGGLE_KEY = 'g'

export interface DemoParams {
  demo: boolean
  seed: number
  stage: number
  speed: number
}

/** Parses a non-negative integer; anything else (empty, junk, negative, fractional) is null. */
function intParam(v: string | null): number | null {
  if (v === null || !/^\d{1,9}$/.test(v.trim())) return null
  return Number(v.trim())
}

/** Reads `?demo=1&seed=N&stage=N&speed=N`. Missing or invalid values fall back to the defaults. */
export function parseDemoParams(search: string): DemoParams {
  let q: URLSearchParams
  try { q = new URLSearchParams(search) } catch { q = new URLSearchParams() }
  const seed = intParam(q.get('seed'))
  const stage = intParam(q.get('stage'))
  const speed = Number(q.get('speed'))
  return {
    demo: q.get('demo') === '1',
    seed: seed ?? DEMO.defaultSeed,
    stage: stage !== null && stage >= 1 && stage <= 5 ? stage : DEMO.defaultStage,
    speed: Number.isFinite(speed) && q.get('speed') !== null && q.get('speed') !== ''
      ? Math.min(DEMO.maxSpeed, Math.max(DEMO.minSpeed, speed)) : DEMO.timeScale,
  }
}

export type DemoKeyAction = 'toggle' | 'exit' | 'ignore'

export interface KeyLike {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'])

/**
 * What a key press does while demo mode is on: `G` toggles it off, bare modifiers and `M`
 * (mute) are ignored, anything else leaves demo mode (R1.3, R1.4).
 */
export function demoKeyAction(e: KeyLike): DemoKeyAction {
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey
  if (plain && e.key.toLowerCase() === DEMO_TOGGLE_KEY) return 'toggle'
  if (MODIFIER_KEYS.has(e.key)) return 'ignore'
  if (plain && (e.key === 'm' || e.key === 'M')) return 'ignore'
  return 'exit'
}

/** True when a key press on the normal title screen should switch demo mode on (R1.2). */
export function isDemoToggleKey(e: KeyLike, onTitleScreen: boolean): boolean {
  return onTitleScreen && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === DEMO_TOGGLE_KEY
}

export type DemoKeyRoute = 'leave' | 'enter' | 'swallow' | 'pass'

/** How long after leaving demo mode the auto-repeats of the key that left it are swallowed. */
export const LEAVE_REPEAT_MS = 500

/**
 * Routes one keydown (demo-mode R1.2–R1.4). `leave`: stop demo, show the normal title (the key is used up).
 * `enter`: start demo (G on the normal title screen). `swallow`: auto-repeat of the key that just left demo.
 * `pass`: the normal key handler runs.
 */
export function routeDemoKey(
  e: KeyLike & { repeat?: boolean },
  ctx: { demoOn: boolean; onTitle: boolean; msSinceLeft: number },
): DemoKeyRoute {
  if (ctx.demoOn) return demoKeyAction(e) === 'ignore' ? 'pass' : 'leave'
  if (e.repeat && ctx.msSinceLeft < LEAVE_REPEAT_MS) return 'swallow'
  if (!e.repeat && isDemoToggleKey(e, ctx.onTitle)) return 'enter'
  return 'pass'
}
