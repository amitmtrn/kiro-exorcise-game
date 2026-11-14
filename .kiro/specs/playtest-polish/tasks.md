# Playtest Polish — Tasks

## T1 — Frame budget controller (pure)
- [x] Create `src/game/quality.ts`: `createFrameBudget`, `stepFrameBudget` (time-weighted average, hysteresis, settle time, up-penalty), `parseQualityMode`, `levelForMode`, module state (`getQuality`, `setQualityLevel`, `configureQuality`), `thinParticles`, `calloutCap`.
- [x] Unit tests: thresholds, settle time, ignore > 250 ms, pinned modes, URL parsing.
- [x] Property tests: frame-step independence (8 / 16 / 33 ms give the same level), level in 0–3, constant frame time moves one way only, no two changes within the settle time.
- [x] Simulation test: slow stream steps down to 3, fast stream recovers to 0, no flip-flop.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(playtest-polish-T1): frame budget controller`

## T2 — Adaptive motion grid
- [x] Create `src/webcam/grid.ts` (ladder, `getMotionGrid`, `setMotionGrid`, `gridForLevel`).
- [x] `diff.ts`, `swipe.ts`, `halves.ts`, `collision.ts` read the grid at call time; `resetHitGates` in `src/game/hitGate.ts` (outside `collision.ts`, which many tests mock); the loop clears the published points by publishing an empty mask.
- [x] Tests: default grid unchanged, normalised hitbox mapping, `motionCell` follows the grid, gate reset helper.
- [x] Property tests: a moving blob gives a hit at every supported resolution; no blob, no hit; motion button fills with the same dwell at every grid.
- [x] Benchmark test `src/webcam/grid.bench.test.ts` printing analysis cost per resolution.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(playtest-polish-T2): adaptive motion-diff grid`

## T3 — Wire quality into the loop, renderer and URL
- [x] `loop.ts`: step the controller with real frame deltas (never in demo), apply grid changes with the R2.3 protocol (resize, re-capture, gate reset, `frameIsNew = false`).
- [x] `main.ts`: `?quality=` → `configureQuality`; demo ignores it.
- [x] `state.ts` / `callouts.ts`: particle thinning and call-out cap at level ≥ 1; `atmosphere.ts` level 3 (no fog, static candles).
- [x] `render.ts`: debug overlay line with level, mode, frame ms, resolution.
- [x] Tests: level 0 identity, thinning, atmosphere flag, demo stays at level 0 / 320 × 180, debug text.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(playtest-polish-T3): wire adaptive quality into loop, atmosphere and overlay`

## T4 — SFX recipes and level normalisation
- [x] Create `src/audio/recipes.ts` (voice data, `renderRecipe`, `SFX_GAIN`, `MUSIC_GAIN`, `gainFor`); `sfx.ts` plays recipes through a per-sound gain.
- [x] Tests: gain table covers every SFX id, peak ≤ −3 dBFS, RMS target, boss hit + combo + ghost + music stack under 0 dBFS at offsets 0–100 ms, music 6 dB under SFX.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(playtest-polish-T4): procedural SFX recipes and loudness table`

## T5 — Master bus
- [x] Create `src/audio/bus.ts` (constants, `buildMasterBus`); `context.ts` builds it; `music.ts` routes through the music gain.
- [x] Tests (fake context): every source connects to the master gain, nothing but the limiter connects to the destination, compressor and limiter settings, mute and volume through the master gain, fallback without compressors.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(playtest-polish-T5): master bus with compressor and limiter`

## T6 — Colour maths and palette
- [ ] Create `src/ui/cvd.ts` (Lab, ΔE76, ΔE2000, Machado matrices) and `src/ui/palette.ts` (default and Okabe-Ito).
- [ ] Unit tests against published ΔE2000 reference pairs and CVD identities.
- [ ] Property tests: ΔE symmetric / zero on equal / non-negative; key pairs keep their minimum ΔE under none, protan, deutan, tritan.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(playtest-polish-T6): CVD simulation, deltaE2000 and Okabe-Ito palette`

## T7 — Settings store and panel
- [ ] Create `src/settings/settings.ts` and `runtime.ts` (URL params, storage, prefers-reduced-motion, live settings).
- [ ] Create `src/ui/settingsPanel.ts` (gear rect, rows, keys, pointer, drawing); loop start branch and `main.ts` wiring (`O`, ⚙ click, Esc).
- [ ] Tests: storage holds only settings, invalid data ignored, URL > stored > default, panel key and pointer actions, gear rect clear of the start buttons, mute button, hint pill, text bands at 640 × 480 and 1280 × 720.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(playtest-polish-T7): settings store and panel`

## T8 — Colourblind rendering and bigger text
- [ ] `render.ts`, `hud.ts`, `motionButton.ts`: use `getPalette()`; skull "!" marker and dashed ring, `●` / `■` player marks, ring dash patterns when `cb` is on.
- [ ] `src/ui/textScale.ts` (`scaled`, `hudLayout`); `hud.ts`, `screens.ts` `fit()`, call-outs and onboarding text use it.
- [ ] Tests: HUD boxes inside the canvas, no overlap with each other or the mute button, at 640 × 480 and 1280 × 720, scales 1 / 1.25 / 1.5; minimum font sizes; fitted menu text inside its band, band clear of motion buttons.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(playtest-polish-T8): colourblind palette in the renderer and bigger text`

## T9 — Reduced flashing
- [ ] Create `src/game/flash.ts` (scheduler, ramped waveform, shake scale); `render.ts` uses it when reduced flashing is on; white hit silhouette skipped; random numbers still drawn.
- [ ] Tests: ≤ 3 flashes per second, alpha cap 0.15, ramps ≥ 120 ms, timer blink rate, reduced off keeps the old 0.4 flash.
- [ ] Property test: random request streams never exceed 3 flashes in any 1000 ms window.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(playtest-polish-T9): reduced flashing`

## T10 — Docs
- [ ] README: settings, URL parameters (`quality`, `cb`, `bigtext`, `reducedflash`), quality levels, controls table (`O`), spec table row and count, measured benchmark numbers, audio levels note, project structure.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `docs(playtest-polish-T10): README`

## T11 — Manual smoke test (not checkable here)
- [ ] Throttle the CPU (DevTools 6× slowdown): level steps down within a few seconds, hits still register, motion buttons still fill.
- [ ] `?quality=low`, `?quality=high`: level is pinned and shown in the debug overlay.
- [ ] Listen: boss hit, combo chimes and music stay clean, mute works.
- [ ] Settings: `O` and ⚙ open the panel, choices persist after a reload, `?cb=1` shows the alternative palette and the skull "!" marker.
- [ ] Reduced flashing: skull hit and boss defeat do not flash harshly.
