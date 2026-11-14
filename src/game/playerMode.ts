/**
 * Player-mode selection (two-player R6). The last chosen mode is remembered for
 * the session only: a module variable, never localStorage, a cookie or the URL.
 */

export type PlayerMode = 1 | 2

/** A start request: an explicit mode (motion button, key 1 / 2) or "whatever was used last" (Space). */
export type StartRequest = PlayerMode | 'last'

let mode: PlayerMode = 1

export function getPlayerMode(): PlayerMode {
  return mode
}

export function setPlayerMode(m: PlayerMode): void {
  mode = m
}

/** Test helper / new session: back to the default (1 player). */
export function resetPlayerMode(): void {
  mode = 1
}

/** Keys 1 and 2 pick a mode; every other key returns null. */
export function modeForKey(key: string): PlayerMode | null {
  if (key === '1') return 1
  if (key === '2') return 2
  return null
}

/** Applies a start request: an explicit mode is remembered; 'last' keeps the remembered one. */
export function resolveStartRequest(req: StartRequest): PlayerMode {
  if (req !== 'last') setPlayerMode(req)
  return getPlayerMode()
}
