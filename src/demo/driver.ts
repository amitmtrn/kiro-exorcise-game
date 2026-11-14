/**
 * Ghost-hand driver (demo-mode R4). A pure, deterministic state machine that turns
 * the visible game state into a hand position, one tick at a time. It has no DOM, no
 * canvas and no clock of its own: time is the sum of the `deltaMs` it is given, and
 * its only randomness is a PRNG seeded from `seed`.
 *
 * Every movement goes through one choke point (`update`), where the skull rule
 * (R4.5) is checked on each step, so "never touches the skull" holds by construction.
 */

import type { Enemy, GamePhase, Hitbox } from '../game/state'
import { isHittable } from '../game/enemies/vulnerability'
import { isThreat } from '../game/enemies/reach'
import { buttonLayout } from '../ui/layout'
import type { ButtonSpec, ScreenId } from '../ui/layout'
import { ENTRY_LOCK_MS } from '../ui/motionButton'
import { PREVIEW_INPUT_DELAY_MS } from '../ui/cardScreen'
import { MOTION_W } from '../webcam/diff'
import { DEMO } from './params'
import { mulberry32 } from './rng'
import type { Pt } from './camera'

// ─── Tuning (all times are demo ms) ──────────────────────────────────────────

export const REACT_MS: readonly [number, number] = [180, 320]
export const REACT_BOSS_MS: Readonly<Record<1 | 2 | 3, readonly [number, number]>> = {
  1: [180, 320], 2: [300, 400], 3: [120, 180],
}
export const REACT_LUNGER_MS: readonly [number, number] = [200, 300]
export const COOLDOWN_MS: readonly [number, number] = [120, 260]
/** Swipe speed in canvas heights per second, and its duration clamp. */
export const SWIPE_SPEED_H = 1.6
export const SWIPE_MS: readonly [number, number] = [220, 1000]
/** Path parameter at which the swipe passes through the target. */
export const CONTACT_U = 0.55
/** One swipe in this many, at a low-urgency target, passes beside it. */
export const MISS_ONE_IN = 8
/** A target nearer than this fraction of the canvas height to the centre is never missed on purpose. */
export const MISS_SAFE_CENTRE_H = 0.35
export const HOME_AFTER_MS = 1500
export const BUTTON_SETTLE_MS = 300
export const BURST_MS = 2400
export const BURST_MENU_MS = 3200
export const RETREAT_REST_MS = 600
export const VICTORY_BEFORE_CARD_MS = 2500
export const CARD_HOLD_MS = 4500
export const BEFORE_MENU_MS = 1200
export const TITLE_WAIT_FIRST_MS = 600
export const TITLE_WAIT_LOOP_MS = 3000
export const GAMEOVER_WAIT_MS = 2500
/** Enemies younger than this are still inside the hit grace (collision SPAWN_GRACE_MS 300) once the swipe lands. */
const SPAWN_MIN_AGE_MS = 150
const CIRCLE_HZ = 2.5
const EDGE_INSET_PX = 8

// ─── Geometry helpers ────────────────────────────────────────────────────────

export function handRadius(h: number): number {
  return Math.round(Math.min(DEMO.handMaxPx, Math.max(DEMO.handMinPx, DEMO.handRadiusH * h)))
}

/** Distance from a point to an axis-aligned rectangle (0 inside). */
export function distToRect(p: Pt, r: Hitbox): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w))
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h))
  return Math.hypot(dx, dy)
}

/** How far a skull can travel in `ms` of demo time, in px (its speed is in canvas heights per second). */
export function skullTravelPx(skull: Enemy, h: number, ms: number): number {
  return skull.speed * h * (skull.exiting ? 1.5 : 1) * ms / 1000
}

/**
 * The skull rule (R4.5): the diff of two consecutive frames lies inside the union of the two
 * hand discs, so a step is safe when both discs stay at least `R + 2 cells + travel` away
 * from every skull hitbox. `extraMs` widens the travel allowance (planning a whole swipe).
 */
