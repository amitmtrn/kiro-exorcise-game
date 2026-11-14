# More Content — Tasks

## T1 — Variant ghost state machines (pure)
- [x] `EnemyType` gains `wisp | mirror | blink`; `Enemy` gains `vState`, `vTimerMs`, `vHits`, `absorbMs`, `pairId`, `finale` (defaults in `makeEnemy`); `GameState` gains `variantIndex`, `seenVariants`.
- [x] Create `src/game/enemies/variants.ts`: constants table, `stepVariant`, `isVariantHittable`, `telegraphLeftMs`, `stateSchedule`, `onMirrorAbsorb`, `lightWisp`, `speedFor`, `travelMs`.
- [x] `vulnerability.ts` delegates to `isVariantHittable`; `hitboxFor` and `moveSingle` handle the new types (`stepVariant` runs in the move step).
- [x] Unit tests: every cycle and timing, overshoot carry, absorb counting and cool-down, wisp link / merge, travel time per canvas size.
- [x] Property tests: telegraph precedes every vulnerability change, a hit is possible inside the vulnerable window, frame-rate independence, travel time ≥ 4500 ms.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(more-content-T1): twin wisp, mirror and blink ghost state machines`

## T2 — Hit rules, spawning and threats
- [x] `collision.ts`: mirror absorb (feedback, cool-down), wisp link and both-hit banish (2 × 150 × combo), blink banish only while vulnerable.
- [x] `step.ts` / `reach.ts`: a wisp pair costs one life; the partner is removed with it.
- [x] `recipes.ts` / `sfx.ts`: `wispLink` and `shield` recipes in the loudness table (`sfxWispLink`, `sfxShield`).
- [x] Create `src/game/enemies/variantSpawn.ts`: creators (`createWispPair`, `createMirror`, `createBlink`), `pickSpawn` with skull clearance, 2P half bounds, pair spawn side by side.
- [x] Unit tests: absorb, link, both-hit, window expiry, blink gate reset, one life per pair, 2P seat bounds.
- [x] Property tests: clearance from skulls, pair never spans a half, spawn grace respected.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(more-content-T2): variant hit rules, pair threat and safe spawning`

## T3 — Rendering and palette
- [x] `render.ts`: `drawWisp`, `drawMirror`, `drawBlink` with state icons (∞, ▮ / cracks, ◆ / ◇), dashed outlines, link line, ring timer, absorb ring; telegraph pulses use `variantPulseHz()`; no strobe.
- [x] `palette.ts`: `wisp`, `mirror`, `blink` in both palettes; `palette.property.test.ts` includes them in the enemy pairs.
- [x] Tests: every state draws in both palettes without error, icon calls differ per state, pulse rate ≤ 3 Hz and ≤ 1 Hz reduced.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(more-content-T3): new ghost art and colourblind palette keys`

## T4 — Stage 6 and the Hollow King
- [x] `stages.ts`: stage 6 config (`variantEvents`, `finale`), `tickSpawners` consumes the events and stops skulls before the boss; `variantIndex` reset on stage entry.
- [x] `bossPhases.ts`: `FINALE_PARAMS`, `paramsFor`, `finaleMinionKinds` (blink / wisp pair / mirror), minion cap counts; `createBoss(finale)`; `finale.ts` `bossDue` spawns it at 22 s; finale bonus 2000 on defeat.
- [x] Flow: `advanceToNextStage` 5 → 6, 6 → victory; no stage-5 victory; 2P and card code read `STAGES.length` not 5.
- [x] `patterns.ts`: `finale` track; `trackForStage(n ≥ 6)`.
- [x] Callouts: tip call-outs for first sightings, "THE HOLLOW KING!"; stage-title hint lines with icon shapes; onboarding line; card badge "FINALE CLEARED".
- [x] Render: crown, aura, "HOLLOW KING" label.
- [x] Demo: stage range 1–6 in `params.ts` / `runtime.ts`; default seed stays 5 (restored after the review fixes, clean at the five tested sizes), README / KIRO.md / harness README / `run.sh` / judge-docs test updated together.
- [x] Tests: stage 6 config, event order and cut-off times, victory only after stage 6, finale params (telegraph ≥ 400 ms, vulnerable ≥ 1200 ms per cycle), minion kinds per phase, music track validity, tips shown once, finale card badge, onboarding line; existing stage-5-is-last tests moved to stage 6.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(more-content-T4): stage 6 finale with the Hollow King`

