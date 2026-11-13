# Property-Based Tests — Tasks (P2)

## T1 — Tooling and seeded randomness
Files: `package.json`, `package-lock.json`, `src/test/prng.ts`,
`src/test/prng.test.ts`

- [x] `npm install -D --save-exact fast-check` (devDependency only).
- [x] `src/test/prng.ts`: `mulberry32(seed)`, `withSeededRandom(seed, fn)` (always restores `Math.random`).
- [x] Tests: same seed → same sequence; `Math.random` restored even when `fn` throws.
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `feat(pbt-T1): add fast-check and seeded random helper`

## T2 — Combo tier properties
Files: `src/game/state.property.test.ts`

- [x] `comboForStreak` ∈ {1,2,3,4}, non-decreasing, boundaries at 3/6/10 (R6.1, R6.2).
- [x] Reducer sequences keep `combo === comboForStreak(streak)`, `bestCombo ≤ 4`, `bestCombo` non-decreasing (R6.3).
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `test(pbt-T2): combo tier properties`

## T3 — Lives and score properties
Files: `src/game/collision.property.test.ts`

- [x] Event-sequence model per design; invariants checked after every event (R2, R3).
- [x] `resolveHits` driven by synthetic frames inside the sequence.
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `test(pbt-T3): lives and score properties`

## T4 — Spawner cap properties
Files: `src/game/enemies/spawn.property.test.ts`, `src/game/enemies/spawn.ts` (if a bug is found)

- [x] Cap, skull-uniqueness, enemy-mix and phase properties (R4).
- [x] If the cap property fails, fix `tickSpawners` and record the bug below. (Failed: BUG-1, fixed with a running count + regression test.)
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `test(pbt-T4): spawner cap properties`

## T5 — Mirror parity properties
Files: `src/webcam/diff.ts`, `src/webcam/diff.property.test.ts`

- [x] `mirrorX`, `mirrorHitbox` pure helpers.
- [x] Involution, point-in-box agreement, commutes with `scaleHitbox`, `computeFrameDiff` parity on mirrored frames (R5).
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `test(pbt-T5): mirror parity properties`

## T6 — Movement frame-rate independence properties
Files: `src/game/enemies/movement.property.test.ts`, `movement.ts` (if a bug is found)

- [x] Straight-line exactness, wobble tolerance, no overshoot, split-step (R7).
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `test(pbt-T6): movement frame-rate independence properties`

## T7 — Docs
Files: `README.md`

- [x] Sync the README unit-test count (`node tools/sync-readme-tests.mjs`) and mention property tests.
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `docs(pbt-T7): README test count and PBT note`

## T8 — Review fixes: test quality (R1.3, R2.3, R4.2, R6.3, R7)
Files: `collision.property.test.ts`, `spawn.property.test.ts`, `movement.property.test.ts`

- [x] `collision.property`: seed `Math.random` via `withSeededRandom`; `combo === comboForStreak(streak)`; `lives === 0 ⇒ gameover` after every event.
- [x] `spawn.property`: pre-existing skulls (exiting and not); skull uniqueness exercised with real exiting skulls.
- [x] `movement.property`: no-overshoot asserted only while the skull is not `exiting`.
- [x] `design.md` aligned with the tests (elapsed range, boss in straight set, frame rounding).
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `fix(pbt-T8): review fixes to property test quality`

## T9 — Review fix: frame-diff bounds (BUG-2, R5.4)
Files: `src/webcam/diff.ts`, `src/webcam/diff.property.test.ts`

- [x] Skip out-of-frame samples; property generates edge-overhanging hitboxes; direct regression test.
- [x] Commit: `fix(pbt-T9): computeFrameDiff no longer wraps rows at frame edges`

## T10 — Review fix: no scoring after death (BUG-3, R8)
Files: `src/game/collision.ts`, `src/game/loop.ts`, `collision.property.test.ts`

- [x] Guard in `resolveHits`; loop no longer calls it in gameover; property + unit regression.
- [x] Commit: `fix(pbt-T10): nothing scores after game over`

## T11 — Review fix: time-based effects (BUG-4, R9)
Files: `particles.ts`, `state.ts`, `collision.ts`, `loop.ts` and tests

- [x] `deltaMs`-scaled particles, labels, shake, hit flash; properties for step-size independence.
- [x] Commit: `fix(pbt-T11): scale particles, labels, shake and hit flash by deltaMs`

## T12 — Review fix: spawn timer carry-over (BUG-5, R10)
Files: `spawn.ts`, `spawn.property.test.ts`

- [x] Carry overshoot; property on spawn-rate independence of step size.
- [x] Sync README test count. Run `npm test` and `npm run build`; both clean.
- [x] Commit: `fix(pbt-T12): carry spawn timer overshoot`

## Bugs found by properties
- **BUG-1 (found by T4, spawner cap, R4.1):** `tickSpawners` computed
  `nonBossCount` once per tick, so when two or more spawn timers expired on the
  same tick (e.g. stage 2 ghost + bat with 4 of 5 slots used) each passed the
  `nonBossCount < maxEnemies` check and the cap was exceeded (shrunk
  counter-example: stage 2, 4 enemies, ticks of 2000/1076/…ms → 6 > 5). Fix:
  `nonBossCount` is a running count incremented on every spawn. Regression test:
  `spawn.property.test.ts › spawner cap regression`.

- **BUG-2 (review, R5.4):** `computeFrameDiff` had no horizontal bounds check, so a
  hitbox overhanging the left/right edge sampled the opposite edge of the
  adjacent row (and mirror parity broke). Fix: skip samples outside the frame.
  Regression: `diff.property.test.ts` (unclipped hitboxes) and
  `diff.test.ts › does not wrap`.
- **BUG-3 (review, outside diff, R8):** `resolveHits` ran in `gameover` and kept
  scoring after the last life was lost; `saveHighScore` persisted it. Fix: guard
  in `resolveHits` and loop. Regression: `collision.property.test.ts › nothing
  changes after game over` and unit tests.
- **BUG-4 (review, outside diff, R9):** particles, score labels, `shakeFrames` and
  `hitFlashFrames` decayed per frame, so effects lasted 2× longer at 30 fps and
  half as long at 120 Hz. Fix: scale by `deltaMs / FRAME_MS`. Regression:
  `particles.property.test.ts`, `state.test.ts`, `collision.test.ts`.
- **BUG-5 (review, outside diff, R10):** spawn timers were reset to a fresh interval,
  discarding overshoot (≈ half a frame per spawn). Fix: carry the overshoot.
  Regression: `spawn.property.test.ts › spawn rate independent of step size`.