export function stepSafe(
  from: Pt, to: Pt, R: number, skulls: readonly Enemy[], w: number, h: number, tickMs: number, extraMs = 0,
): boolean {
  const cell = (4 * w) / MOTION_W
  for (const s of skulls) {
    const margin = R + 2 * cell + skullTravelPx(s, h, tickMs + 16 + extraMs)
    if (distToRect(from, s.hitbox) < margin || distToRect(to, s.hitbox) < margin) return false
  }
  return true
}

function smoother(u: number): number { const c = Math.min(1, Math.max(0, u)); return c * c * c * (c * (6 * c - 15) + 10) }
function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)) }

// ─── Public types ────────────────────────────────────────────────────────────

/** What the driver can see: the same state the screens and the loop see at the top of a tick. */
export interface DemoView {
  phase: GamePhase
  stage: number
  bonus: boolean
  enemies: readonly Enemy[]
  w: number
  h: number
  /** The game clock (`performance.now`, deterministic in demo mode); compared with `enemy.spawnedAt`. */
  now: number
  cardOpen: boolean
  hasPhoto: boolean
  noPhoto: boolean
}

export interface DriverStats {
  swipes: number
  misses: number
  presses: number
  /** Steps held back by the skull rule. */
  blocked: number
  /** Number of completed attract loops (runs restarted). */
  runs: number
}

type MoveKind = 'swipe' | 'glide' | 'circle'
interface Move {
  kind: MoveKind
  at: (t: number) => Pt
  dur: number
  t: number
  /** For swipes: the enemy aimed at. */
  targetId?: string
  /** For swipes: how the swipe ends the planning (a deliberate miss). */
  miss?: boolean
}

interface Track {
  /** Driver time the enemy was first on screen (null: not yet). */
  first: number | null
  react: number
  x: number; y: number
  vx: number; vy: number
  attackKey: string
  attackSince: number
  attackReact: number
}

interface ButtonTarget {
  screen: ScreenId
  id: string
  lockMs: number
  delayMs: number
  burstMs: number
}

// ─── Driver ──────────────────────────────────────────────────────────────────

export class DemoDriver {
  hand: Pt
  readonly stats: DriverStats = { swipes: 0, misses: 0, presses: 0, blocked: 0, runs: 0 }
  /** What the hand is doing now (for tests and the debug caption). */
  get mode(): 'hold' | MoveKind { return this.move ? this.move.kind : 'hold' }

  private rng: () => number
  private t = 0
  private move: Move | null = null
  private holdMs = 0
  private lastTickMs: number = DEMO.stepMs * DEMO.timeScale
  private tracks = new Map<string, Track>()
  private avoidUntil = new Map<string, number>()
  private missed = new Set<string>()
  private idleSince = 0
  private screenKey = ''
  private screenSince = 0
  private cardShown = false
  private runStarted = false
  private press: 'idle' | 'resting' = 'idle'
  private restUntil = 0

  constructor(private seed: number, w = 1280, h = 720) {
    this.rng = mulberry32(seed)
    this.hand = { x: 0.5 * w, y: 0.7 * h }
  }

  /** New run (attract loop): same seed, same decisions; the hand stays where it is. */
  reset(): void {
    this.rng = mulberry32(this.seed)
    this.move = null
    this.holdMs = 0
    this.tracks.clear()
    this.avoidUntil.clear()
    this.missed.clear()
    this.idleSince = this.t
    this.cardShown = false
    this.runStarted = false
    this.press = 'idle'
    this.stats.runs++
  }

  private range(r: readonly [number, number]): number { return r[0] + this.rng() * (r[1] - r[0]) }

