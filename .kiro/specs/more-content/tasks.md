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
- [ ] `collision.ts`: mirror absorb (feedback, cool-down), wisp link and both-hit banish (2 × 150 × combo), blink banish only while vulnerable.
- [ ] `step.ts` / `reach.ts`: a wisp pair costs one life; the partner is removed with it.
- [ ] Create `src/game/enemies/variantSpawn.ts`: creators (`createWispPair`, `createMirror`, `createBlink`), `pickSpawn` with skull clearance, 2P half bounds, pair spawn side by side.
- [ ] Unit tests: absorb, link, both-hit, window expiry, blink gate reset, one life per pair, 2P seat bounds.
- [ ] Property tests: clearance from skulls, pair never spans a half, spawn grace respected.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(more-content-T2): variant hit rules, pair threat and safe spawning`

## T3 — Rendering, palette and sound
- [ ] `render.ts`: `drawWisp`, `drawMirror`, `drawBlink` with state icons (∞, ▮ / cracks, ◆ / ◇), dashed outlines, link line, ring timer, absorb ring; telegraph pulses use `pulseRate()`; no strobe.
- [ ] `palette.ts`: `wisp`, `mirror`, `blink` in both palettes; `palette.property.test.ts` includes them in the enemy pairs.
- [ ] `recipes.ts` / `sfx.ts`: `wispLink`, `shield`, `blinkPhase` recipes in the loudness table.
- [ ] Tests: every state draws in both palettes without error, icon calls differ per state, pulse rate ≤ 3 Hz and ≤ 1 Hz reduced, recipe peaks.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(more-content-T3): new ghost art, colourblind palette keys and sounds`

## T4 — Stage 6 and the Hollow King
- [ ] `stages.ts`: stage 6 config (`variantEvents`, `finale`), `tickSpawners` consumes the events and stops skulls before the boss; `variantIndex` reset on stage entry.
- [ ] `bossPhases.ts`: `FINALE_PARAMS`, `createMinions` (blink / wisp pair / mirror), minion cap counts; `createBoss(finale)`; `bossDue` spawns it at 22 s; finale bonus 2000 on defeat.
- [ ] Flow: `advanceToNextStage` 5 → 6, 6 → victory; no stage-5 victory; 2P and card code read `STAGES.length` not 5.
- [ ] `patterns.ts`: `finale` track; `trackForStage(n ≥ 6)`.
- [ ] Callouts: tip call-outs for first sightings, "THE HOLLOW KING!"; stage-title hint lines with icon shapes; onboarding line; card badge "FINALE CLEARED".
- [ ] Render: crown, aura, "HOLLOW KING" label.
- [ ] Tests: stage 6 config, event order and cut-off times, victory only after stage 6, finale params (telegraph ≥ 400 ms, vulnerable ≥ 1200 ms per cycle), minion kinds per phase, music track validity, tips shown once.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(more-content-T4): stage 6 finale with the Hollow King`

## T5 — High-score table core
- [ ] Create `src/game/highScores.ts`: types, `sanitizeName`, `generateName`, `qualifies`, `insertScore`, `renameEntry`, `parseTable`, `loadTable` (with migration), `saveTable`, `recordScore`, `tableBest`.
- [ ] `state.ts`: `highScorePersistence()`; `loadHighScore` = max(legacy, table best); demo persistence off disables the table too.
- [ ] Unit tests: ordering, ties, cap 10, qualifies, migration, hostile JSON, storage errors, demo off writes nothing.
- [ ] Property tests: table invariants after any insert sequence, `parse(serialise(t)) = t`, `sanitizeName` always valid, stored JSON has only the allowed keys.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(more-content-T5): local top-10 high-score table`

## T6 — Name entry core and layout
- [ ] Create `src/game/nameEntry.ts`: `newNameEntry`, `pickStep`, `confirm`, `typeChar`, `backspace`, `tickNameEntry`, `finalName`.
- [ ] `layout.ts`: `name` and `name2p` screens (◀ / OK / ▶), added to `SCREENS_1P` / `SCREENS_2P`.
- [ ] Unit tests: picker flow, wrap-around, keyboard, timeouts, default kept when untouched, layout labels and order.
- [ ] Property tests: any input sequence ends with a valid name, picker cursor never leaves 0–2, name never longer than 8; layout properties (40 % rule, reach, clearance) pass for the new screens in 1P and per half.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(more-content-T6): name picker state and motion-button layout`

## T7 — Name screen, table drawing and 1P loop
- [ ] Create `src/ui/scoreTable.ts` (`tableRows`, `endRows`, `drawTable`) and `src/ui/nameScreen.ts` (`renderNameScreen`).
- [ ] Title screen: table pages every 4 s; game-over / victory: top 5 plus own row; text stays in the layout bands.
- [ ] `loop.ts`: record the run at end-screen entry (not in demo), name screen before the end buttons, retry / menu clear it; `main.ts`: key forwarding.
- [ ] Tests: row selection and highlight, pages, drawing with recording contexts, loop records once per run, demo records nothing, name screen shows and ends.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(more-content-T7): name screen and high-score table on title and end screens`

## T8 — Two-player names
- [ ] `loop.ts` 2P final: record both seats with `mode: "2P"`, per-seat `NameEntry`, per-half name screens with the half's motion points, final buttons after both are done; keyboard edits P1.
- [ ] Tests: both seats recorded with their own stage, independent entries, one half done does not end the other, buttons appear after both.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(more-content-T8): per-player name entry in two-player games`

## T9 — Demo mode and balance check
- [ ] Demo driver: respects variant vulnerability, hits both wisps inside the window.
- [ ] `demo.sim.test.ts`: full run reaches stage 6 and victory, nothing saved, no name screen; re-check seed 5 at the tested sizes (change the default seed and docs only if it fails).
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
