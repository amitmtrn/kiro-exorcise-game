# Feel Fix — Tasks (P1)

## T1 — Frame-rate-independent, screen-relative movement
Files: `src/game/enemies/movement.ts`, `ghost.ts`, `bat.ts`, `skull.ts`,
`lunger.ts`, `pumpkin.ts`, `boss.ts`, `src/game/state.ts` (comment),
`src/game/loop.ts`, `src/game/enemies/enemies.test.ts`,
`src/game/enemies/movement.test.ts`

- [x] `Enemy.speed` = canvas heights per second; new base speeds per design.
- [x] `moveEnemies(enemies, deltaMs, canvasW, canvasH)`; time-based wobble/zigzag; no overshoot; lunger hold distance scales with height.
- [x] Loop passes the canvas size.
- [x] Tests: 1 s of movement identical at 60/120/144 Hz (ghost, bat, pumpkin); speed scales with canvas height; stage-1 ghost crosses 1080p in 4–6 s; lunger lunge still faster than approach.
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `feat(feel-fix-T1): px/s movement scaled by canvas height and deltaMs`

## T2 — Skull exits after 4 s on screen
Files: `src/game/state.ts`, `src/game/enemies/movement.ts`, `spawn.ts`,
`src/game/loop.ts`, `src/game/enemies/movement.test.ts`,
`src/game/enemies/enemies.test.ts`

- [x] Add `onScreenMs` and `exiting` to `Enemy` / `makeEnemy`.
- [x] Skull accumulates on-screen time, flips to `exiting` at 4 s, flies out at 1.5×.
- [x] `cullExitedEnemies` removes off-screen exiting skulls; loop calls it.
- [x] `tickSpawners` ignores exiting skulls when deciding whether to spawn.
- [x] Tests: on screen 3.9 s → not exiting; ≥ 4 s → exiting; off-screen approach time not counted; culled once outside; new skull may spawn while one exits; still at most one non-exiting skull.
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `feat(feel-fix-T2): skulls leave after 4 s on screen`

## T3 — Combo tiers per stages R4.1–R4.3
Files: `src/game/state.ts`, `src/game/collision.ts`,
`src/game/state.test.ts`, `src/game/collision.test.ts`

- [x] `streak` in `GameState`; `comboForStreak`; `incrementCombo` / `resetCombo` use it; multiplier capped at x4.
- [x] Shake keyed on `streak`.
- [x] Update existing combo/shake tests to the tier model.
- [x] Tests: boundaries 2→x1, 3→x2, 5→x2, 6→x3, 9→x3, 10→x4, 50→x4; reset to x1 / streak 0; `bestCombo` keeps the peak multiplier; hit is scored at the pre-increment multiplier; enemy reaching centre resets (loop-level reducer sequence).
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `feat(feel-fix-T3): combo tiers x2/x3/x4 at 3/6/10 hits`

## T4 — Docs
Files: `README.md` (only if it states combo or speed behaviour)

- [x] Update any README lines that describe the combo or enemy speed.
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `docs(feel-fix-T4): reflect combo tiers and movement`
