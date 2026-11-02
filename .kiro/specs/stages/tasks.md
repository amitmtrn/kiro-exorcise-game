# Stages — Tasks (P1)

## T1 — Stage config + extended GameState
- [x] Create `src/game/stages.ts` with the 5 `StageConfig` entries.
- [x] Add `stage`, `stagePhase`, `combo`, `bestCombo`, `stageMissed`, `stageBanished`, `highScore` to `GameState` and `createInitialState`.
- [x] Add `incrementCombo`, `resetCombo` reducers.
- [x] Unit tests: combo increment/reset; highScore persisted to localStorage. _(localStorage tests added 2026-11-02.)_
- [x] Commit: `feat(stages-T1): stage config + extended state`

## T2 — Round/phase machine
- [x] Create `src/game/round.ts` with `tickRound(state, deltaMs, canvasW, canvasH)`.
- [x] Handles phase transitions: start-screen → title → playing → summary → next stage / game-over.
- [x] Unit tests: all phase transitions.
- [x] Commit: `feat(stages-T2): phase machine`

## T3 — Motion buttons (start screen + game over)
- [x] Create `src/ui/motionButton.ts`. _(Non-functional until hit-detection-fix T6, 2026-11-02: motion pixels were only ever produced per enemy.)_
- [x] Replace start screen HTML button with motion pumpkin. _(Shipped as a generic glowing motion button, not pumpkin-shaped.)_
- [x] Replace game-over HTML buttons with motion buttons.
- [x] Commit: `feat(stages-T3): motion buttons`

## T4 — Combo scoring in collision
- [x] Wire `incrementCombo` / `resetCombo` into `resolveHits` and the reach-center check.
- [x] Multiply base points by combo.
- [x] Unit tests.
- [x] Commit: `feat(stages-T4): combo scoring`

## T5 — Lunging enemy
- [x] Add `'lunger'` to `EnemyType`; create `src/game/enemies/lunger.ts`.
- [x] Update `movement.ts` for lunge phase machine.
- [x] Unit tests: phase transitions.
- [x] Commit: `feat(stages-T5): lunging enemy`

## T6 — Pumpkin enemy
- [x] Add `'pumpkin'` to `EnemyType`; create `src/game/enemies/pumpkin.ts`.
- [x] Handle 2-hit logic in `resolveHits`.
- [x] Render first-hit state (orange flash, scale 0.85).
- [x] Commit: `feat(stages-T6): pumpkin 2-hit enemy`

## T7 — Stage boss
- [x] Add `'boss'` to `EnemyType`; create `src/game/enemies/boss.ts` (10-hit, sends small ghosts).
- [x] Health bar render.
- [x] Commit: `feat(stages-T7): stage 5 boss`

## T8 — Stage summary screen + stars
- [x] HTML overlay with banished / missed / best combo / stars. _(Canvas overlay — `renderSummary` in `screens.ts`.)_
- [x] Star rating logic (3 = no misses + 3 lives, 2 = 1 miss or 2 lives, 1 = survived).
- [x] Commit: `feat(stages-T8): stage summary + stars`

## T9 — High score persistence
- [x] Load / save to `localStorage` on game-over and stage-clear.
- [x] Display on start screen.
- [x] Commit: `feat(stages-T9): high score`

## T10 — Integration smoke test (manual)
- [ ] Full 5-stage playthrough hands-only.
- [ ] Game over → retry stage restores lives.
- [ ] High score persists across page reload.
