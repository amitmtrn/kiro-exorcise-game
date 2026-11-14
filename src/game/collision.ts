/**
 * Hit resolution — frame differencing per enemy + game-state consequences.
 */

import type { GameState, Enemy } from './state'
import {
  addScore, decrementLife, addParticles, setFlash, setEnemies,
  incrementCombo, incrementBanished, setShake, addScoreLabels,
  SHAKE_FRAMES, SHAKE_COMBO_THRESHOLD, FRAME_MS,
} from './state'
import { computeFrameDiff, scaleHitbox } from '../webcam/diff'
import { getMotionGrid } from '../webcam/grid'
import type { MotionMask } from '../webcam/diff'
import { STAGES } from './stages'
import { onBossHit } from './enemies/bossPhases'
import { isHittable } from './enemies/vulnerability'
import { CANDY_POINTS } from './enemies/candy'
import { makeKnock, addKnock } from './knock'
import { addHitStop } from './hitstop'
import { selectCallout, makeCallout, addCallout } from './callouts'
import { motionPointsIn, centroid, estimateSwipe } from './swipe'
import type { Pt, Swipe } from './swipe'
import { spawnGhostPuff, spawnBatPuff, spawnScoreLabel } from './particles'
import {
  sfxGhostHit, sfxBatHit, sfxSkullHit,
  sfxBossHit, sfxBossDefeated, sfxCombo,
} from '../audio/sfx'

const SPAWN_GRACE_MS = 300
/** A hit flash below this many 60 Hz frames remaining is over (avoids a 2nd flash frame at 16 ms ticks). */
const FLASH_EPSILON = 0.25

/** Count a hit flash down by `dt` 60 Hz frames (pbt BUG-4). */
function decayFlash(frames: number, dt: number): number {
  const rest = frames - dt
  return rest > FLASH_EPSILON ? rest : 0
}
/** Consecutive *new camera frames* with motion in the hitbox needed to confirm a hit. */
const HIT_FRAMES_REQUIRED = 2

/**
 * Display-space coordinates of every sampled pixel that moved in the most recent
 * new camera frame. Fed by updateMotionPixels() every tick from the loop, read by
 * the motion buttons (all screens) and the debug overlay.
 */
export let lastMotionPixels: Array<{ x: number; y: number }> = []

/**
 * Publish the whole-frame motion mask in display space. On a duplicate camera
 * frame (mask.changed === false) the previous pixels are kept for readers that
 * want the last mask; motion buttons ignore them via `motionFrameSeq`.
 */
export function updateMotionPixels(mask: MotionMask, displayW: number, displayH: number): void {
  if (!mask.changed) return
  const g = getMotionGrid()
  const sx = displayW / g.w
  const sy = displayH / g.h
  lastMotionPixels = mask.points.map((p) => ({ x: p.x * sx, y: p.y * sy }))
  motionFrameSeq++
  motionCell = { w: g.stride * sx, h: g.stride * sy }
}

/**
 * Counts new camera frames published by updateMotionPixels (motion-ui-ergonomics R2.4).
 * A motion button evaluates only when this changed, so the stale points kept on a
 * duplicate frame never keep it filling.
 */
export let motionFrameSeq = 0

/** Size of one motion-grid cell in display pixels: one sampled point stands for this area. */
export let motionCell: { w: number; h: number } = { w: 4, h: 4 }

/**
 * Enemies banished during the most recent resolveHits call, each with
 * hitFlashFrames = 1. They are no longer in state; the renderer draws them in
 * solid white for exactly one frame (spooky-skin R4.2) before the puff shows.
 */
export let lastBanished: Enemy[] = []

/**
 * Swipe vector of every enemy whose hit gate confirmed during the most recent
 * resolveHits call, keyed by enemy id (juice R1). Reset at the start of each call.
 */
export let lastSwipes: Map<string, Swipe> = new Map()

/** Shake the screen when a scoring hit lands at streak ≥ 3 (spooky-skin R4.1). */
function shakeIfStrong(s: GameState): GameState {
  return s.streak >= SHAKE_COMBO_THRESHOLD ? setShake(s, SHAKE_FRAMES) : s
}

/** Award points and float a "+N" label up from the enemy (spooky-skin R5.2). */
function scoreWithPop(s: GameState, enemy: Enemy, pts: number): GameState {
  s = addScore(s, pts)
  return addScoreLabels(s, [spawnScoreLabel(enemy.x, enemy.y, pts)])
}

/** Default swipe when a hit has no recorded direction (straight up). */
const NO_SWIPE: Swipe = { dx: 0, dy: -1, mag: 0, source: 'default' }

/**
 * Banish effects: the one-frame white flash (spooky-skin R4.2) and a knock that
 * flies the enemy off along the swipe (juice R2).
 */
