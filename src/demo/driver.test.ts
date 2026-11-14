import { describe, it, expect } from 'vitest'
import { DemoDriver, handRadius, stepSafe, distToRect, REACT_MS, BURST_MS, OFFER_BURSTS_MAX, CARD_HOLD_MS, MAX_HAND_SPEED_H } from './driver'
import type { DemoView } from './driver'
import { makeEnemy } from '../game/state'
import type { Enemy } from '../game/state'
import { buttonLayout } from '../ui/layout'
import type { Pt } from './camera'
import { ENTRY_LOCK_MS } from '../ui/motionButton'

const W = 1280, H = 720
const DT = 1000 / 30

function ghost(id: string, x: number, y: number, over: Partial<Enemy> = {}): Enemy {
  return makeEnemy({ id, type: 'ghost', x, y, targetX: W / 2, targetY: H / 2, speed: 0.1, hitbox: { x: x - 40, y: y - 40, w: 80, h: 80 }, ...over })
}
function skull(id: string, x: number, y: number): Enemy {
  return makeEnemy({ id, type: 'skull', x, y, targetX: W / 2, targetY: H / 2, speed: 0.148, hitbox: { x: x - 28, y: y - 28, w: 56, h: 56 } })
}
function view(over: Partial<DemoView> = {}): DemoView {
  return { phase: 'playing', stage: 1, bonus: false, enemies: [], w: W, h: H, now: 100000, cardOpen: false, hasPhoto: true, noPhoto: false, ...over }
}
/** Runs `n` ticks of DT with a fixed view factory; returns the hand path. */
function run(d: DemoDriver, n: number, v: (i: number) => DemoView): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < n; i++) { const p = d.update(DT, v(i)); out.push({ x: p.x, y: p.y }) }
  return out
}
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

describe('determinism (demo-mode R4.1)', () => {
  const enemies = [ghost('a', 900, 200), ghost('b', 300, 250), ghost('c', 700, 500)]
  const v = () => view({ enemies })
  it('same seed and inputs give identical hand positions', () => {
    expect(run(new DemoDriver(7), 120, v)).toEqual(run(new DemoDriver(7), 120, v))
  })
  it('a different seed gives a different run', () => {
    expect(run(new DemoDriver(7), 120, v)).not.toEqual(run(new DemoDriver(8), 120, v))
  })
})