## T5 — High-score table core
- [x] Create `src/game/highScores.ts`: types, `sanitizeName`, `generateName`, `qualifies`, `insertScore`, `renameEntry`, `parseTable`, `loadTable` (with migration), `saveTable`, `recordScore`, `tableBest`.
- [x] `src/game/persistence.ts` (`setHighScorePersistence`, `highScorePersistence`, re-exported by `state.ts`); `loadHighScore` = max(legacy, table best); demo persistence off disables the table too.
- [x] Unit tests: ordering, ties, cap 10, qualifies, migration, hostile JSON, storage errors, demo off writes nothing.
- [x] Property tests: table invariants after any insert sequence, `parse(serialise(t)) = t`, `sanitizeName` always valid, stored JSON has only the allowed keys.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(more-content-T5): local top-10 high-score table`

## T6 — Name entry core and layout
- [x] Create `src/game/nameEntry.ts`: `newNameEntry`, `pickStep`, `confirm`, `typeChar`, `backspace`, `accept`, `tickNameEntry`, `finalName`, `nameKey`.
- [x] `layout.ts`: `name` and `name2p` screens (`stepA` / `ok` / `stepS`, ◀ always on the left), added to `SCREENS_1P` / `SCREENS_2P`; `nameStepOf`.
- [x] Unit tests: picker flow, wrap-around, keyboard, timeouts, default kept when untouched, layout labels and order.
- [x] Property tests: any input sequence ends with a valid name, picker cursor never leaves 0–2, name never longer than 8; layout properties (40 % rule, reach, clearance) pass for the new screens in 1P and per half.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(more-content-T6): name picker state and motion-button layout`

## T7 — Name screen, table drawing and 1P loop
- [x] Create `src/ui/scoreTable.ts` (`tableRows`, `endRows`, `drawTable`) and `src/ui/nameScreen.ts` (`renderNameScreen`).
- [x] Title screen: table pages every 4 s; game-over / victory: top 5 plus own row; text stays in the layout bands.
- [x] `loop.ts`: record the run at end-screen entry (not in demo), name screen before the end buttons (card keys and clicks wait), fresh end-screen lock-out after it; `main.ts`: key forwarding (`handleNameKey`).
- [x] Tests: row selection and highlight, pages, drawing with recording contexts, loop records once per run, demo records nothing, name screen shows and ends.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(more-content-T7): name screen and high-score table on title and end screens`

## T8 — Two-player names
- [x] `loop.ts` 2P final: record both seats with `mode: "2P"`, per-seat `NameEntry`, per-half name screens with the half's motion points, final buttons after both are done; keyboard edits P1.
- [x] Tests: both seats recorded with their own stage, independent entries, one half done does not end the other, buttons appear after both.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(more-content-T8): per-player name entry in two-player games`

