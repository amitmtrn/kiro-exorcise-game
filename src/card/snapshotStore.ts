/**
 * In-memory holder for the single Exorcist Card snapshot (exorcist-card R2).
 *
 * Generic over the stored value so it can be unit-tested without a canvas.
 * Nothing here serialises or persists: the value lives only in this closure
 * until it is replaced or discarded.
 */

import type { Moment } from '../game/runStats'

export interface SnapshotStore<T> {
  /**
   * Offers a moment. `grab` runs (and the camera is read) only if the moment
   * ranks strictly higher than the stored one, or the store is empty.
   * Returns true when a new snapshot was taken.
   */
  offer(moment: Moment, grab: () => T): boolean
  get(): T | null
  has(): boolean
  /** The moment of the stored snapshot, if any. */
  moment(): Moment | null
  /** Drops the snapshot and releases it. */
  discard(): void
}

export function createSnapshotStore<T>(release: (value: T) => void = () => {}): SnapshotStore<T> {
  let value: T | null = null
  let current: Moment | null = null

  function drop(): void {
    if (value !== null) {
      const old = value
      value = null
      current = null
      try { release(old) } catch { /* releasing must never break the game */ }
    }
  }

  return {
    offer(moment, grab) {
      if (current !== null && moment.rank <= current.rank) return false
      const next = grab()
      drop()
      value = next
      current = moment
      return true
    },
    get: () => value,
    has: () => value !== null,
    moment: () => current,
    discard: drop,
  }
}
