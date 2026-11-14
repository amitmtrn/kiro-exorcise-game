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
- Note, not changed: `MIN_COVERAGE` (spec-conformant; revisit after play-testing), harness re-run (needs the harness runtime), 1P summary set reset on entry (harmless, lockout zeroes it), sound-hint timer (starts when the hint is shown, per R6.2).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(motion-ui-ergonomics): copy, spec drift, fitted text, tests`

## T9 — Third review fixes (NITs)
Files: `src/ui/motionButton.ts`, `src/ui/onboarding.ts`, `src/ui/soundHint.ts`, `src/main.ts`, tests, spec docs, `README.md`

- [x] R5.1: button label font fitted to the circle width with `fitFontPx` (no overflow at small radii); test.
- [x] R2.1 documents the one-camera-interval dependence of the dwell.
- [x] Onboarding caption moved to 0.54 H, clear of the shoulder arcs.
- [x] R6.2 hide timer extracted to `soundHint.ts` and tested with fake timers.
- [x] README file tree lists `muteRect.ts`; T8 "Not changed" is a plain note.
- Skipped: harness re-run (needs the harness runtime, no camera here); reopen lease reset (R4.3 met, griefing only); hint timer start (intended, T5); 1P `summarySet` clear and extra mute-rect drop (harmless, no gameplay effect).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(motion-ui-ergonomics): label fit, caption position, hint timer test, docs`

## T10 — Fourth review fixes
Files: `src/ui/soundHint.ts`, `src/ui/seatCard.ts`, `src/ui/layout.ts`, `src/ui/screens.ts`, `src/ui/hud.ts`, `src/main.ts`, `tools/motion-harness/drive.mjs`, `tools/motion-harness/make_y4m.py`, tests, spec docs, `README.md`

- [x] BLOCKER: sound-hint default timers called unbound (browser `Illegal invocation` aborted `main.ts`); test with `this`-checking timer globals (R6.2).
- [x] Harness re-run: `wave` starts the game with no keypress (`firstPlayAtMs` ≈ 5.2 s); `sweep` has 16 hits and saves a score of 4500. The wave video now has gaps for the R2.5 release latch, and the driver skips onboarding.
- [x] R4.3 lease per end-screen visit (reopening does not renew it); test.
- [x] Hint font from the canvas width (R6.1 model and placement agree).
- [x] `muteRectFor` uses the full canvas width (no odd-width off-by-one); test.
- [x] 1P summary buttons cleared on entry; stray blank line in `hud.ts`; README test count.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(motion-ui-ergonomics): unbound hint timers, harness re-run, lease per visit, layout NITs`

## T11 — Reach model
Files: `src/ui/layout.ts`, `src/ui/screens.ts`, `src/ui/layout.test.ts`, `src/ui/layout.property.test.ts`, `tools/motion-harness/make_y4m.py`, `README.md`, spec docs

- [x] Reach model in `layout.ts` (`reachFraction`, `REACH_NEAR` 0.369, `REACH_FAR` 0.221) and spec R9 / design section.
- [x] 1P columns 12 % / 88 % → 30 % / 70 % (were 0.38 W from the player, out of reach at 2.5 m); 2P columns checked and unchanged (0.19 W / 0.15 W).
- [x] Knock-ons: 1P text band [0.38, 0.62] above 47 % H, wide band below; radii 0.065 H / 0.06 W; `ROW_A` 0.19; onboarding hands follow `buttonLayout`; harness wave hovers at raw x = 70 %.
- [x] Property test: every centre within the far-distance reach, outside the torso band, at or above 40 % height.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(motion-ui-ergonomics-T11): buttons within raised-hand reach at 2.5 m`
