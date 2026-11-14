# Playtest 2 Fixes — Tasks

## T0 — Spec
- [x] `requirements.md`, `design.md` (root causes) and `tasks.md`.
- [x] Commit: `docs(playtest2-fixes-T0): spec for the second playtest bugs`

## T1 — Skulls: body zone, HUD rects, side entry, spawn grace
Files: `src/game/zones.ts`, `enemies/skull.ts`, `enemies/movement.ts`, `collision.ts`, `state.ts`, `render.ts`
- [ ] Failing tests first: a centre-targeted skull enters the body zone; a skull spawns on the bottom edge and under a HUD rect; a skull hit in its first 800 ms costs a heart.
- [ ] `zones.ts`: `bodyZone`, `hudRects`, `rectsIntersect`; `Enemy.warnMs`.
- [ ] `createSkull`: side entry between the HUD rows, target beside the body zone, horizontal path; `SKULL_GRACE_MS`; the grace counts while the hitbox is fully on screen.
- [ ] `resolveHits` ignores a skull in its grace; danger ring drawn (shared with T2).
- [ ] Property tests (`zones.property.test.ts`): targets / paths / exit never meet the body zone or HUD rects, never the bottom or top edge, at 640×360 … 3024×1364 and 2P halves; a skull in grace costs nothing.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `fix(playtest2-fixes-T1): skulls keep out of the body zone and the HUD, with a spawn grace`

## T2 — Telegraph for every heart-costing arrival, end near the player, MISSED
Files: `src/game/enemies/telegraph.ts`, `reach.ts`, `movement.ts`, `paths.ts`, `step.ts`, `callouts.ts`, `render.ts`, `.kiro/specs/waves/*`
- [ ] Failing tests first: a short-path ghost costs a heart with `warnMs` 0; line / arc end outside the player zone; no MISSED call-out.
- [ ] `telegraph.ts` (`etaMs`, `tickWarn`, `telegraphProgress`); `reached()` gated on `TELEGRAPH_MIN_MS`.
- [ ] `makePath` ends line / arc in `PLAYER_END`; short chords are slowed, never shortened in time.
- [ ] `splitReached` returns `lost`; `step.ts` adds the `'miss'` call-out; red "MISSED" drawn.
- [ ] Danger ring with dashed outline and "!" (reduced flash: steady; cb: palette danger).
- [ ] Property tests (`telegraph.property.test.ts`): no threat costs a heart before `warnMs ≥ 1000` at any tick split; path and chord window; call-out per arrival.
- [ ] Waves requirements / design note the amended R1.2; existing path tests updated only for the end zone.
- [ ] `npm test` and `npm run build` both clean; demo seed 5 sims clean.
- [ ] Commit: `fix(playtest2-fixes-T2): telegraph every heart-costing arrival for 1 s, end threats near the player, MISSED call-out`

## T3 — New procedural sounds in the gain table
Files: `src/audio/recipes.ts`, `sfx.ts`, `index.ts`, `recipes.test.ts`
- [ ] Failing tests first: the new ids are missing from `SFX_IDS` / `SFX_GAIN`.
- [ ] Recipes `gameOver`, `uiConfirm`, `countTick`, `countGo`; gains from `gainFor`; `sfxGameOver`, `sfxConfirm`, `sfxCountTick`, `sfxCountGo`.
- [ ] Stack tests include the new sounds; they pass at 20000 runs once.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(playtest2-fixes-T3): procedural game over sting, confirm, countdown sounds in the gain table`

## T4 — Wire the sounds
Files: `src/ui/motionButton.ts`, `ui/seatCard.ts`, `game/countdown.ts`, `game/loop.ts`
- [ ] Failing tests first: a fired motion button plays no sound; game over plays no sting; stage titles play no ticks.
- [ ] `updateExclusive` and `SeatCard` play `sfxConfirm` once per fire.
- [ ] `createCountdownCues` (tick per number, go once); loop 1P and 2P.
- [ ] Sting once at game over (1P, 2P final); title bed on end screens.
- [ ] Tests: `sfx.fire.test.ts`, `countdown.test.ts`, `loop.audio.test.ts`.
- [ ] `npm test` and `npm run build` both clean; demo seed 5 sims clean.
- [ ] Commit: `feat(playtest2-fixes-T4): confirm sound on motion buttons, game over sting, countdown ticks`

## T5 — Docs
Files: `README.md`, `docs/KIRO.md`, `tools/judge-docs.test.mjs`
- [ ] `docs/KIRO.md` spec list, test count history, credits rows; README "Built with Kiro", spec tree, counts.
- [ ] `tools/judge-docs.test.mjs` passes; `npm test` and `npm run build` clean.
- [ ] Commit: `docs(playtest2-fixes-T5): README and KIRO.md for the second playtest`

## T6 — Manual: webcam replay
- [ ] Stage 2: a ghost ends near the player, a red ring shrinks for about 1 s first, "MISSED" shows where the heart goes.
- [ ] Stage 3: skulls hover at the sides, never above the head; body motion does not hit one; a skull is untouchable for its first second.
- [ ] No skull from the bottom edge or under the score.
- [ ] Death plays the sting; end screens have the title bed; waving OK / CARD gives a soft blip; every stage title counts 3-2-1 with ticks.
