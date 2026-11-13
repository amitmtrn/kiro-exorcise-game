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
Files: `src/game/state.property.test.ts`, `src/game/collision.property.test.ts`

- [ ] Event-sequence model per design; invariants checked after every event (R2, R3).
- [ ] `resolveHits` driven by synthetic frames inside the sequence.
- [ ] Run `npm test` and `npm run build`; both clean.
- [ ] Commit: `test(pbt-T3): lives and score properties`

## T4 — Spawner cap properties
Files: `src/game/enemies/spawn.property.test.ts`, `src/game/enemies/spawn.ts` (if a bug is found)

- [ ] Cap, skull-uniqueness, enemy-mix and phase properties (R4).
- [ ] If the cap property fails, fix `tickSpawners` and record the bug below.
- [ ] Run `npm test` and `npm run build`; both clean.
- [ ] Commit: `test(pbt-T4): spawner cap properties`

## T5 — Mirror parity properties
Files: `src/webcam/diff.ts`, `src/webcam/diff.property.test.ts`

- [ ] `mirrorX`, `mirrorHitbox` pure helpers.
- [ ] Involution, point-in-box agreement, commutes with `scaleHitbox`, `computeFrameDiff` parity on mirrored frames (R5).
- [ ] Run `npm test` and `npm run build`; both clean.
- [ ] Commit: `test(pbt-T5): mirror parity properties`

## T6 — Movement frame-rate independence properties
Files: `src/game/enemies/movement.property.test.ts`, `movement.ts` (if a bug is found)

- [ ] Straight-line exactness, wobble tolerance, no overshoot, split-step (R7).
- [ ] Run `npm test` and `npm run build`; both clean.
- [ ] Commit: `test(pbt-T6): movement frame-rate independence properties`

## T7 — Docs
Files: `README.md`

- [ ] Sync the README unit-test count (`node tools/sync-readme-tests.mjs`) and mention property tests.
- [ ] Run `npm test` and `npm run build`; both clean.
- [ ] Commit: `docs(pbt-T7): README test count and PBT note`

## Bugs found by properties
_None recorded yet._
