/**
 * Demo mode parameters and key rules (demo-mode R1, R5). Pure: no DOM.
 */

export const DEMO = {
  /** Fixed real step per processed tick, ms. */
  stepMs: 1000 / 60,
  /** Real-time slack: a frame that arrives this much short of a full step still runs the step (timer jitter at 60 Hz). */
  stepSlackMs: 2,
  /** A single frame gap counts for at most this much real time (a hidden tab or a stall does not burst). */
  maxGapMs: 100,
  /** Default time scale: game, driver and clock advance stepMs × scale per processed tick. */
  timeScale: 2,
  /** Synthetic camera frame interval in demo time (a 30 fps webcam). */
  frameMs: 1000 / 30,
  /** Plays a clean run (no game over) at the common window sizes; any seed works (demo-mode R5.2). */
  defaultSeed: 5,
  defaultStage: 1,
  minSpeed: 1,
  maxSpeed: 3,
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
  if (v === null || !/^\d{1,9}$/.test(v)) return null
  return Number(v)
}

/** Parses a plain decimal number (`2`, `1.5`); hex, exponent, signs and junk are null. */
function decimalParam(v: string | null): number | null {
  if (v === null || !/^\d{1,3}(\.\d{1,6})?$/.test(v)) return null
  return Number(v)
}

/** Reads `?demo=1&seed=N&stage=N&speed=N`. Missing or invalid values fall back to the defaults. */
export function parseDemoParams(search: string): DemoParams {
  let q: URLSearchParams
  try { q = new URLSearchParams(search) } catch { q = new URLSearchParams() }
  const seed = intParam(q.get('seed'))
  const stage = intParam(q.get('stage'))
  const speed = decimalParam(q.get('speed'))
  return {
    demo: q.get('demo') === '1',
    seed: seed ?? DEMO.defaultSeed,
    stage: stage !== null && stage >= 1 && stage <= 5 ? stage : DEMO.defaultStage,
    speed: speed !== null && speed >= DEMO.minSpeed && speed <= DEMO.maxSpeed ? speed : DEMO.timeScale,
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
/** Screenshot, media and volume keys belong to the OS (a filming tool needs them). */
const SYSTEM_KEY = /^(PrintScreen|Audio\w+|Media\w+)$/
const FUNCTION_KEY = /^F([1-9]|1[0-2])$/

/**
 * What a key press does while demo mode is on: `G` toggles it off; bare modifiers, `M` (mute),
 * `F1`–`F12` and Ctrl / Meta / Alt chords (reload, full screen, dev tools, tab keys) are ignored;
 * anything else leaves demo mode (R1.3, R1.4).
 */
export function demoKeyAction(e: KeyLike): DemoKeyAction {
  if (typeof e.key !== 'string') return 'ignore' // synthetic key events (autofill, extensions) can lack a key
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey
  if (plain && e.key.toLowerCase() === DEMO_TOGGLE_KEY) return 'toggle'
  if (MODIFIER_KEYS.has(e.key) || FUNCTION_KEY.test(e.key) || SYSTEM_KEY.test(e.key) || !plain) return 'ignore'
  if (plain && (e.key === 'm' || e.key === 'M')) return 'ignore'
  return 'exit'
}

/** True when a key press on the normal title screen should switch demo mode on (R1.2). */
export function isDemoToggleKey(e: KeyLike, onTitleScreen: boolean): boolean {
  return onTitleScreen && typeof e.key === 'string' && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === DEMO_TOGGLE_KEY
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
  if (ctx.demoOn) {
    const action = demoKeyAction(e)
    if (action === 'ignore') return 'pass'
    // one physical press is one toggle: auto-repeats of a held key (e.g. the G that entered demo) are used up
    return e.repeat ? 'swallow' : 'leave'
  }
  if (e.repeat && ctx.msSinceLeft < LEAVE_REPEAT_MS) return 'swallow'
  if (!e.repeat && isDemoToggleKey(e, ctx.onTitle)) return 'enter'
  return 'pass'
}
