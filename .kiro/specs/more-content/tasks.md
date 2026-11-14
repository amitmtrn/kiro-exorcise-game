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
- [x] `render.ts`: `drawWisp`, `drawMirror`, `drawBlink` with state icons (∞, ▮ / cracks, ◆ / ◇), dashed outlines, link line, ring timer, absorb ring; telegraph pulses use `pulseRate()`; no strobe.
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
- [x] Demo: stage range 1–6 in `params.ts` / `runtime.ts`; default seed 6 (seed 5 loses the 960×540 take on the finale), README / KIRO.md / harness README / `run.sh` / judge-docs test updated together.
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
- [ ] `loop.ts` 2P final: record both seats with `mode: "2P"`, per-seat `NameEntry`, per-half name screens with the half's motion points, final buttons after both are done; keyboard edits P1.
- [ ] Tests: both seats recorded with their own stage, independent entries, one half done does not end the other, buttons appear after both.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(more-content-T8): per-player name entry in two-player games`

## T9 — Demo mode and balance check
- [ ] Demo driver: respects variant vulnerability, hits both wisps inside the window.
- [ ] `demo.sim.test.ts`: full run reaches stage 6 and victory, nothing saved, no name screen; re-check the default seed at the tested sizes after the driver change.
- [ ] Motion harness / balancer: run the report-only check on stage 6 and note the result in `design.md` (the balancer edits nothing).
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(more-content-T9): demo plays the finale`

## T10 — Docs
- [ ] README: controls table, stages, enemies, high scores, specs tree (`more-content/`), test count.
- [ ] `docs/KIRO.md`: spec lists and history, test count, credits row "After more-content".
- [ ] Docs facts-check test passes; trademark guard passes.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `docs(more-content-T10): README and KIRO.md`

## T11 — Manual smoke test (webcam)
- [ ] Wisp pair: hit one, ring shows, hit the other inside 2 s to banish both; miss and watch the merge.
- [ ] Mirror ghost: two waves crack the shield, swat while open.
- [ ] Blink ghost: swat while solid; waving at it while ethereal does nothing.
- [ ] Stage 6 through the Hollow King to YOU WIN; name entry with the three buttons; table on the title screen.
- [ ] 2P: both halves name entry at the same time.