## T9 — Demo mode and balance check
- [x] Demo driver: respects variant vulnerability (`isHittable`), skips a lit wisp and ranks its partner with attacks (`partnerLit`).
- [x] `demo.sim.test.ts`: full run reaches stage 6 (every new ghost and the Hollow King) and victory, nothing saved, no name screen; default seed 5 re-checked clean at the tested sizes after the driver change; `driver.variants.test.ts`.
- [x] Motion harness MCP (`read_stage_config`, `run_harness`) and a headless stage-6 sweep; result noted in `design.md` (report only, no tuning change).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(more-content-T9): demo plays the finale`

## T10 — Docs
- [x] README: controls table, stages, enemies, high scores, specs tree (`more-content/`), test count.
- [x] `docs/KIRO.md`: spec lists and history, test count, credits row "After more-content" (777.68; the "After playtest-polish" row stays 629.18). `judge-docs.test.mjs` follows the new history rows (#8 playtest-polish 1515, more-content on this branch).
- [x] Docs facts-check test passes; trademark guard passes.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `docs(more-content-T10): README and KIRO.md`

## T12 — Review fixes
- [x] End screens: `ownIds` cleared at the start of every run end, so a non-qualifying run highlights nothing (R10.2).
- [x] 2P: both seats recorded first; ranks come from the final table; a pushed-out entry gets no name screen (R11.1, R11.2).
- [x] 2P keys are taken only while seat 0 has an open name screen (R11.3).
- [x] Wisp pair score uses the combo at hit time for both wisps (R2.3); test added.
- [x] Pair spawn checks skull clearance for each wisp, not the midpoint (R1.6); test added.
- [x] King summons show the first-sighting tip (R5.4); tip scope documented as once per stage; test added.
- [x] `bossCrown` in the cb palette is purple, with a distance test against boss body, pumpkin and bat eyes (R6.5).
- [x] Name picker: ◀/▶ and OK on an emptied name behave like an untouched one; tests added.
- [x] Title table: page timer starts at title entry; 8 px font floor keeps rows in the central band (R10.1, R10.3 text-scale wording).
- [x] `MAX_STAGE = STAGES.length`.
- [x] Spec drift fixed in design.md (pulse helper, signatures, title text, test table) and requirements.md.
- [x] `npm test` and `npm run build` both clean.
- [x] Commits: `fix(more-content): ...`

## T11 — Manual smoke test (webcam)
- [ ] Wisp pair: hit one, ring shows, hit the other inside 2 s to banish both; miss and watch the merge.
- [ ] Mirror ghost: two waves crack the shield, swat while open.
- [ ] Blink ghost: swat while solid; waving at it while ethereal does nothing.
- [ ] Stage 6 through the Hollow King to YOU WIN; name entry with the three buttons; table on the title screen.
- [ ] 2P: both halves name entry at the same time.

## T13 — Review fixes (round 2)
- [x] R5.4: tips and the king banner are exempt from the combo call-out cap (`addCallout`); test added.
- [x] R6.3: the finale boss's summon counter restarts at each phase change, so the first phase-3 summon has no blink; test added.
- [x] R2.4 / design: `lightWisp` lights an `idle` wisp only; design line corrected.
- [x] R1.6: a random skull spawn keeps clear of new ghosts (retries next tick if no safe point); test added.
- [x] `nameKeysBlocked` reset in `startLoop` / `stopLoop`; `GameState.stage` comment is 1–6.
- [x] R12.1: default demo seed back to 5 (clean at the five tested sizes and speeds 1–3); README, KIRO.md, harness README, `run.sh`, judge-docs test and specs updated.
- [x] `npm test` and `npm run build` both clean.

## T14 — Review fixes (round 3)
- [x] R6.4: finale phase-3 `recoverMs` 900 → 1350, so wind-up + recover is 1800 ms in both attack phases; test asserts 1800; design table and budget updated.
- [x] R7.1: 1P derives `bossDefeated` (boss on the field last tick, phase now `summary` / `victory`) like the 2P seats; test added.
- [x] R6.3: phase-3 `['mirror','blink']` summon falls back to the mirror alone when the pair does not fit the cap; test added.
- [x] R1.6: king summons keep clear of live skulls (no summon while a skull is within clearance); test added.
- [x] R6.3 readability: on small canvases a summoned minion starts clear of the boss sprite; test added.
- [x] R6.4: fight-budget test includes the entry flight and states its slack (done with the R6.4 fix).
- [x] R11.3: name hint says `M` is taken while typing a 1P name; spec line added.
- [x] `GameState.bossActive` comment corrected.
- [x] Demo seed 5 re-checked at the five window sizes and speeds 1–3; sim tests pass.
- [x] `npm test` and `npm run build` both clean after each fix.

## T15 — Review fixes (round 4)
- [x] R1.10: king-summoned wisp pairs stay inside the area or half (midpoint clamped, vertical stack when too narrow); property test at full and half widths.
- [x] Tasks T3 names `variantPulseHz()`.
- [x] `endTableBox` comment matches the callers (0.58 / 0.65).
- [x] Name picker cursor follows the last typed letter beyond 3 characters; test added.
- [x] R8.4: legacy score migration accepts digits only; test added.
- [x] `npm test` and `npm run build` both clean after each fix; demo seed 5 sims pass.

## T16 — Review fixes (round 5)
- [x] R8.4: no phantom OLD-BEST. `saveHighScore` calls `ensureTable()` first (migrates an older build's score, else stores `[]`); tests: fresh storage → stage clear → next stage → game over gives one row, older-build score still migrates.
- [x] R12.1: stale seed 6 docs fixed to 5 (`tools/motion-harness/README.md`, `.kiro/specs/demo-mode/design.md`).
- [x] R1.10: king-summoned wisp pair clamps so the bodies (not only centres) stay inside the area or half; property test extended.
- [x] R2.3: pair banish keeps the partner in the enemy list if the phase is `gameover` after the first banish (defensive; no reachable path, so no test).
- [x] Credits row filled: After more-content 777.68 (also the TL;DR row and README headline); test counts 1706.

## T17 — Review fixes (round 6)
- [x] R5.3 / R1.9: stage-6 title card no longer overlaps the countdown and subtitle; layout test at 640x360 and 1280x720 for text scales 1, 1.25, 1.5.
- [x] `grid.bench.test.ts`: timing check replaced by a deterministic sample-count bound plus an 8x median ratio, so `npm test` is stable under parallel load.
- [x] R8.4: `saveHighScore` runs once on entering the game-over / victory screen, not every frame; loop test counts `localStorage` calls over several frames.
- [x] R1.8: the mirror absorb ring is dim and does not expand with reduced flashing; test added (design/requirements: reduced flashing also calms the absorb ring).
