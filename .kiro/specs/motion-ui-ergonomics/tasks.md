# Motion UI Ergonomics — Tasks

## T1 — Pure layout module
Files: `src/ui/layout.ts`, `src/ui/layout.test.ts`, `src/ui/layout.property.test.ts`

- [x] `layout.ts`: constants, `buttonLayout`, `areaButtons`, `textBand`, `textRects`, `fitFontPx`, `soundHintRect` (R1, R3.2, R4.4, R5, R6).
- [x] Unit tests: slot assignment per screen, destructive flags, mirror parity (P2 is P1 mirrored), no-photo preview.
- [x] Property tests over random canvases 640×480..2560×1440 and every screen/mode: centre y ≤ 40 %, outside the centreline band, inside canvas / owning half, gap ≥ radius, no overlap with text rects, mute rects and the sound hint.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(motion-ui-ergonomics-T1): pure raised-hand button layout`

## T2 — Activation model
Files: `src/game/collision.ts`, `src/ui/motionButton.ts`, `src/ui/motionButton.test.ts`, `src/ui/motionButton.property.test.ts`

- [x] `collision.ts`: `motionFrameSeq` (bumped on a new camera frame) and `motionCell` (grid cell size in canvas px).
- [x] `MotionButton`: coverage threshold, 650 ms dwell (1000 ms destructive), ring, decay (no reversal grace after T7), stale-frame hold, release latch, `suppress()`.
- [x] `EntryLock` (1200 ms) and `updateExclusive` (one action per frame).
- [x] Unit + property tests: single frame / sub-dwell burst / sway never fires, noise below coverage never fires, stale frames never fill, latch after trigger and lockout, exclusive resolution.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(motion-ui-ergonomics-T2): coverage-based dwell activation with decay, latch and exclusive resolution`

## T3 — 1P screens use the layout
Files: `src/ui/screens.ts`, `src/ui/cardScreen.ts`, `src/game/loop.ts`, tests

- [x] Start, summary, game over, victory and card offer / preview buttons from `buttonLayout`; text fitted to the text band; card image ≤ 60 % width.
- [x] Entry lockout + latch on every 1P screen (`resetGameOverScreen`); exclusive groups (offer, retry, menu); destructive dwell for MENU / SAVE.
- [x] Clicks, taps and keys unchanged (tests).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(motion-ui-ergonomics-T3): 1P buttons in raised-hand zones`

## T4 — 2P screens and halves
Files: `src/ui/splitscreen.ts`, `src/ui/seatCard.ts`, `src/ui/hud.ts`, `src/game/loop.ts`, tests

- [x] Per-half copies of NEXT / PLAY AGAIN / MAIN MENU reading only their half; either player fires; exclusive resolution.
- [x] Per-half card offer and preview from `areaButtons`; 20 s lease for the other half's shared buttons.
- [x] Banners below 47 %; mute 2P does not overlap any banner or button.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(motion-ui-ergonomics-T4): 2P per-half raised-hand buttons`

## T5 — Sound hint and onboarding
Files: `src/style.css`, `src/main.ts`, `src/ui/layout.ts`, `src/ui/onboarding.ts`, `src/ui/onboarding.test.ts`

- [x] Sound hint at the top centre: `SOUND_HINT` in `layout.ts` applied by `main.ts` (matches `soundHintRect`).
- [x] `guideGeometry` hand targets = layout start zones; "Wave a hand…" line drawn by `drawGuide`.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(motion-ui-ergonomics-T5): sound hint at the top, onboarding hand targets from the layout`

## T6 — Docs and harness
Files: `README.md`, `tools/motion-harness/make_y4m.py`, `tools/motion-harness/README.md`

- [x] README controls section and spec table; wave harness hovers over the new 1 PLAYER zone.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `docs(motion-ui-ergonomics-T6): controls, harness and spec index`

## T7 — Review fixes
Files: `src/ui/motionButton.ts`, `src/ui/layout.ts`, `src/ui/seatCard.ts`, `src/game/loop.ts`, `src/main.ts`, `src/style.css`, `src/ui/screens.ts`, tests, spec docs

- [x] R2.3: no reversal grace, first on frame after a gap uncredited; property test covers every off ≥ on pattern.
- [x] Exclusive-group property asserts winner = first button, losers dropped and latched.
- [x] `sharedButtonsLive` extracted and tested (offer vs PLAY AGAIN / MAIN MENU, both halves).
- [x] Progress ring stays on the canvas (`RING_OUTSET`, radius cap) + property test.
- [x] Sound hint font from `soundHintFontPx`, auto-hide after 8 s (R6.2).
- [x] Start hint on two lines, ≥ 12 px at 640 px (R7.2).
- [x] Design doc drift fixed (`COL_INNER_P1/P2`, `textBand(aw, seat)`, test file name).
- [x] `npm test` and `npm run build` both clean.
- [x] Commits: `1fb0ca8` and `e12c30c` (`fix(motion-ui-ergonomics): …`)

## T8 — Second review fixes
Files: `src/ui/screens.ts`, `src/ui/onboarding.ts`, `src/ui/hud.ts`, `src/game/collision.ts`, tests, `README.md`, spec docs

- [x] Copy says to wave over the circle (a still hand cannot press): start hint, onboarding line, README, R7.1 / R7.2.
- [x] Design step 5 and T2 bullet match the no-grace model.
- [x] Score / Best / stars lines fitted to the text band (R5.1).
- [x] `GRID_STRIDE` exported and tested equal to `SAMPLE_STRIDE`; `hud.ts` import moved to the top.
- [x] 2P summary latch test covers a wave continuing through the lockout.
- [ ] Not changed: `MIN_COVERAGE` (spec-conformant; revisit after play-testing), harness re-run (needs the harness runtime), 1P summary set reset on entry (harmless, lockout zeroes it), sound-hint timer (starts when the hint is shown, per R6.2).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(motion-ui-ergonomics): copy, spec drift, fitted text, tests`