  update(deltaMs: number, view: DemoView): Pt {
    const dt = Math.max(0, deltaMs)
    this.t += dt
    this.lastTickMs = dt
    const R = handRadius(view.h)
    this.observe(view)

    // Screen bookkeeping: a change of screen restarts the entry clock and drops the current move.
    const key = `${view.phase}|${view.cardOpen}|${view.stage}|${view.bonus}`
    if (key !== this.screenKey) {
      this.screenKey = key
      this.screenSince = this.t
      this.press = 'idle'
      this.restUntil = 0
      this.move = null
      this.holdMs = 0
      if (view.cardOpen) this.cardShown = true
    }

    // A new run starts when the title screen comes back after a started run.
    if (view.phase === 'start' && this.runStarted) this.reset()
    if (view.phase !== 'start') this.runStarted = true

    if (!this.move) this.plan(view, R, dt)

    if (this.move) {
      const m = this.move
      m.t += dt
      const next = m.at(Math.min(m.t, m.dur))
      const to = { x: clamp(next.x, 0, view.w), y: clamp(next.y, 0, view.h) }
      const skulls = view.enemies.filter((e) => e.type === 'skull')
      if (stepSafe(this.hand, to, R, skulls, view.w, view.h, dt)) {
        this.hand = to
        if (m.t >= m.dur) this.finishMove(m)
      } else {
        this.stats.blocked++
        if (m.targetId) this.avoidUntil.set(m.targetId, this.t + 400)
        this.move = null
        this.holdMs = this.range(COOLDOWN_MS)
      }
    }
    return this.hand
  }

  // ── Observation ──────────────────────────────────────────────────────────

  private onScreen(e: Enemy, w: number, h: number): boolean {
    return e.x >= EDGE_INSET_PX && e.x <= w - EDGE_INSET_PX && e.y >= EDGE_INSET_PX && e.y <= h - EDGE_INSET_PX
  }

  private attackKeyOf(e: Enemy): string {
    if (e.type === 'boss') return `${e.bossPhase}:${e.bossAttack}:${e.bossInvulnMs > 0 ? 'i' : 'v'}`
    if (e.type === 'lunger') return e.movePhase
    return ''
  }

  private observe(view: DemoView): void {
    const seen = new Set<string>()
    const dt = Math.max(1, this.lastTickMs)
    for (const e of view.enemies) {
      seen.add(e.id)
      let tr = this.tracks.get(e.id)
      const on = this.onScreen(e, view.w, view.h)
      if (!tr) {
        tr = {
          first: null, react: this.range(REACT_MS), x: e.x, y: e.y, vx: 0, vy: 0,
          attackKey: '', attackSince: this.t, attackReact: 0,
        }
        this.tracks.set(e.id, tr)
      } else {
        // Smoothed velocity estimate, px per ms.
        tr.vx = 0.5 * tr.vx + 0.5 * ((e.x - tr.x) / dt)
        tr.vy = 0.5 * tr.vy + 0.5 * ((e.y - tr.y) / dt)
        tr.x = e.x; tr.y = e.y
      }
      if (on && tr.first === null) tr.first = this.t
      const key = this.attackKeyOf(e)
      if (key !== tr.attackKey) {
        tr.attackKey = key
        tr.attackSince = this.t
        if (e.type === 'boss') tr.attackReact = this.range(REACT_BOSS_MS[e.bossPhase])
        else if (e.type === 'lunger') tr.attackReact = this.range(REACT_LUNGER_MS)
      }
    }
    for (const id of [...this.tracks.keys()]) if (!seen.has(id)) { this.tracks.delete(id); this.avoidUntil.delete(id); this.missed.delete(id) }
  }

  // ── Planning ─────────────────────────────────────────────────────────────

  private plan(view: DemoView, R: number, dt: number): void {
    if (view.phase === 'playing') { this.planPlaying(view, R, dt); return }

    const target = this.buttonTarget(view)
    if (!target) { this.holdMs = 0; return } // stage title: rest
    this.planButton(view, target)
  }

