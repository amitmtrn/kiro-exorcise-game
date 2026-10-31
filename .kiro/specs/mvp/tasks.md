# MVP Tasks

Each task maps to one or more source files. Tasks are ordered by dependency.

---

## T1 — Project scaffold

Files: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/style.css`

- [x] Install Vite and TypeScript dev dependencies.
- [x] Install Vitest; add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json`.
- [x] Create directory tree: `src/webcam/`, `src/game/`, `src/game/enemies/`, `src/ui/`.
- [x] `index.html` — two-canvas layout (`#webcam-canvas`, `#game-canvas`) + `<div id="ui">` overlay.
- [x] `src/style.css` — full-viewport canvases stacked with `position: absolute`, dark `#0d0014` background.

---

## T2 — Webcam capture

File: `src/webcam/capture.ts` · Test: `src/webcam/capture.test.ts`

- [x] Export `initWebcam(): Promise<HTMLVideoElement>` — calls `getUserMedia`, resolves on `loadedmetadata`.
- [x] Export `drawWebcamFrame(ctx, video)` — draws a horizontally mirrored video frame.
- [x] Unit test: `initWebcam` rejects cleanly when `getUserMedia` throws.

---

## T3 — Frame differencing

File: `src/webcam/diff.ts` · Test: `src/webcam/diff.test.ts`

- [x] Export constants: `DIFF_THRESHOLD = 30`, `HIT_RATIO = 0.15`, `SAMPLE_STRIDE = 4`.
- [x] Export `captureFrame(ctx, video)` — draws current video frame to an off-screen canvas.
- [x] Export `computeFrameDiff(currentData, prevData, hitbox, canvasWidth): boolean` — pure function.
- [x] Unit tests: identical frames → false; max diff → true; boundary ratio → true; single pixel → false.

---

## T4 — Game state

File: `src/game/state.ts` · Test: `src/game/state.test.ts`

- [x] Define and export `GameState`, `Enemy`, `Particle`, `Hitbox`, `EnemyType`, `GamePhase` types.
- [x] Export `createInitialState(): GameState`.
- [x] Export pure reducers: `decrementLife`, `addScore`, `tickTimer`, `removeEnemy`, `addParticles`, `setEnemies`, `setParticles`, `setFlash`, `setSpawnTimers`.
- [x] Unit tests for all reducers (12 tests).

---

## T5 — Enemy logic

Files: `src/game/enemies/ghost.ts`, `bat.ts`, `skull.ts`, `spawnUtils.ts`, `movement.ts`, `spawn.ts`
Test: `src/game/enemies/enemies.test.ts`

- [x] `ghost.ts` — `createGhost(w, h)`: edge spawn, speed 1.2, hitbox 80×80.
- [x] `bat.ts` — `createBat(w, h)`: edge spawn, speed 2.0, hitbox 48×32.
- [x] `skull.ts` — `createSkull(w, h)`: edge spawn, speed 0.8, hitbox 56×56.
- [x] `spawnUtils.ts` — `randomEdgeSpawn`, `centerTarget`, `randomId` helpers.
- [x] `movement.ts` — `moveEnemies(enemies, deltaMs)`: sine wobble for ghosts, zigzag for bats, straight for skull. Updates hitbox. Pure (returns new array).
- [x] `spawn.ts` — `tickSpawners(state, deltaMs, w, h)`: ghost 2–4 s, bat 1–2 s, skull 8–12 s, max 6 enemies, max 1 skull.
- [x] Unit tests: all enemy types spawn outside canvas bounds; movement closes distance; spawn cap respected; skull uniqueness enforced.

---

## T6 — Rendering

Files: `src/game/render.ts`, `src/ui/hud.ts`

- [x] `render.ts` — `renderFrame(ctx, state, now)`: clear canvas, draw enemies (procedural shapes), draw particles, draw red flash overlay.
- [x] `hud.ts` — `renderHUD(ctx, state, now)`: ♥ hearts top-left; `MM:SS` timer top-right (flashes red ≤ 10 s); score bottom-left. Glow on all text.
- [ ] Visual correctness verified manually with `npm run dev`.

---

## T7 — Hit resolution

File: `src/game/collision.ts` · Test: `src/game/collision.test.ts`

- [x] Export `resolveHits(state, currentData, prevData, canvasWidth, now): GameState`.
  - Ghost hit → `removeEnemy` + `addScore(100)` + `spawnGhostPuff`.
  - Bat hit → `removeEnemy` + `addScore(50)` + `spawnBatPuff`.
  - Skull hit → `removeEnemy` + `decrementLife` + `setFlash(now + 300)`.
- [x] Unit tests with mocked `computeFrameDiff` (5 tests).

---

## T8 — Particle system

File: `src/game/particles.ts` · Test: `src/game/particles.test.ts`

- [x] Export `spawnGhostPuff(x, y): Particle[]` — 20 white/blue particles, ~400 ms lifetime.
- [x] Export `spawnBatPuff(x, y): Particle[]` — 10 orange particles, ~350 ms lifetime.
- [x] Export `tickParticles(particles): Particle[]` — move, apply gravity 0.15, fade alpha, remove dead.
- [x] Unit tests (10 tests): count, initial alpha, position proximity, gravity, decay, eventual removal.

---

## T9 — Game loop

File: `src/game/loop.ts`

- [x] Export `startLoop(video, webcamCtx, gameCtx, onRestart)` — rAF loop running the full pipeline each tick.
- [x] Export `stopLoop()` — cancels the rAF.
- [x] Tick pipeline: draw webcam → capture frame → spawn → move → center-check → resolve hits → tick timer → tick particles → render → render HUD → swap frames → check gameover.

---

## T10 — UI screens

File: `src/ui/screens.ts`

- [x] Export `showGameOver(score, onRestart)` — HTML overlay with "GAME OVER", final score, "Play Again" button.
- [x] Export `hideGameOver()`.
- [x] Export `showWebcamError(onRetry)` — error message with "Try again" button.
- [x] Export `hideWebcamError()`.

---

## T11 — Wiring

File: `src/main.ts`

- [x] Call `initWebcam()` on load; on success start loop; on failure show webcam error.
- [x] Resize both canvases on `window.resize`.
- [x] `restart` callback resets state and calls `startLoop` again without re-requesting webcam.

---

## T12 — Integration smoke test (manual)

- [ ] Open `npm run dev`; allow webcam.
- [ ] Webcam feed is mirrored (raise right hand → appears on right side of screen).
- [ ] Ghosts and bats spawn from edges and float toward center.
- [ ] Swatting a ghost removes it and shows a white/blue puff.
- [ ] Swatting a bat removes it and shows an orange puff.
- [ ] Hitting the skull flashes red and loses a life.
- [ ] A ghost reaching center loses a life.
- [ ] Timer counts down 60 → 0; game-over screen appears at 0.
- [ ] "Play Again" resets lives, score, timer, enemies and restarts.
- [ ] Runs at 60 fps on a laptop (no visible drops).
