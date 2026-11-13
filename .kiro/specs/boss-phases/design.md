# Boss Phases — Design

## State additions

`GamePhase` gains `'victory'`:

```ts
type GamePhase = 'start' | 'stageTitle' | 'playing' | 'summary' | 'gameover' | 'victory'
```

`Enemy` gains boss-only fields (defaults in `makeEnemy`):

```ts
type BossAttack = 'idle' | 'windup' | 'lunge' | 'recover'

interface Enemy {
  // ... existing ...
  bossPhase: 1 | 2 | 3
  bossAttack: BossAttack
  bossTimerMs: number     // idle countdown / windup / recover remaining
  summonTimerMs: number   // ms until next summon (decrements in every state; a summon is only performed while idle at hover)
  bossInvulnMs: number    // post-hit i-frames (R5.1)
  bossStrike: boolean     // set the tick a lunge lands; consumed by tickBoss
}
```

The phase is *stored* but is always equal to `bossPhaseFor(received, needed)`;
tests assert this.

## Module: `src/game/enemies/bossPhases.ts` (pure)

```ts
export const PHASE2_BELOW = 0.66
export const PHASE3_BELOW = 0.33
export const HIT_COOLDOWN_MS = 400
export const STRIKE_RADIUS = 40

export interface PhaseParams {
  idleMs: number; windupMs: number; recoverMs: number
  lungeSpeed: number      // canvas heights / s
  swayRate: number        // rad / s
  summonEveryMs: number; summonCount: number; maxMinions: number
  attacks: boolean
}
export const PHASE_PARAMS: Record<1 | 2 | 3, PhaseParams>

export function bossPhaseFor(received, needed): 1 | 2 | 3
export function isBossVulnerable(boss): boolean
export function onBossHit(boss): { boss: Enemy; defeated: boolean; phaseChanged: boolean }
export function moveBoss(boss, deltaMs, W, H): Enemy
export function tickBoss(state, W, H): GameState
export function createMinion(boss, W, H): Enemy
```

All balance numbers live in `PHASE_PARAMS`:

| | idle | wind-up | lunge | recover | summon |
|---|---|---|---|---|---|
| Phase 1 | – | – | – | – | 1 / 5 s, cap 3 |
| Phase 2 | 3 s | 600 ms | 1.0 H/s | 1.2 s | 1 / 6 s, cap 3 |
| Phase 3 | 1.5 s | 350 ms | 1.5 H/s | 0.7 s | 2 / 3.5 s, cap 5 |

### State machine

```
            idle ──(idleMs elapsed, at hover, phase ≥ 2)──► windup
  ▲           ▲                                               │ windupMs
  │           │ recoverMs                                     ▼
  │        recover ◄──(lands within STRIKE_RADIUS: bossStrike)─ lunge
  │           ▲                                               │
  │           └──────────(hit during windup/lunge: stagger)───┘
  └── phase change (hit): back to idle, idle timer reset, summon queued
```

Vulnerability: phase 1 always; phases 2–3 only in `windup | lunge | recover`;
never while `bossInvulnMs > 0`.

### Movement (`moveBoss`)

- All timers decrement by `deltaMs`; movement is steering with
  `step = min(dist, speed × H × dt)` so it is frame-rate independent and never overshoots.
- `idle` and `recover`-end: steer to `(W/2 + sin(sineOffset) × 0.3W, hoverY)` at
  0.6 H/s, `sineOffset += swayRate × dt`. `hoverY = max(0.2H, 0.75 × BOSS_SIZE)`.
  The first descent from `y = -BOSS_SIZE` is the same steering (fast enough, ~0.6 H/s).
- `windup`: stationary; render adds shake and glow.
- `lunge`: steer straight to the canvas centre (`targetX/Y`) at `lungeSpeed`; on reaching
  `STRIKE_RADIUS` set `bossStrike = true`, attack → `recover`, timer = `recoverMs`.
- `recover`: stationary until the timer ends, then `idle` (which steers home); the
  vulnerable window ends the moment recover ends.
- Idle→windup only when the boss is within a few px of its hover height, so the
  telegraph always starts from the top.

### State-level work (`tickBoss`)

Called from the loop after `moveEnemies`, only while `phase === 'playing'`:
1. If the boss has `bossStrike`: clear it, `decrementLife`, `resetCombo`, `setShake`.
   (The loop compares lives before/after to play `sfxLifeLost`.)