describe('aiming (R4.2, R4.3)', () => {
  it('rests until the reaction delay has passed, then swipes', () => {
    const d = new DemoDriver(3)
    const e = [ghost('a', 640, 300)]
    const start = { ...d.hand }
    let firstMove = -1
    for (let i = 0; i < 40; i++) {
      d.update(DT, view({ enemies: e }))
      if (firstMove < 0 && d.mode === 'swipe') firstMove = i * DT
    }
    expect(firstMove).toBeGreaterThanOrEqual(REACT_MS[0] - DT)
    expect(firstMove).toBeLessThanOrEqual(REACT_MS[1] + 3 * DT)
    expect(dist(start, d.hand)).toBeGreaterThan(10)
  })

  it('does not aim at an enemy that is off screen or still inside the spawn age', () => {
    const d = new DemoDriver(3)
    const off = ghost('a', -200, 300)
    const young = ghost('b', 640, 300, { spawnedAt: 100000 - 20 })
    run(d, 30, () => view({ enemies: [off], now: 100000 }))
    expect(d.mode).toBe('hold')
    const d2 = new DemoDriver(3)
    d2.update(DT, view({ enemies: [young] }))
    expect(d2.mode).toBe('hold')
  })

  it('a swipe passes through the enemy along a curve and overshoots it', () => {
    const d = new DemoDriver(11)
    const e = [ghost('a', 640, 300)] // close to the centre: never a deliberate miss
    const path = run(d, 60, () => view({ enemies: e }))
    const first = path.findIndex((p, i) => i > 0 && dist(p, path[i - 1]) > 0.5)
    let last = first
    while (last + 1 < path.length && dist(path[last + 1], path[last]) > 0.5) last++
    const swipe = path.slice(first - 1, last + 1)
    const nearest = Math.min(...swipe.map((p) => dist(p, { x: 640, y: 300 })))
    expect(nearest).toBeLessThan(30)
    const a = swipe[0], b = swipe[swipe.length - 1]
    const dev = Math.max(...swipe.map((p) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / Math.max(1, dist(a, b))))
    expect(dev).toBeGreaterThan(5) // curved, not a ruler line
    expect(dist(b, { x: 640, y: 300 })).toBeGreaterThan(60) // overshoot
  })

  it('never teleports: no step is faster than the hand top speed', () => {
    const d = new DemoDriver(5)
    const path = run(d, 200, () => view({ enemies: [ghost('a', 900, 200), ghost('b', 200, 500)] }))
    for (let i = 1; i < path.length; i++) expect(dist(path[i], path[i - 1])).toBeLessThanOrEqual((MAX_HAND_SPEED_H * H * DT) / 1000 + 1e-6)
  })

  it('a resting hand does not move at all', () => {
    const d = new DemoDriver(5)
    const path = run(d, 20, () => view({ enemies: [] }))
    for (const p of path) expect(p).toEqual(d.hand)
  })

  it('ignores a shielded boss and an approaching lunger', () => {
    const d = new DemoDriver(5)
    const boss = makeEnemy({ id: 'b', type: 'boss', x: 640, y: 150, targetX: 640, targetY: 360, speed: 0.1, hitbox: { x: 544, y: 54, w: 192, h: 192 }, bossPhase: 2, bossAttack: 'idle', hitsNeeded: 10 })
    const lunger = makeEnemy({ id: 'l', type: 'lunger', x: 300, y: 300, targetX: 640, targetY: 360, speed: 0.1, hitbox: { x: 264, y: 264, w: 72, h: 72 }, movePhase: 'approach' })
    run(d, 40, () => view({ enemies: [boss, lunger], stage: 5 }))
    expect(d.stats.swipes).toBe(0)
  })

  it('reacts to a boss wind-up only after the telegraph has shown (phase 2: ≥ 300 ms)', () => {
    const d = new DemoDriver(5)
    const base = { id: 'b', type: 'boss' as const, x: 640, y: 150, targetX: 640, targetY: 360, speed: 0.1, hitbox: { x: 544, y: 54, w: 192, h: 192 }, bossPhase: 2 as const, hitsNeeded: 10 }
    run(d, 30, () => view({ enemies: [makeEnemy({ ...base, bossAttack: 'idle' })], stage: 5 }))
    expect(d.stats.swipes).toBe(0)
    let t = 0
    let reacted = -1
    for (let i = 0; i < 30 && reacted < 0; i++) {
      d.update(DT, view({ enemies: [makeEnemy({ ...base, bossAttack: 'windup' })], stage: 5 }))
      t += DT
      if (d.stats.swipes > 0) reacted = t
    }
    expect(reacted).toBeGreaterThanOrEqual(300 - DT)
    expect(reacted).toBeLessThanOrEqual(400 + 2 * DT)
  })
})

describe('deliberate misses (R4.4)', () => {
  it('some swipes at distant low-urgency enemies miss, and the retry at the same enemy hits', () => {
    let misses = 0
    let missedThenHit = 0
    for (let seed = 1; seed <= 30; seed++) {
      const d = new DemoDriver(seed)
      const e = ghost('a', 1100, 120)
      let prevSwipes = 0, prevMisses = 0
      let sawMiss = false
      for (let i = 0; i < 150; i++) {
        d.update(DT, view({ enemies: [e] }))
        if (d.stats.swipes > prevSwipes) {
          if (d.stats.misses > prevMisses) sawMiss = true
          else if (sawMiss) { missedThenHit++; sawMiss = false }
          prevSwipes = d.stats.swipes; prevMisses = d.stats.misses
        }
      }
      misses += d.stats.misses
    }
    expect(misses).toBeGreaterThan(0)
    expect(missedThenHit).toBeGreaterThan(0)
  })

  it('never misses on purpose near the centre', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const d = new DemoDriver(seed)
      run(d, 100, () => view({ enemies: [ghost('a', 640, 330)] }))
      expect(d.stats.misses).toBe(0)
    }
  })
})

