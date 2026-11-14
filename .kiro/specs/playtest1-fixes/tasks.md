# Playtest 1 Fixes — Tasks

## T0 — Spec
- [x] `requirements.md`, `design.md` (root causes) and `tasks.md`.
- [x] Commit: `docs(playtest1-fixes-T0): spec for the first playtest bugs`

## T1 — Hearts: one per event, grace, visible loss, death transition
Files: `src/game/state.ts`, `step.ts`, `collision.ts`, `enemies/bossPhases.ts`, `loop.ts`, `twoPlayer.ts`, `src/ui/hud.ts`
- [x] Failing tests first: three reached enemies in one tick, skull + arrival inside the grace, gameover with no death transition, name screen before GAME OVER.
- [x] `invulnMs`, `lifeFxMs`, `deathMs`, `decrementLife` grace, `tickLifeTimers`, `tickDeath`, boss timeout death.
- [x] `step.ts` one heart per event window; `collision.ts` skull only reacts when a heart was lost.
- [x] HUD shake / flash with reduced-flash variant; hearts drawn during the death transition.
- [x] Loop: death transition, GAME OVER first, name screen after `NAME_DELAY_MS` (1P and 2P).
- [x] Property tests (`lives.property.test.ts`): no tick to gameover with lives > 1; at most 1 heart per grace window; gameover always has the transition.
- [x] Existing tests updated only where the rule changed (immediate gameover, back-to-back losses).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(playtest1-fixes-T1): one heart per event, grace, death transition, GAME OVER before the name screen`

## T2 — Motion buttons: the largest coverage wins; name flow
Files: `src/ui/motionButton.ts`, `src/game/nameEntry.ts`, `src/ui/nameScreen.ts`
- [x] Failing tests first: CLOSE covered with NO PHOTO clipped fires CLOSE; OK covered with ◄ clipped finishes the name; OK after ◄ finishes at once.
- [x] `coverageScore`, `update(now, allow)`, `updateExclusive` dominance.
- [x] `nameEntry`: in-place `pickStep`, `confirm` = accept, cursor auto-advance; update its unit and property tests.
- [x] `nameScreen`: always-visible cursor box, new hint texts (1P and 2P), fits at all sizes.
- [x] Regression suite `endButtons.zones.test.ts`: every end-screen button (game over, victory, name, preview; 1P and each 2P half): drawn circle equals the layout zone, a hand arriving from the camera's mirrored side fires exactly once on a full ring.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(playtest1-fixes-T2): strongest coverage wins, OK saves the name, visible letter cursor`

## T3 — Card preview geometry
Files: `src/ui/layout.ts`
- [x] Failing test first: ring of NO PHOTO / CLOSE / SAVE clear of the card at 640×360 … 1920×1080, text scale 1 and 1.5, 1P and both 2P halves.
- [x] `previewCardRect` gap = `RING_OUTSET + CARD_GAP`; test that the preview draws no circle other than its buttons (the moon is card art).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(playtest1-fixes-T3): card preview keeps the button rings clear of the card`

## T4 — Mirror and video verification
Files: tests only (code only if a test fails)
- [ ] Mirror consistency test (display, motion, card photo, 2P half).
- [ ] Video draw test at quality levels 0–3.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `test(playtest1-fixes-T4): mirror and full-resolution video checks`

## T5 — Docs
Files: `README.md`, `docs/KIRO.md`
- [ ] README controls and name-entry text, spec table, tree, counts; `docs/KIRO.md` spec list, counts; credits row `After playtest1-fixes` (figure left for the operator, the 802.22 row stays).
- [ ] `tools/judge-docs.test.mjs` passes; `npm test` and `npm run build` clean.
- [ ] Commit: `docs(playtest1-fixes-T5): README controls, spec list and counts`

## T6 — Manual: webcam replay
- [ ] Let three enemies arrive at once on stage 3: one heart goes, the hearts shake, a second loss waits 1 s.
- [ ] Lose the last heart: freeze, GAME OVER, then the name screen about 1.5 s later.
- [ ] Name screen: wave OK at once (finishes); ◄ / ► change the highlighted letter; OK saves.
- [ ] Card: CLOSE closes, NO PHOTO flips, SAVE saves; no ring touches the card.
