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

- [ ] `collision.ts`: `motionFrameSeq` (bumped on a new camera frame) and `motionCell` (grid cell size in canvas px).
- [ ] `MotionButton`: coverage threshold, 650 ms dwell (1000 ms destructive), ring, decay with reversal grace, stale-frame hold, release latch, `suppress()`.
- [ ] `EntryLock` (1200 ms) and `updateExclusive` (one action per frame).
- [ ] Unit + property tests: single frame / sub-dwell burst / sway never fires, noise below coverage never fires, stale frames never fill, latch after trigger and lockout, exclusive resolution.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(motion-ui-ergonomics-T2): coverage-based dwell activation with decay, latch and exclusive resolution`

## T3 — 1P screens use the layout
Files: `src/ui/screens.ts`, `src/ui/cardScreen.ts`, `src/game/loop.ts`, tests

- [ ] Start, summary, game over, victory and card offer / preview buttons from `buttonLayout`; text fitted to the text band; card image ≤ 60 % width.
- [ ] Entry lockout + latch on every 1P screen (`resetGameOverScreen`); exclusive groups (offer, retry, menu); destructive dwell for MENU / SAVE.
- [ ] Clicks, taps and keys unchanged (tests).
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(motion-ui-ergonomics-T3): 1P buttons in raised-hand zones`

## T4 — 2P screens and halves
Files: `src/ui/splitscreen.ts`, `src/ui/seatCard.ts`, `src/ui/hud.ts`, `src/game/loop.ts`, tests

- [ ] Per-half copies of NEXT / PLAY AGAIN / MAIN MENU reading only their half; either player fires; exclusive resolution.
- [ ] Per-half card offer and preview from `areaButtons`; 20 s lease for the other half's shared buttons.
- [ ] Banners below 47 %; mute 2P does not overlap any banner or button.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(motion-ui-ergonomics-T4): 2P per-half raised-hand buttons`

## T5 — Sound hint and onboarding
Files: `src/style.css`, `src/ui/onboarding.ts`, `src/ui/onboarding.test.ts`

- [ ] `.sound-hint` at the top centre (matches `soundHintRect`).
- [ ] `guideGeometry` hand targets = layout start zones; "Raise a hand…" line drawn by `drawGuide`.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(motion-ui-ergonomics-T5): sound hint at the top, onboarding hand targets from the layout`

## T6 — Docs and harness
Files: `README.md`, `tools/motion-harness/make_y4m.py`, `tools/motion-harness/README.md`

- [ ] README controls section and spec table; wave harness hovers over the new 1 PLAYER zone.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `docs(motion-ui-ergonomics-T6): controls, harness and spec index`
