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
import { isThreat, CENTER_THRESHOLD } from '../game/enemies/reach'
import { pathDurationMs } from '../game/paths'
import { buttonLayout } from '../ui/layout'
import type { ButtonSpec, ScreenId } from '../ui/layout'
import { ENTRY_LOCK_MS } from '../ui/motionButton'
import { PREVIEW_INPUT_DELAY_MS } from '../ui/cardScreen'
import { MOTION_W, MOTION_H } from '../webcam/diff'
import { DEMO } from './params'
import { mulberry32 } from './rng'
import type { Pt } from './camera'

// ─── Tuning (all times are demo ms) ──────────────────────────────────────────

export const REACT_MS: readonly [number, number] = [180, 320]
export const REACT_BOSS_MS: Readonly<Record<1 | 2 | 3, readonly [number, number]>> = {
  1: [180, 320], 2: [300, 400], 3: [120, 180],
}
export const REACT_LUNGER_MS: readonly [number, number] = [150, 230]
/** An approaching lunger this close to the centre (fraction of the height) is about to wind up: the hand goes to meet it. */
export const LUNGER_STAGE_H = 0.3
/** ...unless another threat will cost a life sooner than this. */
export const THREAT_FIRST_MS = 1500
/** A threat due within this time makes the hand drop a swipe at something less urgent. */
export const URGENT_MS = 1200
export const COOLDOWN_MS: readonly [number, number] = [80, 200]
/** Swipe speed in canvas heights per second, and its duration clamp. */
export const SWIPE_SPEED_H = 2.2
/** Top speed of the hand, canvas heights per second (a fast swat, about 3 m/s at arm's length). */
export const MAX_HAND_SPEED_H = 4.5
export const SWIPE_MS: readonly [number, number] = [180, 800]
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
const CIRCLE_HZ = 4
const EDGE_INSET_PX = 8

// ─── Geometry helpers ────────────────────────────────────────────────────────

/** Lunger constants mirrored from movement.ts (hold distance in canvas heights, lunge speed multiplier). */
const LUNGER_HOLD_H = 0.185
const LUNGE_MULT = 2.5

/**
 * Estimated ms until the enemy costs a life if nobody swipes it (Infinity for anything that never does:
 * harmless enemies, flybys, skulls, the boss). Drops and scripted paths cost a life when their path time runs out.
 */
export function timeToThreatMs(e: Enemy, w: number, h: number): number {
  if (!isThreat(e)) return Infinity
  if (e.path) return Math.max(0, pathDurationMs(e.path, w, h) - e.pathMs)
  const pxPerMs = (e.speed * h) / 1000
  if (pxPerMs <= 0) return Infinity
  const dist = Math.hypot(e.targetX - e.x, e.targetY - e.y)
  if (e.type === 'lunger') {
    const lunge = (Math.min(dist, LUNGER_HOLD_H * h) - CENTER_THRESHOLD) / (pxPerMs * LUNGE_MULT)
    if (e.movePhase === 'lunge') return Math.max(0, (dist - CENTER_THRESHOLD) / (pxPerMs * LUNGE_MULT))
    if (e.movePhase === 'windup') return Math.max(0, e.phaseTimer) + lunge
    return Math.max(0, dist - LUNGER_HOLD_H * h) / pxPerMs + 600 + lunge
  }
  return Math.max(0, dist - CENTER_THRESHOLD) / pxPerMs
}

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
 * hand discs, so a step is safe when both discs stay at least `R + 2 motion px + travel` away
 * from every skull hitbox. `extraMs` widens the travel allowance (planning a whole swipe).
 */
export function stepSafe(
  from: Pt, to: Pt, R: number, skulls: readonly Enemy[], w: number, h: number, tickMs: number, extraMs = 0,
): boolean {
  // One motion pixel in display px; a sampled pixel may sit half a pixel outside the hitbox (rounding), the disc
  // edge is rasterised inside its true outline, so two pixels of slack cover both.
  const px = Math.max(w / MOTION_W, h / MOTION_H)
  for (const s of skulls) {
    const margin = R + 2 * px + skullTravelPx(s, h, tickMs + 16 + extraMs)
    if (distToRect(from, s.hitbox) < margin || distToRect(to, s.hitbox) < margin) return false
  }
  return true
}

