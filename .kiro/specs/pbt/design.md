# Property-Based Tests — Design (P2)

## Library
[`fast-check`](https://github.com/dubzzz/fast-check) as a pinned devDependency.
It works with Vitest through plain `fc.assert(fc.property(...))`. Default
`numRuns` (100) is kept for speed; the whole PBT set must stay well under the
existing unit-test runtime budget (a few seconds).

## Files

| File | Properties |
|---|---|
| `src/game/state.property.test.ts` | lives (R2), score (R3), combo tiers (R6) |
| `src/game/enemies/spawn.property.test.ts` | spawner cap, skull uniqueness, mix, phase (R4) |
| `src/game/enemies/movement.property.test.ts` | frame-rate independence, no overshoot (R7) |
| `src/webcam/diff.property.test.ts` | mirror parity (R5) |
| `src/test/prng.ts` | tiny seeded PRNG + `withSeededRandom` helper (R1.3) |

## Seeded randomness (R1.3)
`withSeededRandom(seed, fn)` replaces `Math.random` with a mulberry32 generator
for the duration of `fn` and always restores it. Properties that call the
spawners take the seed as an `fc.integer()` arbitrary, so fast-check prints it
with the shrunk counter-example.

## Event model for lives / score (R2, R3)
Events are an `fc.oneof` of:

| Event | Applied as |
|---|---|
| `skullHit` | `decrementLife`, `setFlash` (as `resolveHits` does) |
| `reachCenter` | `decrementLife`, `resetCombo`, `incrementMissed` (as `loop.ts` does) |
| `banish(points)` | `addScore(points × combo)`, `incrementCombo`, `incrementBanished` |
| `tick(ms)` | `tickTimer` |
| `resolve(motion)` | real `resolveHits` on synthetic `ImageData` with a random enemy set |
| `advance` | `advanceToNextStage` (only when `phase === 'summary'`) |

Invariants are checked after every event. Restart/retry (`createInitialState`,
`retryStage`) start a new run and are therefore not events.

`resolveHits` is exercised with real `ImageData`-shaped objects (RGBA arrays),
a hit being a bright block in the current frame over a dark previous frame. The
audio module is mocked (the functions are `try/catch`ed in production but need
an `AudioContext`).

## Spawner property (R4)
State: `createInitialState(stage)` with `phase: 'playing'`, a random number of
pre-existing enemies (≤ cap), then a sequence of operations: `tick(deltaMs)`
(0–5000 ms), `move(deltaMs)` (via `moveEnemies`), `remove(index)`. After every
operation: `count(non-boss, non-exiting) ≤ maxEnemies`.

Known defect this property is expected to expose: `tickSpawners` computes
`nonBossCount` once at the top, so several timers expiring on the same tick can
each pass the `nonBossCount < max` check and overshoot the cap. Fix: keep a
running count that is incremented on every spawn (see `tasks.md`).

## Mirror helpers (R5)
Mirroring is applied in two places at run time (`drawWebcamFrame`,
`captureFrame`), both as canvas transforms, so no pure helper existed to test.
Add to `src/webcam/diff.ts`:

```ts
export function mirrorX(x: number, width: number): number          // width - x
export function mirrorHitbox(hb: Hitbox, width: number): Hitbox     // { x: width - x - w, ... }
```

They document and pin the coordinate contract used by the canvas transform.
`computeFrameDiff` samples from the hitbox's left edge with a stride, so the
frame-diff parity property uses integer hitboxes with `w ≡ 1 (mod 4)` (the
sample set is then symmetric); this is noted in the test.

## Combo (R6)
Arbitrary non-negative integers for the tier function; arbitrary
`incrementCombo` / `resetCombo` sequences for the reducer invariants.

## Frame-rate independence (R7)
Generate: type, speed (0.05–0.5 heights/s), canvas W×H (640–3840 × 360–2160),
sine offset, start point left of the screen, target near centre, `hz` pair from
`[30, 60, 90, 120, 144, 240]` (straight-line) / `[60, 90, 120, 144, 240]`
(wobble), elapsed 250–1000 ms rounded to a whole number of both step sizes.
Wobble tolerance: 2 px × (H / 1080) (the R1.2 bound of feel-fix).

Lunger is excluded: its wind-up is quantised to one frame by design
(feel-fix T5 note).