2. If `attack === 'idle'`, the boss is at its hover line (`atHover`) and `summonTimerMs ≤ 0`: add
   `min(summonCount, maxMinions − aliveGhosts)` minions, reset the timer to
   `summonEveryMs` (even if none were added, to avoid retry spam). A summon due while the boss is
   flying home stays queued (timer ≤ 0) until it reaches the hover line.

The summon timer decrements by `deltaMs` in `moveBoss` for every attack state; on a summon the new
interval carries up to 100 ms of overshoot. Timer overshoot is carried across idle → windup and recover → idle (`windupMs + remainder`).
The lunge aims at the live canvas centre (`canvasW/2, canvasH/2`), not the spawn-time target.

`createMinion` is a ghost (`GHOST_SPEED × 0.9`) spawned at the boss position ±60 px,
aimed at the canvas centre.

### Hit handling

`resolveHits` (collision.ts):

1. `isHittable(enemy)` (new `enemies/vulnerability.ts`) is checked **before** the
   frame-diff gate: lunger → `movePhase !== 'approach'`; boss → `isBossVulnerable`;
   everything else → true. Not hittable → `hitCount: 0`, enemy kept.
2. Boss hit → `onBossHit`. Not defeated: replace the boss, `sfxBossHit`. If the
   phase changed: `setShake`. Defeated: recorded as pending and applied after the loop (unless the frame ended in game over, which leaves the boss alive and unscored): score 1000 × combo, particles, flash, shake,
   `sfxBossDefeated`, **then end the stage** (applied after all hits of the frame resolve; losing the last life on that frame stays game over):
   `phase = stage >= STAGES.length ? 'victory' : 'summary'`, `enemies = []`.

### Timeout

`tickTimer` (state.ts): when time reaches 0 in `playing`, phase is `gameover`
if a boss is alive, else `summary`. `resolveHits` runs before `tickTimer` in the
loop, so a simultaneous defeat wins (R6.6).

### Final stage / victory

- `advanceToNextStage` from stage `STAGES.length` returns `{...state, phase: 'victory'}`
  instead of wrapping to 1.
- `tickRound` case `victory`: `saveHighScore`.
- `renderVictory` (screens.ts): dim backdrop, gold wobbling "YOU WIN!", total score,
  best, two `MotionButton`s ("PLAY AGAIN", "MAIN MENU") — same pattern as game over.
- Loop: new `victory` branch; on first entering the branch (any route) `resetVictoryScreen`, clear sound and `stopMusic` run. Play Again →
  `startGame(createInitialState(1))`; Main Menu → `createInitialState(1)`.

### Stage config

Stage 5 `enemyMix.ghost` becomes `false` — the boss summons its own ghosts (R2.4).

### Rendering (`render.ts`, procedural only)

- `drawBoss(ctx, enemy, now)`: existing ghost + witch hat.
  - **windup**: translate by `sin(now/20)·4` px shake, orange `shadowColor` with big pulsing
    blur, expanding orange ring, "!" above the hat.
  - **shielded** (phase ≥ 2, idle): translucent purple bubble ring, body alpha 0.7.
  - **phase 3**: aura colour `#c0392b` instead of `#7b2fbe`, faster glow pulse.
- `drawBossHealthBar`: tick marks at 66 % / 33 % of the bar width and label
  `PHASE n` / `ENRAGED`.
- `drawLunger`: `globalAlpha = 0.55` while `approach`.
- No new assets.

### Hooks into existing flow

- `createBoss` initialises the new fields (phase 1, idle, `summonTimerMs` 3000).
- `moveSingle` delegates `type === 'boss'` to `moveBoss`.
- `loop.ts` calls `tickBoss` after movement and the centre-check; the centre-check
  already ignores bosses.
- Audio: reuses `sfxBossHit`, `sfxBossDefeated`, `sfxLifeLost`; no new sounds.

## Tests

| File | Covers |
|---|---|
| `enemies/bossPhases.test.ts` | thresholds, each transition (1→2, 2→3, skip-free), schedule of attack cycle, windup 600 / 350 ms, stagger, strike costs one life once, summons + caps, i-frames, vulnerability windows |
| `enemies/bossPhases.property.test.ts` | phase monotone and equals `bossPhaseFor`; frame-rate independence of timers; boss stays in bounds |
| `collision.test.ts` | shielded boss ignores hits; lunger approach ignores hits; defeat → `summary` / `victory`, minions cleared |
| `state.test.ts` | timeout with boss → `gameover`; without boss → `summary` |
| `round.test.ts` | final stage → `victory`, never stage 1; victory saves high score |
| `ui/screens` | (canvas, not unit-tested) |
