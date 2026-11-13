# Waves — Design (P1)

## Files

| File | Role |
|---|---|
| `src/game/paths.ts` (new, pure) | `PathSpec`, `pathPosition`, `pathDurationMs`, `pathExits`, `makePath`, `makeSwarm` |
| `src/game/waves.ts` (new, data + pure helpers) | `WaveScript`, `STAGE_SCRIPTS`, `BONUS_ROUND`, `intensityAt`, `spawnRateFor`, `speedFactorFor`, `pickPath` |
| `src/game/stages.ts` | `StageConfig.waves?: WaveScript`, `StageConfig.bonusAfter?: BonusRound`, `stageLabel(state)` |
| `src/game/enemies/waveSpawn.ts` (new) | `spawnWave(kind, path, count, opts)` builds `Enemy[]` with a path; `createCandy` in `candy.ts` |
| `src/game/enemies/reach.ts` (new) | `isThreat`, `splitReached` (the "reached its target" rule moved out of `loop.ts`) |
| `src/game/enemies/spawn.ts` | intensity-scaled timers, path choice, scripted events, bonus branch |
| `src/game/enemies/movement.ts` | path enemies move by `pathPosition`; `cullExitedEnemies` culls finished paths; `hitboxFor('candy')` |
| `src/game/state.ts` | `Enemy.path`, `pathMs`, `harmless`; `EnemyType` `'candy'`; `GameState.waveIndex`, `bonus` |
| `src/game/round.ts` | bonus entry in `advanceToNextStage`; timers/duration from the bonus config |
| `src/game/collision.ts` | candy branch in `resolveHits` |
| `src/game/render.ts`, `src/ui/hud.ts`, `src/ui/screens.ts`, `src/game/loop.ts` | candy art, bonus labels, `splitReached` |

## Path model

```ts
type PathKind = 'line' | 'arc' | 'flyby' | 'drop'
type WavePath = PathKind | 'swarm'

interface PathSpec {
  kind: PathKind
  x0: number; y0: number; x1: number; y1: number   // fractions of canvas W / H (may be < 0 or > 1)
  bend: number        // arc bulge, canvas heights (signed; chosen to bulge toward the centre)
  wobble: number      // lateral sway amplitude, canvas heights
  wobbleRate: number  // rad / s
  phase: number
  speed: number       // mean speed along the chord, canvas heights / s
}
```

Position is closed-form in `ageMs` (no per-tick integration, so it cannot depend
on the tick size):

```
L   = hypot((x1-x0)·W, (y1-y0)·H)
s   = clamp(ageMs/1000 · speed·H / L, 0, 1)
e   = kind === 'drop' ? 1-(1-s)² : s
pos = lerp(p0, p1, e) + n · H · (bend·sin(πs) + wobble·sin(phase + rate·ageSec)·sin(πs))
```

`n` is the unit normal of the chord. The `sin(πs)` envelope keeps the endpoints
exact (landing point, off-screen exit). `pathDurationMs = L / (speed·H) · 1000`.
`pathExits(p)` is true when the end point is outside the canvas.

Off-screen margin: `marginPx(H) = max(0.12·H, 64)`; start/exit points sit one
margin beyond the edge (stored as fractions computed from W and H at spawn).
Arcs choose the bend sign whose midpoint is closer to the canvas centre, so
bulges never leave the extended box.

Generators (all take an injectable `rand` for tests):

- `line` / `arc`: start on an allowed edge (`leftRight` → left/right only),
  end in x 0.2–0.8, y 0.25–0.75; arc bend 0.08–0.18 H.
- `flyby`: y0 and y1 within ±0.08 of a height h (15–80 % H); x from one side to
  the other; wobble 0.03–0.06 H.
- `drop`: x in 0.15–0.85, start above the top, end y 0.45–0.7 (`through: true`
  ends below the bottom instead — used by the bonus round).
- `makeSwarm(n)`: `n` flyby copies of one lead path, one vertical lane each
  (offsets spanning ±0.12 H, small jitter), speeds ±5 %. Start and end margins
  are shared, so members start and finish off screen.

## Enemy fields

