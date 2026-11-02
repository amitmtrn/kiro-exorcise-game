# Boss Ghost + Combo — Tasks

> **Status: superseded by the `stages/` spec.** Boss and combo mechanics shipped
> via `feat(stages-T1)`, `feat(stages-T4)` and `feat(stages-T7)` as a 10-hit
> stage-5 boss inside a 5-stage phase machine
> (`start → stageTitle → playing → summary → gameover`), not the per-round 3-hit
> boss and `'boss' | 'roundclear'` phases described here. T9/T10 (audio, mute)
> shipped via the `audio/` spec. Kept for history; the checkboxes below are
> intentionally not tracked.

---

## T1 — Extend GameState for combo and boss phase

File: `src/game/state.ts`

- [ ] Add `combo: number` field (default 1) to `GameState` and `createInitialState`.
- [ ] Add `'boss' | 'roundclear'` to the `GamePhase` union.
- [ ] Add `bossHits: number` field (default 0).
- [ ] Export `incrementCombo(state): GameState`.
- [ ] Export `resetCombo(state): GameState`.
- [ ] Export `setBossHits(state, n): GameState`.
- [ ] Update unit tests: combo increment, combo reset, bossHits setter.

---

## T2 — Combo scoring in hit resolution

File: `src/game/collision.ts`

- [ ] Replace fixed point values with `basePoints * state.combo` for ghost and bat hits.
- [ ] Call `incrementCombo` after each ghost/bat hit.
- [ ] Update collision tests to assert combo-multiplied scores and combo increments.

---

## T3 — Combo reset on miss

File: `src/game/loop.ts`

- [ ] In the center-check loop, call `resetCombo` on the state whenever a ghost or bat reaches center.
- [ ] Verify existing center-check logic is unchanged for life decrement.

---

## T4 — Boss enemy factory

File: `src/game/enemies/boss.ts`

- [ ] Add `'boss'` to `EnemyType` in `state.ts`.
- [ ] Export `createBoss(canvasW, canvasH): Enemy` — spawns from top-center, speed 0.5, hitbox 160 × 160.
- [ ] Update `hitboxFor` in `movement.ts` to handle `'boss'` type.
- [ ] Unit test: boss spawns at top-center, hitbox is 160 × 160.

---

## T5 — Round sequencing

File: `src/game/round.ts`

- [ ] Export `tickRound(state, deltaMs, canvasW, canvasH): GameState`.
  - In `'playing'`: when `roundTimeMs ≤ 5000`, clear enemies, spawn boss, set phase to `'boss'`.
  - In `'boss'`: when `bossHits >= 3`, set phase to `'roundclear'`, add 500 points, trigger boss-defeated audio and flash.
  - In `'boss'`: when `roundTimeMs === 0`, set phase to `'gameover'`.
  - In `'roundclear'`: after 3 s, reset state (lives, score, timer) and set phase back to `'playing'`.
- [ ] Export `ROUND_CLEAR_DURATION_MS = 3000`.
- [ ] Unit tests: phase transitions (playing→boss, boss→roundclear, boss→gameover, roundclear→playing).

---

## T6 — Boss hit resolution

File: `src/game/collision.ts`

- [ ] Detect boss hits in `resolveHits` (type `'boss'`).
- [ ] On boss hit: call `setBossHits(state, state.bossHits + 1)`, play `playBossHit()`. Do **not** remove the enemy until `bossHits === 3`.
- [ ] On 3rd hit: `removeEnemy`, call `playBossDefeated()`, set flash orange (`rgba(255,107,26,0.5)`) for 400 ms.
- [ ] Unit tests: boss survives first and second hit; is removed on third hit; score +500 on third hit.

---

## T7 — Boss rendering

File: `src/game/render.ts` + `src/game/enemies/boss.ts`

- [ ] Export `drawBoss(ctx, enemy, bossHits, now)` in `boss.ts`.
  - Scaled-up ghost body.
  - Witch hat: trapezoid brim + triangle crown + orange buckle stripe.
  - Pulsing purple glow.
- [ ] Export `renderBossHealth(ctx, bossHits, bossX, bossY)` — 3 orbs below the boss; spent orbs are grey.
- [ ] Call `drawBoss` and `renderBossHealth` in `renderFrame` when an enemy of type `'boss'` is present.
- [ ] No unit tests; visual check with `npm run dev`.

---

## T8 — HUD combo label

File: `src/ui/hud.ts`

- [ ] Render combo multiplier bottom-right: "×N" in slime green, hidden when `combo === 1`.
- [ ] Scale-pulse animation on increment: record `comboAnimStart` in module scope; in `renderHUD`, if `now - comboAnimStart < 200`, apply `ctx.scale` up to 1.5 then interpolate back to 1.0.
- [ ] Pass `combo` (already in `state`) and `now` — no new parameters needed.

---

## T9 — Audio module

File: `src/audio/sfx.ts`

- [ ] Create `AudioContext` lazily on first call (avoids autoplay policy issues).
- [ ] Export `playComboChime(combo: number)` — oscillator at `220 * combo` Hz, 0.15 s decay.
- [ ] Export `playBossHit()` — sine wave 80 Hz, 0.3 s decay.
- [ ] Export `playBossDefeated()` — 3-note ascending fanfare (C4, E4, G4), staggered 0.3 s, 2 s total.
- [ ] Export `setMuted(muted: boolean)` — suspends/resumes the AudioContext.
- [ ] Unit tests: functions do not throw when called; `setMuted` toggles context state.

---

## T10 — Mute button

File: `src/ui/screens.ts`

- [ ] Add `showMuteButton()` — injects a `<button id="mute-btn">` into `#ui`, positioned top-right (CSS).
- [ ] Button toggles between 🔊 and 🔇, calling `setMuted`.
- [ ] Called once from `src/main.ts` after webcam init.

---

## T11 — Wire round sequencing into game loop

File: `src/game/loop.ts`

- [ ] Replace direct `tickTimer` call with `tickRound` (which internally calls `tickTimer` for the `'playing'` phase).
- [ ] Handle new phases `'boss'` and `'roundclear'` in the phase check at the end of each tick.
- [ ] Ensure `showGameOver` is still called when phase transitions to `'gameover'`.

---

## T12 — Integration smoke test (manual)

- [ ] Play normally; confirm combo multiplier appears after first hit chain.
- [ ] Let an enemy reach center; confirm combo resets.
- [ ] Reach t = 55 s; confirm boss appears, normal enemies clear.
- [ ] Hit boss once and twice; confirm orbs dim and boss survives.
- [ ] Land 3rd hit; confirm explosion particles, orange flash, fanfare, round-clear banner, score +500.
- [ ] Play to t = 60 s without defeating boss; confirm game-over screen (not round-clear).
- [ ] Confirm mute button silences audio and can be re-enabled.
