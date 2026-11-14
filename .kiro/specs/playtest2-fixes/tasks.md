# Playtest 2 Fixes — Tasks

## T0 — Spec
- [x] `requirements.md`, `design.md` (root causes) and `tasks.md`.
- [x] Commit: `docs(playtest2-fixes-T0): spec for the second playtest bugs`

## T1 — Zones: skulls at the sides with a spawn grace, threats end in the player zone
Files: `src/game/zones.ts`, `enemies/skull.ts`, `enemies/movement.ts`, `collision.ts`, `state.ts`, `paths.ts`, `src/demo/driver.ts`, `.kiro/specs/waves/requirements.md`
- [x] Failing tests first: a centre-targeted skull enters the body zone; a skull spawns on the bottom edge and under a HUD rect; a skull hit in its first 800 ms costs a heart; line / arc / drop end outside the player zone; a portrait walk is shorter in time than a 0.85 H walk.
- [x] `zones.ts`: `bodyZone`, `hudRects`, `rectsIntersect`, `PLAYER_END`; `Enemy.graceMs`.
- [x] `createSkull` / `skullPlacement`: side entry between the HUD rows, target beside the body zone, horizontal path and exit; `SKULL_GRACE_MS` counts while the hitbox is fully on screen.
- [x] `resolveHits` ignores a skull in its grace (no heart, not removed).
- [x] `makePath`: line / arc / landing drop end in `PLAYER_END`; short chords are slowed (`windowSpeed`), never shorter in time than a 0.85 H walk. Waves R1.2 amended.
- [x] Property tests (`zones.property.test.ts`): spawn edge, targets, flight / hover / exit never meet the body zone or HUD rects, at 320×360 … 3024×1364 and portrait, at 8–100 ms ticks; grace ≥ 800 ms and only counts fully on screen. `skull.grace.test.ts`: a skull in grace costs nothing.
- [x] Demo driver: steps into the body column when a skull's corridor passes near the hand (`fleeFromSkull`, not interrupted). Seed 5 is clean at every tested size and speed; the game-over coverage test uses seed 10 at speed 3 (no seed 1–16 fails at speed 2 any more).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(playtest2-fixes-T1): skulls keep out of the body zone and the HUD with a spawn grace, threats end near the player`

## T2 — Telegraph for every heart-costing arrival, MISSED call-out
Files: `src/game/enemies/telegraph.ts`, `reach.ts`, `movement.ts`, `step.ts`, `callouts.ts`, `render.ts`, `src/demo/driver.ts`
- [x] Failing tests first: a short-path ghost costs a heart with `warnMs` 0; no MISSED call-out; a skull in grace shows no ring.
- [x] `telegraph.ts` (`etaMs`, `tickWarn`, `telegraphProgress`); `reached()` gated on `TELEGRAPH_MIN_MS`.
- [x] `splitReached` returns `lost`; `step.ts` adds the `'miss'` call-out; red "MISSED" drawn.
- [x] Danger ring with dashed outline and "!" on alarmed threats and on skulls in their grace (reduced flash: steady; cb: palette danger).
- [x] Property tests (`telegraph.property.test.ts`): no threat (line, arc, drop, lunger, blink, mirror, a ghost spawned next to its target) costs a heart before `warnMs ≥ 1000` at any tick split; one call-out per arrival, also in the heart grace. Render tests (`render.telegraph.test.ts`): ring shrinks, reduced flash steady, cb palette, skull grace ring, MISSED colour.
- [x] Arrival fixtures in existing reach / lives / bonus / variant tests carry `warnMs: TELEGRAPH_MIN_MS` (the rule changed).
- [x] Demo driver `timeToThreatMs` includes the telegraph wait.
- [x] `npm test` and `npm run build` both clean; demo seed 5 sims clean.
- [x] Commit: `fix(playtest2-fixes-T2): telegraph every heart-costing arrival for 1 s, MISSED call-out`

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