  private planPlaying(view: DemoView, R: number, dt: number): void {
    if (this.holdMs > 0) { this.holdMs -= dt; if (this.holdMs > 0) return }
    const skulls = view.enemies.filter((e) => e.type === 'skull')
    const target = this.pickTarget(view)
    if (target) {
      this.idleSince = this.t
      const mv = this.planSwipe(view, R, target, skulls)
      if (mv) { this.move = mv; return }
      this.avoidUntil.set(target.id, this.t + 400)
      return
    }
    // Nothing to hit: pre-position near a shielded boss, else drift home after a while.
    const boss = view.enemies.find((e) => e.type === 'boss')
    let rest: Pt | null = null
    if (boss && boss.bossPhase >= 2) rest = { x: boss.x, y: Math.min(view.h * 0.7, boss.y + 0.2 * view.h) }
    else if (this.t - this.idleSince > HOME_AFTER_MS) rest = { x: 0.5 * view.w, y: 0.6 * view.h }
    if (rest && Math.hypot(rest.x - this.hand.x, rest.y - this.hand.y) > 60) {
      this.move = this.makeGlide(rest, view.h, 400, 900)
      this.idleSince = this.t
    }
  }

  private pickTarget(view: DemoView): Enemy | null {
    const cx = view.w / 2, cy = view.h / 2
    let best: Enemy | null = null
    let bestKey: [number, number] = [Infinity, Infinity]
    for (const e of view.enemies) {
      if (e.type === 'skull') continue
      if (!isHittable(e)) continue
      if (!this.onScreen(e, view.w, view.h)) continue
      if (view.now - e.spawnedAt < SPAWN_MIN_AGE_MS) continue
      if ((this.avoidUntil.get(e.id) ?? 0) > this.t) continue
      const tr = this.tracks.get(e.id)
      if (!tr || tr.first === null) continue
      if (this.t - tr.first < tr.react) continue
      const attacking = (e.type === 'boss' && e.bossAttack !== 'idle') || (e.type === 'lunger' && e.movePhase !== 'approach')
      if (attacking && this.t - tr.attackSince < tr.attackReact) continue
      const cls = attacking ? -1 : e.type === 'boss' ? 0.5 : isThreat(e) ? 0 : 1
      const key: [number, number] = [cls, Math.hypot(e.x - cx, e.y - cy)]
      if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) { best = e; bestKey = key }
    }
    return best
  }

  private planSwipe(view: DemoView, R: number, e: Enemy, skulls: readonly Enemy[]): Move | null {
    const tr = this.tracks.get(e.id)
    const half = Math.max(e.hitbox.w, e.hitbox.h) / 2
    const dist0 = Math.hypot(e.x - this.hand.x, e.y - this.hand.y)
    const roughDur = clamp(dist0 / (SWIPE_SPEED_H * view.h / 1000), SWIPE_MS[0], SWIPE_MS[1])
    const lead = CONTACT_U * roughDur
    let E: Pt = { x: e.x + (tr?.vx ?? 0) * lead, y: e.y + (tr?.vy ?? 0) * lead }
    E = { x: clamp(E.x, 0, view.w), y: clamp(E.y, 0, view.h) }

    const lowUrgency = e.type !== 'boss' && e.type !== 'lunger'
      && Math.hypot(e.x - view.w / 2, e.y - view.h / 2) > MISS_SAFE_CENTRE_H * view.h
    const wantMiss = lowUrgency && !this.missed.has(e.id) && this.rng() < 1 / MISS_ONE_IN

    let d = { x: E.x - this.hand.x, y: E.y - this.hand.y }
    let len = Math.hypot(d.x, d.y)
    if (len < 1) { const a = this.rng() * Math.PI * 2; d = { x: Math.cos(a), y: Math.sin(a) }; len = 1 }
    d = { x: d.x / len, y: d.y / len }
    const n = { x: -d.y, y: d.x }

    if (wantMiss) {
      const side = this.rng() < 0.5 ? -1 : 1
      const off = half + R + 30
      E = { x: clamp(E.x + n.x * off * side, 0, view.w), y: clamp(E.y + n.y * off * side, 0, view.h) }
    }

    const sign0 = this.rng() < 0.5 ? -1 : 1
    const angle = (15 + this.rng() * 20) * Math.PI / 180
    for (const sign of [sign0, -sign0]) {
      const a = angle * sign
      const dir = { x: d.x * Math.cos(a) - d.y * Math.sin(a), y: d.x * Math.sin(a) + d.y * Math.cos(a) }
      const over = R + 70
      const p2 = { x: clamp(E.x + dir.x * over, 0, view.w), y: clamp(E.y + dir.y * over, 0, view.h) }
      const p0 = this.hand
      const u = CONTACT_U
      const k = 2 * u * (1 - u)
      const c = { x: (E.x - (1 - u) ** 2 * p0.x - u * u * p2.x) / k, y: (E.y - (1 - u) ** 2 * p0.y - u * u * p2.y) / k }
      // Duration from the real length of the curve (a control point far off screen makes it much longer than the chord).
      let total = 0
      let last = p0
      for (let i = 1; i <= 16; i++) {
        const s = i / 16
        const q = { x: (1 - s) ** 2 * p0.x + 2 * s * (1 - s) * c.x + s * s * p2.x, y: (1 - s) ** 2 * p0.y + 2 * s * (1 - s) * c.y + s * s * p2.y }
        total += Math.hypot(q.x - last.x, q.y - last.y)
        last = q
      }
      const dur = clamp(total / (SWIPE_SPEED_H * view.h / 1000), SWIPE_MS[0], SWIPE_MS[1])
      const at = (t: number): Pt => {
        const s = smoother(t / dur)
        return {
          x: (1 - s) ** 2 * p0.x + 2 * s * (1 - s) * c.x + s * s * p2.x,
          y: (1 - s) ** 2 * p0.y + 2 * s * (1 - s) * c.y + s * s * p2.y,
        }
      }
      if (this.pathSafe(at, dur, R, skulls, view)) {
        this.stats.swipes++
        if (wantMiss) { this.stats.misses++; this.missed.add(e.id) }
        return { kind: 'swipe', at, dur, t: 0, targetId: e.id, miss: wantMiss }
      }
    }
    return null
  }

  /** Samples a planned path and applies the skull rule, widened by the skull's travel over the whole move. */
  private pathSafe(at: (t: number) => Pt, dur: number, R: number, skulls: readonly Enemy[], view: DemoView): boolean {
    if (skulls.length === 0) return true
    let prev = this.hand
    for (let i = 1; i <= 16; i++) {
      const p = at((dur * i) / 16)
      if (!stepSafe(prev, p, R, skulls, view.w, view.h, this.lastTickMs, dur)) return false
      prev = p
    }
    return true
  }

  private makeGlide(to: Pt, h: number, minMs: number, maxMs: number): Move {
    const p0 = this.hand
    const dist = Math.hypot(to.x - p0.x, to.y - p0.y)
    const dur = clamp(dist / (1.2 * h / 1000), minMs, maxMs)
    // A gentle bow so the path is a curve, not a ruler line.
    const side = this.rng() < 0.5 ? -1 : 1
    const mid = { x: (p0.x + to.x) / 2, y: (p0.y + to.y) / 2 }
    const nx = -(to.y - p0.y) / (dist || 1), ny = (to.x - p0.x) / (dist || 1)
    const c = { x: mid.x + nx * dist * 0.12 * side, y: mid.y + ny * dist * 0.12 * side }
    const at = (t: number): Pt => {
      const s = smoother(t / dur)
      return {
        x: (1 - s) ** 2 * p0.x + 2 * s * (1 - s) * c.x + s * s * to.x,
        y: (1 - s) ** 2 * p0.y + 2 * s * (1 - s) * c.y + s * s * to.y,
      }
    }
    return { kind: 'glide', at, dur, t: 0 }
  }

  private finishMove(m: Move): void {
    this.move = null
    if (m.kind === 'swipe') this.holdMs = this.range(COOLDOWN_MS)
    if (m.kind === 'circle') this.press = 'resting'
  }

  // ── Buttons ──────────────────────────────────────────────────────────────

  private buttonTarget(view: DemoView): ButtonTarget | null {
    switch (view.phase) {
      case 'start':
        return { screen: 'start', id: 'one', lockMs: ENTRY_LOCK_MS, burstMs: BURST_MS,
          delayMs: this.stats.runs === 0 ? TITLE_WAIT_FIRST_MS : TITLE_WAIT_LOOP_MS }
      case 'summary':
        return { screen: 'summary', id: 'next', lockMs: ENTRY_LOCK_MS, burstMs: BURST_MS, delayMs: 0 }
      case 'gameover':
        return { screen: 'gameover', id: 'retry', lockMs: ENTRY_LOCK_MS, burstMs: BURST_MS, delayMs: GAMEOVER_WAIT_MS }
      case 'victory':
        if (view.cardOpen) {
          return { screen: 'preview', id: 'close', lockMs: PREVIEW_INPUT_DELAY_MS, burstMs: BURST_MS, delayMs: CARD_HOLD_MS }
        }
        if (!this.cardShown) {
          return { screen: 'victory', id: 'offer', lockMs: ENTRY_LOCK_MS, burstMs: BURST_MS, delayMs: VICTORY_BEFORE_CARD_MS }
        }
        return { screen: 'victory', id: 'menu', lockMs: ENTRY_LOCK_MS + PREVIEW_INPUT_DELAY_MS, burstMs: BURST_MENU_MS, delayMs: BEFORE_MENU_MS }
      default:
        return null // stageTitle
    }
  }

  private planButton(view: DemoView, target: ButtonTarget): void {
    const spec = this.findButton(view, target)
    if (!spec) return
    const since = this.t - this.screenSince
    if (since < Math.max(target.lockMs + BUTTON_SETTLE_MS, target.delayMs)) return
    if (this.t < this.restUntil) return

    const rho = Math.max(12, 0.45 * spec.r)
    const theta0 = -Math.PI / 2
    const start = { x: spec.cx + rho * Math.cos(theta0), y: spec.cy + rho * Math.sin(theta0) }

    if (this.press === 'resting') {
      // The burst did not press the button (release latch or lockout): leave the circle, rest, try again.
      const away = { x: spec.cx + (spec.cx < view.w / 2 ? 1 : -1) * 3.2 * spec.r, y: spec.cy + 1.2 * spec.r }
      this.move = this.makeGlide({ x: clamp(away.x, 0, view.w), y: clamp(away.y, 0, view.h) }, view.h, 300, 700)
      this.restUntil = this.t + this.move.dur + RETREAT_REST_MS
      this.press = 'idle'
      return
    }
    // Not at the circle yet: glide there, then circle.
    if (Math.hypot(start.x - this.hand.x, start.y - this.hand.y) > 3) {
      this.move = this.makeGlide(start, view.h, 350, 900)
      return
    }
    const w = (2 * Math.PI * CIRCLE_HZ) / 1000
    const dur = target.burstMs
    this.stats.presses++
    this.move = {
      kind: 'circle', dur, t: 0,
      at: (t) => ({ x: spec.cx + rho * Math.cos(theta0 + w * t), y: spec.cy + rho * Math.sin(theta0 + w * t) }),
    }
  }

  private findButton(view: DemoView, target: ButtonTarget): ButtonSpec | null {
    const specs = buttonLayout(target.screen, view.w, view.h, { hasPhoto: view.hasPhoto, noPhoto: view.noPhoto })
    return specs.find((s) => s.id === target.id) ?? null
  }
}