function banishFx(s: GameState, enemy: Enemy, displayH: number): GameState {
  lastBanished.push({ ...enemy, hitFlashFrames: 1 })
  const knock = makeKnock({ ...enemy, hitFlashFrames: 0 }, lastSwipes.get(enemy.id) ?? NO_SWIPE, displayH)
  return { ...s, knocks: addKnock(s.knocks, knock), hitStopMs: addHitStop(s.hitStopMs) }
}

/** Combo call-out after a banish took the combo from `prevCombo` to `s.combo` (juice R4). */
function comboFx(s: GameState, enemy: Enemy, prevCombo: number, displayW: number, displayH: number): GameState {
  const choice = selectCallout(prevCombo, s.combo, s.streak)
  if (!choice) return s
  return { ...s, callouts: addCallout(s.callouts, makeCallout(enemy.x, enemy.y, choice, displayW, displayH)) }
}

function clearFlashes(s: GameState): GameState {
  return s.enemies.some((e) => e.hitFlashFrames > 0)
    ? setEnemies(s, s.enemies.map((e) => (e.hitFlashFrames > 0 ? { ...e, hitFlashFrames: 0 } : e)))
    : s
}

export function resolveHits(
  state: GameState,
  currentData: ImageData,
  prevData: ImageData,
  displayW: number,
  displayH: number,
  now: number,
  frameIsNew = true,
  deltaMs: number = FRAME_MS,
  motionW: number = getMotionGrid().w,
): GameState {
  lastBanished = []
  lastSwipes = new Map()

  // Nothing scores after death (pbt BUG-3).
  // Hit flashes still expire (cleared) so no enemy stays solid white.
  if (state.phase === 'gameover') return clearFlashes(state)

  const dt = deltaMs / FRAME_MS

  // Duplicate camera frame: the diff would be exactly zero everywhere, which
  // used to reset every enemy's 2-frame gate on every other tick for a 30 fps
  // webcam. Leave the gate counters alone and only let hit flashes expire.
  if (!frameIsNew) {
    return setEnemies(state, state.enemies.map((e) =>
      e.hitFlashFrames > 0 ? { ...e, hitFlashFrames: decayFlash(e.hitFlashFrames, dt) } : e,
    ))
  }

  let s = state
  let pendingDefeat: { enemy: Enemy; combo: number } | null = null // applied after the loop so same-frame hits all resolve first
  const updatedEnemies: Enemy[] = []

  for (const raw of state.enemies) {
    // A white flash set last frame expires this frame unless re-triggered below.
    let enemy: Enemy = raw.hitFlashFrames > 0
      ? { ...raw, hitFlashFrames: decayFlash(raw.hitFlashFrames, dt) }
      : raw

    // The last life was lost earlier in this call: nobody else scores.
    if (s.phase === 'gameover') {
      updatedEnemies.push(enemy)
      continue
    }

    if (now - enemy.spawnedAt < SPAWN_GRACE_MS) {
      updatedEnemies.push(enemy)
      continue
    }

    // Shielded boss / approaching lunger: motion does nothing and the gate resets.
    if (!isHittable(enemy)) {
      updatedEnemies.push({ ...enemy, hitCount: 0, motionX: undefined, motionY: undefined })
      continue
    }

    const scaledHitbox = motionW === getMotionGrid().w
      ? scaleHitbox(enemy.hitbox, displayW, displayH)
      : scaleHitbox(enemy.hitbox, displayW, displayH, motionW)
    const diffResult = computeFrameDiff(currentData, prevData, scaledHitbox, motionW)

    const newHitCount = diffResult ? enemy.hitCount + 1 : 0

    // Juice R1: centroid of the moved pixels, in display space. Only enemies with
    // motion pay for it; a still frame breaks the swipe.
    const prevC: Pt | null = enemy.motionX !== undefined && enemy.motionY !== undefined
      ? { x: enemy.motionX, y: enemy.motionY } : null
    let curC: Pt | null = null
    if (diffResult) {
      const c = centroid(motionPointsIn(currentData, prevData, scaledHitbox, motionW))
      if (c) curC = { x: c.x * displayW / motionW, y: c.y * displayH / getMotionGrid().h }
    }

    if (newHitCount < HIT_FRAMES_REQUIRED) {
      updatedEnemies.push({ ...enemy, hitCount: newHitCount, motionX: curC?.x, motionY: curC?.y })
      continue
    }

    lastSwipes.set(enemy.id, estimateSwipe(prevC, curC, { x: enemy.x, y: enemy.y }, displayH))
    // A confirmed hit starts the next swipe from scratch.
    enemy = { ...enemy, motionX: undefined, motionY: undefined }

    // ── Hit confirmed ─────────────────────────────────────────────────────────

    if (enemy.type === 'ghost' || enemy.type === 'lunger') {
      const pts = (enemy.type === 'ghost' ? 100 : 150) * s.combo
      s = scoreWithPop(s, enemy, pts)
      const prevCombo = s.combo
      s = incrementCombo(s)
      s = comboFx(s, enemy, prevCombo, displayW, displayH)
      s = incrementBanished(s)
      s = shakeIfStrong(s)
      s = addParticles(s, spawnGhostPuff(enemy.x, enemy.y))
      s = banishFx(s, enemy, displayH)
      try { sfxGhostHit(); if (s.combo > prevCombo) sfxCombo(s.combo) } catch { /* audio not ready */ }

    } else if (enemy.type === 'bat') {
      s = scoreWithPop(s, enemy, 50 * s.combo)
      const prevCombo = s.combo
      s = incrementCombo(s)
      s = comboFx(s, enemy, prevCombo, displayW, displayH)
      s = incrementBanished(s)
      s = shakeIfStrong(s)
      s = addParticles(s, spawnBatPuff(enemy.x, enemy.y))
      s = banishFx(s, enemy, displayH)
      try { sfxBatHit() } catch { /* audio not ready */ }

    } else if (enemy.type === 'candy') {
      s = scoreWithPop(s, enemy, CANDY_POINTS * s.combo)
      const prevCombo = s.combo
      s = incrementCombo(s)
      s = comboFx(s, enemy, prevCombo, displayW, displayH)
      s = incrementBanished(s)
      s = shakeIfStrong(s)
      s = addParticles(s, spawnBatPuff(enemy.x, enemy.y))
      s = banishFx(s, enemy, displayH)
      try { sfxBatHit() } catch { /* audio not ready */ }

    } else if (enemy.type === 'pumpkin') {
      const newHitsReceived = enemy.hitsReceived + 1
      if (newHitsReceived >= enemy.hitsNeeded) {
        s = scoreWithPop(s, enemy, 200 * s.combo)
        const prevCombo = s.combo
        s = incrementCombo(s)
        s = comboFx(s, enemy, prevCombo, displayW, displayH)
        s = incrementBanished(s)
        s = shakeIfStrong(s)
        s = addParticles(s, spawnBatPuff(enemy.x, enemy.y))
        s = banishFx(s, enemy, displayH)
        try { sfxGhostHit() } catch { /* audio not ready */ }
      } else {
        try { sfxBatHit() } catch { /* audio not ready */ }
        updatedEnemies.push({ ...enemy, hitsReceived: newHitsReceived, hitCount: 0, hitFlashFrames: 1 })
      }

    } else if (enemy.type === 'skull') {
      s = decrementLife(s)
      s = setFlash(s, now + 300)
      s = addParticles(s, spawnGhostPuff(enemy.x, enemy.y))
      lastBanished.push({ ...enemy, hitFlashFrames: 1 })
      try { sfxSkullHit() } catch { /* audio not ready */ }

    } else if (enemy.type === 'boss') {
      const hit = onBossHit(enemy)
      if (hit.defeated) {
        // Applied after the loop so a same-frame game over leaves the boss alive and unscored.
        pendingDefeat = { enemy, combo: s.combo }
      } else {
        updatedEnemies.push(hit.boss)
        if (hit.phaseChanged) s = setShake(s, SHAKE_FRAMES * 2)
        try { sfxBossHit() } catch { /* audio not ready */ }
      }

    } else {
      updatedEnemies.push({ ...enemy, hitCount: newHitCount })
    }
  }

  // The boss fell: the stage ends immediately (boss-phases R6.1, R6.2) and the
  // final stage ends the game with a win. Losing the last life on the very same
  // frame still counts as game over, and the boss then stays alive and unscored.
  if (pendingDefeat) {
    const { enemy, combo } = pendingDefeat
    if (s.phase === 'gameover') {
      updatedEnemies.push(enemy)
    } else {
      s = scoreWithPop(s, enemy, 1000 * combo)
      s = incrementBanished(s)
      s = addParticles(s, spawnGhostPuff(enemy.x, enemy.y))
      s = addParticles(s, spawnBatPuff(enemy.x, enemy.y))
      s = setFlash(s, now + 400)
      s = setShake(s, SHAKE_FRAMES * 2) // boss defeat always rocks the screen
      s = banishFx(s, enemy, displayH)
      try { sfxBossDefeated() } catch { /* audio not ready */ }
      return {
        ...setEnemies(s, []),
        phase: s.stage >= STAGES.length ? 'victory' : 'summary',
        summaryShownMs: 0,
      }
    }
  }
  return s.phase === 'gameover'
    ? clearFlashes(setEnemies(s, updatedEnemies))
    : setEnemies(s, updatedEnemies)
}
