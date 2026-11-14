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

- [ ] `SyntheticCamera`: two buffers, 30 fps frame clock, hand disc, noise, duplicate ticks return `cur === prev`.
- [ ] Unit tests: layout and size, real `computeMotionMask` output (grid, `changed`), resting hand has no points, determinism.
- [ ] Property test: mask points are always within the hand disc plus one cell, for any hand path.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(demo-mode-T2): synthetic camera producing real-format motion frames`

## T3 — Ghost-hand driver
Files: `src/demo/driver.ts`, `src/demo/driver.test.ts`, `src/demo/driver.property.test.ts`

- [ ] `DemoDriver`: moves, targeting with reaction delay, curved swipes, deliberate misses, rest / home, boss pre-position.
- [ ] Skull rule (`handSafe`) on every step; button script (wait for lockout, glide, circle, retreat); run script across phases; never `save`.
- [ ] Unit tests (determinism, reaction, swipe through target, miss then hit, buttons, skull) and property tests (never inside the skull margin, on screen, deterministic).
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(demo-mode-T3): deterministic ghost-hand driver`

## T4 — Overlay art and runtime
Files: `src/demo/overlay.ts`, `src/demo/runtime.ts`, `src/demo/overlay.test.ts`, `src/demo/runtime.test.ts`

- [ ] `overlay.ts`: backdrop, ghost-hand cursor with trail, DEMO badge + caption, placeholder portrait (canvas only).
- [ ] `runtime.ts`: fixed step with frame skipping, demo clock and seeded `Math.random` (installed and restored by `dispose()`), `frame(view)`.
- [ ] Unit tests: badge text, cursor and portrait draw calls, step / skip, clock and random patched then restored, same seed same random stream.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(demo-mode-T4): demo overlay art and deterministic runtime`

## T5 — Loop and main wiring
Files: `src/game/loop.ts`, `src/main.ts`, `src/demo/normal.test.ts`

- [ ] `loop.ts`: optional `demo` runtime (null video, frames from `demo.frame`, tick wrapper with cursor + badge, stage start, demo card session with portrait / `DEMO` chip / no-op download, persistence off); `isStartScreenVisible()`. Normal path byte-for-byte the same behaviour.
- [ ] `main.ts`: `?demo=` parameters, no `getUserMedia` / onboarding in demo, `G` toggle on the title screen, any other key or click leaves demo (passive keys excepted), sound hint hidden in demo, `replaceState` on leave.
- [ ] Test: normal `startLoop` with a video uses the camera, draws no badge and leaves the clock, `Math.random` and persistence alone.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(demo-mode-T5): demo branch in the loop and main entry`

## T6 — Headless full-run simulation
Files: `src/demo/demo.sim.test.ts`

- [ ] Full run through the real `startLoop` with a fake clock and recording contexts: reaches victory, opens the DEMO card preview, loops back to the title, within a bounded demo time; seeds 1–6 and the default seed.
- [ ] Assertions: skull never hit, combo x4 reached, boss phases 2 and 3 entered, DEMO badge drawn on every tick of every phase, no `getUserMedia` / `fetch` / XHR / `sendBeacon`, nothing written to `localStorage`, byte-identical outcome twice for one seed, key / click leaves demo.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `test(demo-mode-T6): headless full demo run`

## T7 — Docs and harness
Files: `README.md`, `tools/motion-harness/README.md`

- [ ] README: Demo mode section (URL parameters, `G`, how to record, sound tip), spec table row, spec count and test count.
- [ ] Motion harness README: "Recording the demo" (`?demo=1&seed=7`, headless Chrome without a fake camera, screen recorder tips).
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `docs(demo-mode-T7): README and harness notes for recording the demo`

## T8 — Manual smoke test (browser)
- [ ] `?demo=1&seed=7`: no camera prompt; DEMO badge in every screen; the ghost hand fills the START ring and the game starts; stages play through; combo x4 call-out; boss telegraph visible; YOU WIN; the card opens with the DEMO chip and a silhouette portrait; the loop returns to the title and starts again.
- [ ] Any key or click leaves demo and shows the normal title (camera prompt appears); `G` on the title screen goes back to demo.