describe('never the skull (R4.5)', () => {
  it('a skull next to the only target blocks the swipe: the hand never enters the margin', () => {
    const d = new DemoDriver(2)
    const R = handRadius(H)
    const sk = skull('s', 650, 330)
    const e = [ghost('g', 700, 330), sk]
    let from = { ...d.hand }
    for (let i = 0; i < 200; i++) {
      const to = d.update(DT, view({ enemies: e }))
      if (to.x !== from.x || to.y !== from.y) expect(stepSafe(from, to, R, [sk], W, H, DT)).toBe(true)
      from = { ...to }
    }
  })

  it('a skull that drifts onto the resting hand freezes it (a still hand cannot hit)', () => {
    const d = new DemoDriver(2)
    const g = ghost('g', 200, 200)
    run(d, 3, () => view({ enemies: [g] }))
    const sk = skull('s', d.hand.x + 5, d.hand.y)
    const before = { ...d.hand }
    const path = run(d, 40, () => view({ enemies: [g, sk] }))
    for (const p of path) expect(p).toEqual(before)
  })

  it('never selects a skull as a target', () => {
    const d = new DemoDriver(2)
    run(d, 100, () => view({ enemies: [skull('s', 640, 330)] }))
    expect(d.stats.swipes).toBe(0)
  })

  it('distToRect and stepSafe basics', () => {
    expect(distToRect({ x: 0, y: 0 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(10)
    expect(distToRect({ x: 15, y: 5 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(0)
    const sk = skull('s', 640, 360)
    expect(stepSafe({ x: 100, y: 100 }, { x: 140, y: 100 }, 40, [sk], W, H, 16)).toBe(true)
    expect(stepSafe({ x: 100, y: 100 }, { x: 600, y: 360 }, 40, [sk], W, H, 16)).toBe(false)
  })
})

describe('buttons (R4.7)', () => {
  const spec = (screen: Parameters<typeof buttonLayout>[0], id: string) => {
    const b = buttonLayout(screen, W, H, { hasPhoto: true, noPhoto: false }).find((x) => x.id === id)!
    return { x: b.cx, y: b.cy, r: b.r }
  }

  it('waits out the entry lockout, then circles over 1 PLAYER on the title screen', () => {
    const d = new DemoDriver(1)
    const b = spec('start', 'one')
    const v = () => view({ phase: 'start' })
    let enteredAt = -1
    for (let i = 0; i < 90; i++) {
      d.update(DT, v())
      if (enteredAt < 0 && dist(d.hand, b) < b.r) enteredAt = i * DT
    }
    expect(enteredAt).toBeGreaterThanOrEqual(ENTRY_LOCK_MS) // never inside the circle before it is live
    expect(d.stats.presses).toBeGreaterThanOrEqual(1)
  })

  it('moves continuously while over the button (a still hand does not press)', () => {
    const d = new DemoDriver(1)
    const b = spec('start', 'one')
    let inside: Pt[] = []
    for (let i = 0; i < 160; i++) {
      const p = d.update(DT, view({ phase: 'start' }))
      if (d.mode === 'circle') inside.push({ ...p })
    }
    expect(inside.length).toBeGreaterThan(20)
    let still = 0
    for (let i = 1; i < inside.length; i++) if (dist(inside[i], inside[i - 1]) < 1) still++
    expect(still).toBe(0)
    for (const p of inside) expect(dist(p, b)).toBeLessThan(b.r)
    inside = []
  })

  it('leaves the circle and tries again when the button did not fire', () => {
    const d = new DemoDriver(1)
    const b = spec('start', 'one')
    const states: boolean[] = []
    for (let i = 0; i < 300; i++) {
      d.update(DT, view({ phase: 'start' }))
      states.push(dist(d.hand, b) < b.r)
    }
    const entries = states.filter((s, i) => s && !states[i - 1]).length
    expect(entries).toBeGreaterThanOrEqual(2)
    expect(d.stats.presses).toBeGreaterThanOrEqual(2)
  })

  it('victory script: card button, preview hold, CLOSE, then MAIN MENU; never SAVE', () => {
    const d = new DemoDriver(1)
    const save = spec('preview', 'save')
    let phase: DemoView['phase'] = 'victory'
    let cardOpen = false
    const at = (id: string, screen: Parameters<typeof buttonLayout>[0]) => dist(d.hand, spec(screen, id)) < spec(screen, id).r
    let step = 0
    const log: string[] = []
    for (let i = 0; i < 1500 && phase !== 'start'; i++) {
      d.update(DT, view({ phase, cardOpen }))
      if (!cardOpen && step === 0 && at('offer', 'victory')) { cardOpen = true; step = 1; log.push('offer') }
      else if (cardOpen && step === 1) {
        if (at('close', 'preview')) { cardOpen = false; step = 2; log.push('close') }
      } else if (!cardOpen && step === 2 && at('menu', 'victory')) { phase = 'start'; log.push('menu') }
      if (cardOpen) expect(dist(d.hand, save)).toBeGreaterThan(save.r) // SAVE is never approached
    }
    expect(log).toEqual(['offer', 'close', 'menu'])
    expect(d.stats.runs).toBe(0)
    d.update(DT, view({ phase: 'start' }))
    expect(d.stats.runs).toBe(1)
  })

  it('gives up on EXORCIST CARD after OFFER_BURSTS_MAX bursts and goes to MAIN MENU (the card never opens)', () => {
    const d = new DemoDriver(1)
    const menu = spec('victory', 'menu')
    let atMenu = false
    for (let i = 0; i < 6000 && !atMenu; i++) {
      d.update(DT, view({ phase: 'victory', cardOpen: false }))
      if (dist(d.hand, menu) < menu.r) atMenu = true
    }
    expect(atMenu).toBe(true)
    expect(d.stats.presses).toBe(OFFER_BURSTS_MAX) // three bursts at the card button, then on to MAIN MENU
  })

  it('holds the card preview for CARD_HOLD_MS before pressing CLOSE', () => {
    const d = new DemoDriver(1)
    const close = spec('preview', 'close')
    d.update(DT, view({ phase: 'victory', cardOpen: false }))
    let t = 0
    let closed = -1
    for (let i = 0; i < 600 && closed < 0; i++) {
      d.update(DT, view({ phase: 'victory', cardOpen: true }))
      t += DT
      if (dist(d.hand, close) < close.r) closed = t
    }
    expect(closed).toBeGreaterThanOrEqual(CARD_HOLD_MS - DT)
  })

  it('presses RETRY on game over and NEXT on the summary', () => {
    for (const [phase, screen, id] of [['gameover', 'gameover', 'retry'], ['summary', 'summary', 'next']] as const) {
      const d = new DemoDriver(1)
      let reached = false
      for (let i = 0; i < 400; i++) {
        d.update(DT, view({ phase }))
        if (dist(d.hand, spec(screen, id)) < spec(screen, id).r) reached = true
      }
      expect(reached).toBe(true)
    }
  })

  it('stays put on the stage title card', () => {
    const d = new DemoDriver(1)
    const start = { ...d.hand }
    run(d, 60, () => view({ phase: 'stageTitle' }))
    expect(d.hand).toEqual(start)
  })

  it('a burst lasts the normal dwell: at least BURST_MS ≥ the 650 ms dwell', () => {
    expect(BURST_MS).toBeGreaterThan(650 * 2)
  })
})

describe('attract loop (R4.8)', () => {
  /** Demo ms from the enemy's first appearance to the first swipe. */
  function reactionOf(d: DemoDriver, id: string): number {
    let t = 0
    for (let i = 0; i < 60; i++) {
      d.update(DT, view({ enemies: [ghost(id, 640, 330)] }))
      t += DT
      if (d.mode === 'swipe') return t
    }
    return -1
  }

  it('the title screen after a started run re-seeds the driver: the same decisions are made again', () => {
    const d = new DemoDriver(9)
    const first = reactionOf(d, 'a')
    expect(first).toBeGreaterThan(0)
    for (let i = 0; i < 90; i++) d.update(DT, view({ enemies: [] })) // finish the swipe, rest
    d.update(DT, view({ phase: 'start' }))
    expect(d.stats.runs).toBe(1)
    d.update(DT, view({ phase: 'stageTitle' }))
    d.update(DT, view({ phase: 'playing' }))
    expect(reactionOf(d, 'z')).toBe(first)
  })

  it('a run that never started does not count as a loop', () => {
    const d = new DemoDriver(9)
    d.update(DT, view({ phase: 'start' }))
    d.update(DT, view({ phase: 'start' }))
    expect(d.stats.runs).toBe(0)
  })
})
