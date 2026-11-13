# Feel Fix — Design (P1)

## Root-cause analysis

### Movement
`moveSingle` adds `enemy.speed` (px) once per call, and the loop calls it once
per `requestAnimationFrame`. On a 120 Hz display enemies move twice as far per
second. The wobble phase (`+0.06` / `+0.12` per call) has the same flaw. The
speeds are absolute pixels (ghost 1.2 px × 60 = 72 px/s), so a ghost needs
~13 s to cover the ~960 px from the edge of a 1080p screen to the centre, and
a small canvas feels much faster than a large one.

### Skull
The skull heads for the centre and parks at `dist < 0.5`. Nothing removes it,
and `tickSpawners` refuses to spawn another while any skull exists.

### Combo
`incrementCombo` does `combo + 1`, so the multiplier grows without limit,
contradicting stages R4.1.

## Movement

`Enemy.speed` becomes **canvas heights per second**.

```ts
const REF_H = 1080
step = enemy.speed * canvasH * deltaMs / 1000      // px, along the unit vector
```

Wobble / zigzag: phase rate in rad/s (`3.6` and `7.2`, = old per-frame value
× 60). Lateral *velocity* is `sin(phase) × AMP × canvasH` (`AMP` ghost `0.06`,
bat `0.16` heights/s — old `amp × rate × 60 / 1080`). The sine is sampled at
the midpoint of the step so the integral matches across step sizes. The
forward step is clamped to the remaining distance.

New signature: `moveEnemies(enemies, deltaMs, canvasW, canvasH)`; the loop
passes `displayW/H`.

### Base speeds (heights/s, before stage multiplier)

| Enemy | Old px/frame | New |
|---|---|---|
| ghost | 1.2 | 0.222 |
| bat | 2.0 | 0.37 |
| skull | 0.8 | 0.148 |
| lunger | 1.0 | 0.185 |
| pumpkin | 0.9 | 0.167 |
| boss | 0.5 | 0.0925 |

Ghost stage 1: `0.222 × 0.8 × 1080 = 192 px/s`; from the edge spawn (40 px
outside) to the 40 px centre ring ≈ 960 px → ≈ 5.0 s. Stage 4 (×1.4): ≈ 3.6 s.

Lunger: `LUNGER_HOLD_DIST = 0.185 × canvasH` (was 200 px at ~1080).

## Skull lifecycle

New `Enemy` fields (defaults in `makeEnemy`):

```ts
onScreenMs: number   // time the centre has been inside the canvas
exiting: boolean     // skull is leaving
```

In `moveSingle` for a skull: if not exiting and its centre is within
`[0,W]×[0,H]`, `onScreenMs += deltaMs`. When `onScreenMs >= SKULL_ON_SCREEN_MS
(4000)`, set `exiting = true` and retarget to `pos + dir × (W + H)` where
`dir` is the unit vector from the canvas centre (up if exactly at centre);
speed is multiplied by `SKULL_EXIT_SPEED_MULT (1.5)`. Exit uses the same
straight-line movement.

`cullExitedEnemies(enemies, W, H)` (in `movement.ts`) drops exiting skulls
whose hitbox is fully outside the canvas; the loop calls it after
`moveEnemies`.

`tickSpawners`: `skullActive = enemies.some(e => e.type === 'skull' && !e.exiting)`.
Assumption: the one-skull-at-a-time cap is kept for non-leaving skulls; only
the *permanent* block is removed.

## Combo

```ts
export const COMBO_TIERS = [{ streak: 10, mult: 4 }, { streak: 6, mult: 3 }, { streak: 3, mult: 2 }]
export function comboForStreak(streak: number): number
```

`GameState` gains `streak`. `incrementCombo` → `streak+1`, `combo =
comboForStreak(streak)`, `bestCombo = max`. `resetCombo` → `streak 0`,
`combo 1`. `resolveHits` already scores with `s.combo` before incrementing,
which satisfies R3.3. `shakeIfStrong` compares `streak` to
`SHAKE_COMBO_THRESHOLD` (3), i.e. fires from the hit that earns x2 (previously
`combo ≥ 3` = the third hit's result; behaviour on a fresh streak is the same).
The HUD already keys off `combo`, so its pulse now fires on tier-ups only.

## File change summary

| File | Change |
|---|---|
| `src/game/enemies/movement.ts` | px/s, canvas-relative, time-based wobble, skull exit, `cullExitedEnemies` |
| `src/game/enemies/{ghost,bat,skull,lunger,pumpkin,boss}.ts` | new speed constants |
| `src/game/enemies/spawn.ts` | exiting skulls do not block spawns |
| `src/game/state.ts` | `streak`, `onScreenMs`, `exiting`, `comboForStreak`, reducers |
| `src/game/collision.ts` | shake keyed on streak |
| `src/game/loop.ts` | pass canvas size, cull exited skulls |
| `src/game/*.test.ts`, `enemies/enemies.test.ts` | updated + new tests |
| `src/game/enemies/movement.test.ts` | new: frame-rate independence, scaling, skull |