function smoother(u: number): number { const c = Math.min(1, Math.max(0, u)); return c * c * c * (c * (6 * c - 15) + 10) }
/** Skulls that can be hit right now: hit detection runs while playing and on the summary screen only. */
function liveSkulls(view: DemoView): Enemy[] {
  return view.phase === 'playing' || view.phase === 'summary' ? view.enemies.filter((e) => e.type === 'skull') : []
}

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
  /** Staging glides taken to get round a skull. */
  detours: number
  /** Swipes dropped for a more urgent enemy. */
  interrupts: number
  /** Swipes (not deliberate misses) after which the target was still there, unharmed. */
  whiffs: number
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
  /** For glides: a staging move round a skull. */
  detour?: boolean
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
  readonly stats: DriverStats = { swipes: 0, misses: 0, presses: 0, blocked: 0, detours: 0, interrupts: 0, whiffs: 0, runs: 0 }
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
  private needHome = false
  private lastSwipe: { id: string; hits: number } | null = null
  private lastEnemies: readonly Enemy[] = []
  private restUntil = 0

  constructor(private seed: number, w = 1280, h = 720) {
    this.rng = mulberry32(seed)
    this.hand = { x: 0.5 * w, y: 0.7 * h }
  }

  /**
   * The title screen is back after a run (attract loop): drop everything, count the loop, and
   * lower the hand to its starting position so the next run starts from the same pose.
   */
  reset(): void {
    this.move = null
    this.holdMs = 0
    this.tracks.clear()
    this.avoidUntil.clear()
    this.missed.clear()
    this.cardShown = false
    this.runStarted = false
    this.press = 'idle'
    this.needHome = true
    this.stats.runs++
  }

  /** A run starts (the first phase after the title): same seed, same decisions as every other run. */
  private beginRun(): void {
    // Driver time restarts too: comparisons of float timestamps then round identically in every run.
    this.t = 0
    this.rng = mulberry32(this.seed)
    this.tracks.clear()
    this.avoidUntil.clear()
    this.missed.clear()
    this.idleSince = 0
    this.cardShown = false
    this.runStarted = true
  }

  private range(r: readonly [number, number]): number { return r[0] + this.rng() * (r[1] - r[0]) }

  update(deltaMs: number, view: DemoView): Pt {
    const dt = Math.max(0, deltaMs)
    this.t += dt
    this.lastTickMs = dt
    const R = handRadius(view.h)

    // Run boundaries first, so the run's random stream starts before anything is drawn from it.
    if (view.phase === 'start' && this.runStarted) this.reset()
    if (view.phase !== 'start' && !this.runStarted) this.beginRun()
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

    if (this.move && this.move.kind !== 'circle' && view.phase === 'playing') this.maybeInterrupt(view)
    if (!this.move) this.plan(view, R, dt)

    if (this.move) {
      const m = this.move
      m.t += dt
      const next = m.at(Math.min(m.t, m.dur))
      let to = { x: clamp(next.x, 0, view.w), y: clamp(next.y, 0, view.h) }
      // A hand has a top speed: a step longer than that is shortened and the move falls behind schedule.
      const maxStep = (MAX_HAND_SPEED_H * view.h * dt) / 1000
      const step = Math.hypot(to.x - this.hand.x, to.y - this.hand.y)
      if (step > maxStep) {
        const k = maxStep / step
        to = { x: this.hand.x + (to.x - this.hand.x) * k, y: this.hand.y + (to.y - this.hand.y) * k }
        m.t -= dt * (1 - k)
      }
      const skulls = liveSkulls(view)
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
    // Wind-up, lunge and recover are one attack: the reaction delay counts from the start of the wind-up.
    if (e.type === 'boss') return `${e.bossPhase}:${e.bossAttack === 'idle' ? 'idle' : 'attack'}`
    if (e.type === 'lunger') return e.movePhase === 'approach' ? 'approach' : 'attack'
    return ''
  }

  private hitsOf(id: string): number {
    const e = this.lastEnemies.find((x) => x.id === id)
    return e ? e.hitsReceived + e.bossHitsReceived : -1
  }

  private observe(view: DemoView): void {
    this.lastEnemies = view.enemies
    if (this.lastSwipe) {
      // The swipe's target is still here and took no hit: count a whiff (tuning statistic only).
      if (this.hitsOf(this.lastSwipe.id) === this.lastSwipe.hits) this.stats.whiffs++
      this.lastSwipe = null
    }
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
    const skulls = liveSkulls(view)
    const staged = this.stageLunger(view)
    if (staged) {
      this.idleSince = this.t
      const e = staged
      const cx = view.w / 2, cy = view.h / 2
      const len = Math.hypot(e.x - cx, e.y - cy) || 1
      const off = e.hitbox.w / 2 + R * 0.5
      const to = { x: clamp(e.x + ((e.x - cx) / len) * off, 0, view.w), y: clamp(e.y + ((e.y - cy) / len) * off, 0, view.h) }
      if (Math.hypot(to.x - this.hand.x, to.y - this.hand.y) > 50) {
        const mv = this.makeGlide(to, view.h, 250, 700)
        if (this.pathSafe(mv.at, mv.dur, R, skulls, view)) this.move = mv
      }
      return
    }
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

  /** How urgent an enemy is: lower is more urgent. Attacking lungers / bosses first, then threats near the centre. */
  private urgency(e: Enemy, view: DemoView): number {
    const attacking = (e.type === 'boss' && e.bossAttack !== 'idle') || (e.type === 'lunger' && e.movePhase !== 'approach')
    if (attacking) return -1
    if (timeToThreatMs(e, view.w, view.h) < URGENT_MS) return 0
    return 1
  }

  /**
   * A person changes their mind mid-swipe when something more urgent appears: a swipe at a non-urgent
   * target is dropped (the hand stops where it is) when an urgent enemy is ready to be swiped.
   */
  private maybeInterrupt(view: DemoView): void {
    const m = this.move!
    // A glide (pre-positioning, going home, a detour) gives way to any target that is ready, unless it is the
    // detour itself (it has no target and leads to a safe swipe; any target interrupts only when urgent).
    if (m.kind === 'glide' && !m.detour) {
      if (this.pickTarget(view)) { this.move = null; this.holdMs = 0 }
      return
    }
    const cur = view.enemies.find((e) => e.id === m.targetId)
    if (cur && this.urgency(cur, view) <= 0) return
    const next = this.pickTarget(view)
    if (!next || next.id === m.targetId || this.urgency(next, view) > 0) return
    this.move = null
    this.holdMs = 0
    this.stats.interrupts++
  }

  /** An approaching lunger about to wind up, when nothing else is more urgent: the hand pre-positions beside it. */
  private stageLunger(view: DemoView): Enemy | null {
    const cx = view.w / 2, cy = view.h / 2
    let best: Enemy | null = null
    let bestD = Infinity
    for (const e of view.enemies) {
      if (e.type !== 'lunger' || isHittable(e) || !this.onScreen(e, view.w, view.h)) continue
      const d = Math.hypot(e.x - cx, e.y - cy)
      if (d > LUNGER_STAGE_H * view.h || d >= bestD) continue
      best = e; bestD = d
    }
    if (!best) return null
    for (const e of view.enemies) {
      if (e.type === 'lunger' || !isHittable(e) || !this.onScreen(e, view.w, view.h)) continue
      if (timeToThreatMs(e, view.w, view.h) < THREAT_FIRST_MS) return null
    }
    return best
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
      // Attacks first; then threats by how soon they cost a life; then an idle boss; then harmless targets.
      const ttt = timeToThreatMs(e, view.w, view.h)
      const cls = attacking ? -1 : Number.isFinite(ttt) ? 0 : e.type === 'boss' ? 0.5 : 1
      const key: [number, number] = [cls, cls === 0 ? ttt : Math.hypot(e.x - cx, e.y - cy)]
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

    if (wantMiss) {
      const dm = { x: E.x - this.hand.x, y: E.y - this.hand.y }
      const lm = Math.hypot(dm.x, dm.y) || 1
      const side = this.rng() < 0.5 ? -1 : 1
      const off = half + R + 30
      E = { x: clamp(E.x - (dm.y / lm) * off * side, 0, view.w), y: clamp(E.y + (dm.x / lm) * off * side, 0, view.h) }
    }

    const sign0 = this.rng() < 0.5 ? -1 : 1
    const angle = (15 + this.rng() * 20) * Math.PI / 180

    // With a skull on screen the swipe may pass beside the enemy instead of through its centre: the hand disc
    // only has to overlap enough of the hitbox, and the skull rule keeps it away from the skull.
    const aims: Pt[] = [E]
    if (skulls.length > 0 && !wantMiss) {
      const reach = Math.min(half + 0.3 * R, 62)
      const ring: Pt[] = []
      for (const k of [0.5, 1]) for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        ring.push({ x: clamp(E.x + Math.cos(a) * reach * k, 0, view.w), y: clamp(E.y + Math.sin(a) * reach * k, 0, view.h) })
      }
      ring.sort((p, q) => Math.hypot(p.x - E.x, p.y - E.y) - Math.hypot(q.x - E.x, q.y - E.y))
      aims.push(...ring)
    }

    for (const A of aims) {
      const mv = this.buildSwipe(view, R, this.hand, A, [sign0, -sign0], angle, skulls)
      if (mv) {
        this.stats.swipes++
        if (wantMiss) { this.stats.misses++; this.missed.add(e.id) }
        return { ...mv, targetId: e.id, miss: wantMiss }
      }
    }
    // No safe way from here (the skull is in the way): go round it to a staging point from which the swipe is safe.
    if (skulls.length > 0 && !wantMiss) return this.planDetour(view, R, E, [sign0, -sign0], angle, skulls)
    return null
  }

  /** A straight, eased glide to a staging point from which a safe swipe through `E` exists; null if none. */
  private planDetour(view: DemoView, R: number, E: Pt, signs: readonly number[], angle: number, skulls: readonly Enemy[]): Move | null {
    const cands: Pt[] = []
    for (const radius of [200, 280]) for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const q = { x: E.x + Math.cos(a) * radius, y: E.y + Math.sin(a) * radius }
      if (q.x < 0 || q.x > view.w || q.y < 0 || q.y > view.h) continue
      cands.push(q)
    }
    cands.sort((p, q) => Math.hypot(p.x - this.hand.x, p.y - this.hand.y) - Math.hypot(q.x - this.hand.x, q.y - this.hand.y))
    const p0 = this.hand
    for (const W of cands) {
      const dist = Math.hypot(W.x - p0.x, W.y - p0.y)
      const dur = clamp(dist / (1.2 * view.h / 1000), 300, 900)
      const at = (t: number): Pt => { const k = smoother(t / dur); return { x: p0.x + (W.x - p0.x) * k, y: p0.y + (W.y - p0.y) * k } }
      if (!this.pathSafe(at, dur, R, skulls, view)) continue
      if (!this.buildSwipe(view, R, W, E, signs, angle, skulls)) continue
      this.stats.detours++
      return { kind: 'glide', at, dur, t: 0, detour: true }
    }
    return null
  }

  /** A curved swipe from the hand through `E` and past it; the first bend direction that passes the skull rule. */
  private buildSwipe(view: DemoView, R: number, p0: Pt, E: Pt, signs: readonly number[], angle: number, skulls: readonly Enemy[]): Move | null {
    let d = { x: E.x - p0.x, y: E.y - p0.y }
    const len = Math.hypot(d.x, d.y)
    if (len < 1) d = { x: 0, y: -1 } // already on the target: swipe upwards
    else d = { x: d.x / len, y: d.y / len }
    for (const sign of signs) {
      const a = angle * sign
      const dir = { x: d.x * Math.cos(a) - d.y * Math.sin(a), y: d.x * Math.sin(a) + d.y * Math.cos(a) }
      const over = R + 70
      const p2 = { x: clamp(E.x + dir.x * over, 0, view.w), y: clamp(E.y + dir.y * over, 0, view.h) }
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
      if (this.pathSafe(at, dur, R, skulls, view, p0)) return { kind: 'swipe', at, dur, t: 0 }
    }
    return null
  }

  /** Samples a planned path and applies the skull rule, widened by how far the skull can travel by each sample. */
  private pathSafe(at: (t: number) => Pt, dur: number, R: number, skulls: readonly Enemy[], view: DemoView, from: Pt = this.hand): boolean {
    if (skulls.length === 0) return true
    let prev = from
    for (let i = 1; i <= 16; i++) {
      const t = (dur * i) / 16
      const p = at(t)
      // The skull may travel towards the hand for as long as the move has been running at that sample.
      if (!stepSafe(prev, p, R, skulls, view.w, view.h, this.lastTickMs, t)) return false
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
    if (m.kind === 'swipe' && !m.miss && m.targetId && this.hitsOf(m.targetId) >= 0) this.lastSwipe = { id: m.targetId, hits: this.hitsOf(m.targetId) }
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
    // Back at the title after a loop: lower the hand to its starting pose first.
    if (this.needHome) {
      this.needHome = false
      const home = { x: 0.5 * view.w, y: 0.7 * view.h }
      if (Math.hypot(home.x - this.hand.x, home.y - this.hand.y) > 3) { this.move = this.makeGlide(home, view.h, 500, 1200); return }
    }
    if (since < Math.max(target.lockMs + BUTTON_SETTLE_MS, target.delayMs)) return
    if (this.t < this.restUntil) return

    const rho = Math.max(14, 0.55 * spec.r)
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
