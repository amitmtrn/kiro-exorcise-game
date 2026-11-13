# Property-Based Tests — Design (P2)

## Library
[`fast-check`](https://github.com/dubzzz/fast-check) as a pinned devDependency.
It works with Vitest through plain `fc.assert(fc.property(...))`. Default
`numRuns` (100) is kept for speed; the whole PBT set must stay well under the
existing unit-test runtime budget (a few seconds).

## Files

| File | Properties |
|---|---|
| `src/game/state.property.test.ts` | combo tiers (R6) |
| `src/game/collision.property.test.ts` | lives (R2), score (R3) over mixed reducer + `resolveHits` event sequences |
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

Pre-existing enemies are mostly ghosts plus, in the skull variants, exiting and
non-exiting skulls; `move` ops can total more than 4 s so skulls retarget off-screen
and become `exiting`. Known defect this property exposed (BUG-1): `tickSpawners` computes
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
sample set is then symmetric). Hitboxes are **not** clipped to the frame: they
may overhang any edge, which exposed BUG-2 (row wrap-around). `captureFrame` /
`drawWebcamFrame` use canvas transforms, so `mirrorX` / `mirrorHitbox` pin the
coordinate algebra only.

## Combo (R6)
Arbitrary non-negative integers for the tier function; arbitrary
`incrementCombo` / `resetCombo` sequences for the reducer invariants.

## Frame-rate independence (R7)
Generate: type, speed (0.05–0.5 heights/s), canvas W×H (640–3840 × 360–2160),
sine offset, start point left of the screen, target near centre, `hz` pair from
`[30, 60, 90, 120, 144, 240]` (straight-line) / `[60, 90, 120, 144, 240]`
(wobble), elapsed 50–1000 ms (multiples of 50), simulated as a rounded whole number of frames of equal length.
Straight-line set: pumpkin, skull, boss. The no-overshoot property asserts only while a skull is not `exiting` (after 4 s it retargets off-screen).
Wobble tolerance: 2 px × (H / 1080).

Lunger is excluded: its wind-up is quantised to one frame by design
(feel-fix T5 note).

## Review-fix designs (T8–T12)

- **Bounds (BUG-2):** `computeFrameDiff` skips samples with `px < 0 || px >= canvasWidth || py < 0` (the bottom edge is covered by the existing data-length check).
- **Death (BUG-3):** `resolveHits` returns early (after clearing `lastBanished`) in `gameover`, and stops scoring inside its loop once a skull has taken the last life; `loop.ts` no longer calls it in the gameover branch. Property: after the first `gameover`, `resolve` events leave the state identical.
- **Time scaling (BUG-4):** `FRAME_MS = 1000/60` exported from `state.ts`. `tickParticles(p, deltaMs = FRAME_MS)`: `x += vx·dt`, `y += vy·dt + ½g·dt²`, `vy += g·dt`, `alpha -= decay·dt` with `dt = deltaMs / FRAME_MS` (exact for constant gravity, so positions are step-size independent). `tickScoreLabels` and `tickShake` likewise. `resolveHits(..., frameIsNew, deltaMs)` decrements `hitFlashFrames` by `dt`, snapping to 0 once ≤ 0.25 so 16 ms vs 16.67 ms ticks do not flash an extra frame.
- **Spawn carry (BUG-5):** new timer = `interval + max(timer, -interval)` (overshoot carried, capped at one interval). Property: with `Math.random` fixed, the number of timer resets over a long run is within 1 of the analytic count for any step size.
