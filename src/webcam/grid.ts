/**
 * Motion-diff grid (playtest-polish R2). The size of the off-screen motion
 * frame the hit detection reads can change at run time. Kept apart from
 * diff.ts so modules that read it do not depend on (mockable) diff exports.
 *
 * Hitboxes stay in display space and are mapped through normalised space
 * (`x / displayW * grid.w`), so one display box covers the same fraction of
 * the frame at every size. `stride` keeps the sample lattice about the same
 * density: 320 / 4 and 160 / 2 both give 80 columns.
 */

import type { QualityLevel } from '../game/quality'

export interface MotionGrid { w: number; h: number; stride: number }

/** Supported sizes, largest (default, the original 320 × 180) first. */
export const GRID_LADDER: readonly MotionGrid[] = [
  { w: 320, h: 180, stride: 4 },
  { w: 160, h: 90, stride: 2 },
  { w: 128, h: 72, stride: 2 },
  { w: 96, h: 54, stride: 2 },
]

export const FULL_GRID: MotionGrid = GRID_LADDER[0]

/** Grid of a quality level: 0 and 1 full size, 2 → 160 × 90, 3 → 96 × 54. */
export function gridForLevel(level: QualityLevel): MotionGrid {
  return level >= 3 ? GRID_LADDER[3] : level === 2 ? GRID_LADDER[1] : GRID_LADDER[0]
}

let current: MotionGrid = FULL_GRID

export function getMotionGrid(): MotionGrid { return current }

/** Switches the grid. Returns true when it changed (the caller then runs the change protocol). */
export function setMotionGrid(g: MotionGrid): boolean {
  if (g.w === current.w && g.h === current.h && g.stride === current.stride) return false
  current = g
  return true
}

export function resetMotionGrid(): void { current = FULL_GRID }