```ts
interface Enemy { /* ... */
  path?: PathSpec   // absent → legacy straight-line movement (skull, lunger, minions)
  pathMs: number    // accumulated path time
  harmless: boolean // never a threat (bonus round, flyby bats)
}
type EnemyType = ... | 'candy'
```

`moveSingle`: `if (enemy.path)` → `pathMs += deltaMs`, `x/y = pathPosition(...)`,
`targetX/Y = end point in px`, hitbox via `hitboxFor`. `cullExitedEnemies` also
removes a path enemy when `pathMs ≥ pathDurationMs`, or when it is past half its
path and its hitbox is fully outside the canvas. Only exiting paths are culled
this way; converging paths end at their target and are handled by `splitReached`.

## Reach rule (`reach.ts`)

```ts
isThreat(e) = !e.harmless && type ∉ {skull, boss, candy} && !(e.path && pathExits(e.path))
splitReached(enemies, bonus) → { survivors, missed }   // bonus ⇒ nothing is ever missed
```

Skulls and the boss stay in `survivors`; a threat within `CENTER_THRESHOLD` (40 px)
of its target is a miss, as before.

## Wave scripts

```ts
interface WaveEvent { atMs: number; kind: 'ghost'|'bat'|'pumpkin'|'candy'; path: WavePath; count: number; height?: number }
interface IntensityCurve { points: Array<[number, number]>; peakAt: number }
interface WaveScript {
  intensity: IntensityCurve
  pathMix: Partial<Record<'ghost'|'bat'|'pumpkin'|'candy', Partial<Record<WavePath, number>>>>
  events: WaveEvent[]
}
```

Intensity peaks: stage 1 0.60, stage 2 0.70, stage 3 0.85, stage 4 1.00 (peak at
0.85 of the stage, easing to 0.9 before the boss); every curve starts at ≤ 0.3.

`tickSpawners` (non-bonus, stage has a script):

1. `elapsed = clamp(durationMs − roundTimeMs)`, `level = intensityAt(curve, elapsed/durationMs)`.
2. Each spawn timer decrements by `deltaMs × spawnRateFor(level)`; on expiry it
   spawns one enemy (cap and skull rules unchanged) whose path comes from
   `pickPath(pathMix[kind])` and whose speed is `speedMultiplier × speedFactorFor(level)`.
   Swarm picks spawn up to 5 bats (truncated to the free capacity).
3. Scripted events with `atMs ≤ elapsed` fire in order, tracked by
   `GameState.waveIndex` (reset when the stage starts). Events obey the same cap.
4. No script (stage 5): the original behaviour; the boss spawns itself and its minions.

## Bonus round

```ts
interface BonusRound { name; subtitle; durationMs: 15000; spawnIntervalMs; maxEnemies: 8;
                       enemyMix; speedMultiplier; script: WaveScript }
```

`GameState.bonus: boolean`. Flow in `advanceToNextStage`: after stage 2's summary
(`StageConfig.bonusAfter`), `bonus: true` on the same stage index → `stageTitle`
("Bonus Round — Candy Storm") → `playing` with the bonus duration → `tickTimer`
→ `summary` → the normal advance to stage 3 (`bonus` false). Spawn timers reuse
the existing slots: `bat` → candy, `pumpkin` → bonus pumpkin, the others 99999.
`tickSpawners` forces `harmless: true`, one-hit pumpkins and off-screen exits for
every bonus enemy. `splitReached(…, true)` ignores targets entirely.

`createInitialState` / `retryStage` leave `bonus: false`.

## Frame-rate and scale independence

Positions depend only on `Σ deltaMs` and (W, H). Scaling W and H by `k` scales
`pathPosition` by `k` (all lengths are fractions of W/H or canvas heights) and
keeps `pathDurationMs` constant. Margins use `max(0.12·H, 64)`, so the scale
property is tested for H ≥ 540 where the margin is purely proportional.

## Tests

- `paths.test.ts`: per-type bounds, endpoints, exits flag, swarm lanes.
- `paths.property.test.ts`: frame-rate independence (via `moveEnemies`), scale invariance, bounds, flyby exit + cull, never culled while visible.
- `waves.test.ts`: script validation, intensity shape, bonus config.
- `spawn.waves.test.ts` / property: cap with scripted events, scripted order, bonus harmless over a whole round, `splitReached`.
- Existing unit and property tests stay green.
