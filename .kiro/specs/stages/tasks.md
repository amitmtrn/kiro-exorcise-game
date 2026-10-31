# Stages — Tasks (P1)

## T1 — Stage config + extended GameState
- [ ] Create `src/game/stages.ts` with the 5 `StageConfig` entries.
- [ ] Add `stage`, `stagePhase`, `combo`, `bestCombo`, `stageMissed`, `stageBanished`, `highScore` to `GameState` and `createInitialState`.
- [ ] Add `incrementCombo`, `resetCombo` reducers.
- [ ] Unit tests: combo increment/reset; highScore persisted to localStorage.
- [ ] Commit: `feat(stages-T1): stage config + extended state`

## T2 — Round/phase machine
- [ ] Create `src/game/round.ts` with `tickRound(state, deltaMs, canvasW, canvasH)`.
- [ ] Handles phase transitions: start-screen → title → playing → summary → next stage / game-over.
- [ ] Unit tests: all phase transitions.
- [ ] Commit: `feat(stages-T2): phase machine`

## T3 — Motion buttons (start screen + game over)
- [ ] Create `src/ui/motionButton.ts`.
- [ ] Replace start screen HTML button with motion pumpkin.
- [ ] Replace game-over HTML buttons with motion buttons.
- [ ] Commit: `feat(stages-T3): motion buttons`

## T4 — Combo scoring in collision
- [ ] Wire `incrementCombo` / `resetCombo` into `resolveHits` and the reach-center check.
- [ ] Multiply base points by combo.
- [ ] Unit tests.
- [ ] Commit: `feat(stages-T4): combo scoring`

## T5 — Lunging enemy
- [ ] Add `'lunger'` to `EnemyType`; create `src/game/enemies/lunger.ts`.
- [ ] Update `movement.ts` for lunge phase machine.
- [ ] Unit tests: phase transitions.
- [ ] Commit: `feat(stages-T5): lunging enemy`

## T6 — Pumpkin enemy
- [ ] Add `'pumpkin'` to `EnemyType`; create `src/game/enemies/pumpkin.ts`.
- [ ] Handle 2-hit logic in `resolveHits`.
- [ ] Render first-hit state (orange flash, scale 0.85).
- [ ] Commit: `feat(stages-T6): pumpkin 2-hit enemy`

## T7 — Stage boss
- [ ] Add `'boss'` to `EnemyType`; create `src/game/enemies/boss.ts` (10-hit, sends small ghosts).
- [ ] Health bar render.
- [ ] Commit: `feat(stages-T7): stage 5 boss`

## T8 — Stage summary screen + stars
- [ ] HTML overlay with banished / missed / best combo / stars.
- [ ] Star rating logic (3 = no misses + 3 lives, 2 = 1 miss or 2 lives, 1 = survived).
- [ ] Commit: `feat(stages-T8): stage summary + stars`

## T9 — High score persistence
- [ ] Load / save to `localStorage` on game-over and stage-clear.
- [ ] Display on start screen.
- [ ] Commit: `feat(stages-T9): high score`

## T10 — Integration smoke test (manual)
- [ ] Full 5-stage playthrough hands-only.
- [ ] Game over → retry stage restores lives.
- [ ] High score persists across page reload.
