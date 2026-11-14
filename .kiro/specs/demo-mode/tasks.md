# Demo Mode — Tasks

## T1 — Parameters, key rules, persistence switch
Files: `src/demo/params.ts`, `src/demo/rng.ts`, `src/game/state.ts`, `src/demo/params.test.ts`, `src/demo/state.persist.test.ts`

- [x] `params.ts`: `DEMO` config, `parseDemoParams`, `DEMO_TOGGLE_KEY`, `demoKeyAction`; `rng.ts`: `mulberry32`.
- [x] `state.ts`: `setHighScorePersistence(on)`; when off `saveHighScore` writes nothing and `loadHighScore` returns 0 (default on, behaviour unchanged).
- [x] Unit tests: parameter parsing and clamping, key table, persistence on / off / restored.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(demo-mode-T1): demo parameters, key rules and score-persistence switch`

## T2 — Synthetic camera
Files: `src/demo/camera.ts`, `src/demo/camera.test.ts`

- [x] `SyntheticCamera`: two buffers, 30 fps frame clock, hand disc, noise, duplicate ticks return `cur === prev`.
- [x] Unit tests: layout and size, real `computeMotionMask` output (grid, `changed`), resting hand has no points, determinism.
- [x] Property test: mask points are always within the hand disc plus one cell, for any hand path.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(demo-mode-T2): synthetic camera producing real-format motion frames`

## T3 — Ghost-hand driver
Files: `src/demo/driver.ts`, `src/demo/driver.test.ts`, `src/demo/driver.property.test.ts`

- [x] `DemoDriver`: moves, targeting with reaction delay, curved swipes, deliberate misses, rest / home, boss pre-position.
- [x] Skull rule (`handSafe`) on every step; button script (wait for lockout, glide, circle, retreat); run script across phases; never `save`.
- [x] Unit tests (determinism, reaction, swipe through target, miss then hit, buttons, skull) and property tests (never inside the skull margin, on screen, deterministic).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(demo-mode-T3): deterministic ghost-hand driver`

## T4 — Overlay art and runtime
Files: `src/demo/overlay.ts`, `src/demo/runtime.ts`, `src/demo/overlay.test.ts`, `src/demo/runtime.test.ts`

- [x] `overlay.ts`: backdrop, ghost-hand cursor with trail, DEMO badge + caption, placeholder portrait (canvas only).
- [x] `runtime.ts`: fixed step with frame skipping, demo clock and seeded `Math.random` (installed and restored by `dispose()`), `frame(view)`.
- [x] Unit tests: badge text, cursor and portrait draw calls, step / skip, clock and random patched then restored, same seed same random stream.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(demo-mode-T4): demo overlay art and deterministic runtime`

## T5 — Loop and main wiring
Files: `src/game/loop.ts`, `src/main.ts`, `src/demo/normal.test.ts`

- [x] `loop.ts`: optional `demo` runtime (null video, frames from `demo.frame`, tick wrapper with cursor + badge, stage start, demo card session with portrait / `DEMO` chip / no-op download, persistence off); `isStartScreenVisible()`. Normal path byte-for-byte the same behaviour.
- [x] `main.ts`: `?demo=` parameters, no `getUserMedia` / onboarding in demo, `G` toggle on the title screen, any other key or click leaves demo (passive keys excepted), sound hint hidden in demo, `replaceState` on leave.
- [x] Test: normal `startLoop` with a video uses the camera, draws no badge and leaves the clock, `Math.random` and persistence alone.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(demo-mode-T5): demo branch in the loop and main entry`

## T6 — Headless full-run simulation
Files: `src/demo/demo.sim.test.ts`, `src/demo/main.demo.test.ts`, `src/demo/driver.ts`, `src/demo/runtime.ts`, `src/demo/params.ts`, `src/audio/sfx.ts`, `src/main.ts`

- [x] Full run through the real `startLoop` (real renderer into a recording proxy) with a fake clock: reaches victory, opens the DEMO card preview, loops back to the title, within a bounded demo time; seeds 1–6, the default seed, and the default seed at four more window sizes.
- [x] Assertions: skull never hit, combo x4 reached, boss phases 1–3 entered, DEMO badge drawn on every tick of every phase (and on the card preview; game over via seed 3), `stage=5` starts at the boss, no `getUserMedia` / `fetch` / XHR / `sendBeacon`, nothing written to `localStorage`, identical run twice for one seed and on the second loop of the attract mode, a different seed differs.
- [x] Driver fixes found by the simulation: time-to-threat urgency, interrupts, lunger staging, skull detours, per-sample skull travel, hand top speed, live skulls only, attack reaction from the wind-up start, hand radius floor 36 px. Determinism fixes: fixed clock base 2^40, `lockEndButtons` on both clocks, driver time restarts per run, private noise generator in `sfx.ts`.
- [x] `main.demo.test.ts`: entry point against a stub DOM (no camera / onboarding / network in demo, `M` passive, key and click leave, `?demo=0`, `G` on the title); `routeDemoKey` unit tests; onboarding flag read lazily.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `test(demo-mode-T6): headless full demo run`

## T7 — Docs and harness
Files: `README.md`, `tools/motion-harness/README.md`, `tools/motion-harness/run.sh`, `tools/motion-harness/drive.mjs`

- [x] README: Demo mode section (URL parameters, `G`, how to record, sound tip), spec table row, spec count and test count.
- [x] Motion harness README: "Recording the demo" (`?demo=1&seed=7`, window size, screen recorder tips, re-takes).
- [x] `run.sh demo` (`SEED=`): headless Chrome without fake-camera flags on `?demo=1&seed=N`; `drive.mjs` counts `getUserMedia` / fetch / XHR / `sendBeacon` from the first script and reports `cardAtMs`. Ran once: 0 calls, card after ~137 s. The MCP `run_harness` tool keeps its two modes.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `docs(demo-mode-T7): README and harness notes for recording the demo`

## T8 — Manual smoke test (browser)
- [ ] `?demo=1&seed=7`: no camera prompt; DEMO badge in every screen; the ghost hand fills the START ring and the game starts; stages play through; combo x4 call-out; boss telegraph visible; YOU WIN; the card opens with the DEMO chip and a silhouette portrait; the loop returns to the title and starts again.
- [ ] Any key or click leaves demo and shows the normal title (camera prompt appears); `G` on the title screen goes back to demo.

Pre-check (automated, headless Chrome 1280×720, `?demo=1&seed=7`, not a substitute for the manual pass): title, playing HUD with the DEMO badge clear of score and timer, ghost-hand cursor, NEXT ring filling on the summary, YOU WIN (98,025), card preview with the DEMO chip and the placeholder portrait (via `&stage=5`), SAVE never approached, return to the title; Space left demo, removed the demo parameters from the URL and the normal flow requested the camera (no camera in headless: the camera-help screen). Still manual: the real permission prompt and `G` back into demo on a real title screen.

## T9 — Review fixes
Files: `src/demo/params.ts`, `src/demo/runtime.ts`, `src/demo/driver.ts`, `src/game/loop.ts`, `src/main.ts`, `tools/motion-harness/run.sh`, tests next to each, README

- [ ] Browser keys (`F1`–`F12`, Ctrl / Meta / Alt chords) are passive in demo: no leave, no `preventDefault`, so a keyboard reload stays in demo and `F11` works (R1.4).
- [ ] Real-time pace: accumulate real elapsed time and run one fixed step per full real step, so the pace is 60 steps/s on any display ≥ 60 Hz; stall cap `maxGapMs` (R5.1).
- [ ] `leaveDemo()` stops the music and sets `demoLeft`, so the normal flow runs even if `replaceState` fails (R1.5).
- [ ] `stopLoop()` disposes the demo runtime; a throwing demo tick stops the loop first (design).
- [ ] Driver: after 3 bursts at EXORCIST CARD without the preview opening, press MAIN MENU (R4.7).
- [ ] `speed` outside 1–3 or not a plain decimal falls back to the default instead of clamping (R1.1).
- [ ] Spec wording aligned with the code: lunger reaction 150–230 ms (R4.2), retreat 3.2 r / 600 ms, `DemoView` fields, portrait description (R6.3).
- [ ] `run.sh`: empty `CAMERA_FLAGS` expansion safe under `set -u` on bash < 4.4.
- [ ] Headless simulation: `cancelAnimationFrame` stub drops the queued callback, so a stopped loop no longer ticks into the next simulated run (the determinism test compared two runs that shared a stale loop).
- [ ] Tests for each of the above; `npm test` and `npm run build` both clean.
- [ ] Commits: `fix(demo-mode): ...`
