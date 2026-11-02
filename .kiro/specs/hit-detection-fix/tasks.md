# Hit-Detection Fix — Tasks (P0)

---

## T1 — Fix mirror bug in captureFrame + unit test

Files: `src/webcam/diff.ts`, `src/webcam/diff.test.ts`

- [x] Apply `translate(width,0) + scale(-1,1)` in `captureFrame` before
  `drawImage`, matching `drawWebcamFrame`.
- [x] Export `MOTION_W = 320` and `MOTION_H = 180` constants.
- [x] Add `scaleHitbox(hitbox, displayW, displayH): Hitbox` helper.
- [x] Unit test — mirror parity:
  - Create two 20×10 ImageData arrays representing a mirrored capture.
  - In `current`, paint a bright region on the **left** half only.
  - Assert `computeFrameDiff` returns `true` for a hitbox on the left and
    `false` for a hitbox on the right.
- [x] Run `npm test`; all tests green.
- [x] Commit: `fix(P0-T1): mirror captureFrame + unit test`

---

## T2 — Fix x,y center-point in enemies and reach check

Files: `src/game/state.ts`, `src/game/enemies/ghost.ts`, `bat.ts`, `skull.ts`,
`src/game/enemies/enemies.test.ts`

- [x] Add `spawnedAt: number` and `hitCount: number` to the `Enemy` interface
  and `createInitialState` (set to 0 for placeholder enemies in tests).
- [x] In each factory (`createGhost`, `createBat`, `createSkull`) set
  `spawnedAt: performance.now()` and `hitCount: 0`.
- [x] Verify the hitbox is computed from the center via `hitboxFor`
  (factories already do this — confirm and add a test assertion).
- [x] In `src/game/loop.ts` reach-check: compare `enemy.x, enemy.y` (center)
  to `enemy.targetX, enemy.targetY` — confirm this is already correct; add a
  comment making it explicit.
- [x] Update enemy unit tests to assert `spawnedAt` is a number and
  `hitCount === 0` at creation.
- [x] Run `npm test`; all tests green.
- [x] Commit: `fix(P0-T2): enemy x,y is center; add spawnedAt + hitCount`

---

## T3 — Fixed 320×180 motion canvas + hitbox scaling

Files: `src/game/loop.ts`, `src/webcam/diff.ts`

- [x] In `startLoop`, replace the display-sized off-screen canvases with
  320×180 (`MOTION_W × MOTION_H`) canvases.
- [x] Pass `displayW` and `displayH` (the display canvas dimensions) into
  `resolveHits` so it can scale hitboxes.
- [x] In `resolveHits` (`collision.ts`), call `scaleHitbox(enemy.hitbox,
  displayW, displayH)` before passing to `computeFrameDiff`.
- [x] Confirm `computeFrameDiff` receives `canvasWidth = MOTION_W` (320).
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `fix(P0-T3): motion canvas fixed at 320×180, scale hitboxes`

---

## T4 — Noise reduction: 2-frame gate, spawn grace, hitbox +20%, auto-calibrate

Files: `src/webcam/diff.ts`, `src/game/collision.ts`, `src/game/enemies/ghost.ts`,
`bat.ts`, `skull.ts`, `src/game/loop.ts`, `src/ui/hud.ts`

- [x] **Hitbox +20%**: in `hitboxFor` (movement.ts) multiply `w` and `h` by
  `1.2` and adjust `x` and `y` to keep the box centered.
- [x] **2-frame gate**: in `resolveHits`, for each enemy:
  - If diff is `true`, increment `enemy.hitCount`; if diff is `false`, reset to 0.
  - Only fire the hit if `enemy.hitCount >= 2`.
  - `hitCount` must be stored back onto the enemy in state via `setEnemies`.
- [x] **Spawn grace**: in `resolveHits`, skip diff check if
  `now - enemy.spawnedAt < 300`.
- [x] **Auto-calibrate**: implement `calibrateDiffThreshold(ctx, video, durationMs)` in `diff.ts`:
  - Captures `durationMs / 16` frame pairs, computes mean per-pixel luminance diff.
  - Returns `Math.max(15, Math.min(60, meanDiff * 2.5))`.
- [x] In `startLoop`, before the rAF loop: run calibration (show
  "Calibrating…" text in the HUD for 1 s), then set a module-level
  `activeDiffThreshold` used in place of the exported constant. _(Banner added 2026-11-02.)_
- [x] Update collision tests to cover grace period and 2-frame gate
  (mock `performance.now`, set `spawnedAt` and `hitCount` on enemies).
- [x] Run `npm test`; all tests green.
- [x] Commit: `fix(P0-T4): 2-frame gate, spawn grace, hitbox +20%, auto-calibrate`

---

## T5 — Debug overlay (D key)

Files: `src/game/render.ts`, `src/game/collision.ts`, `src/main.ts`

- [x] Export `let debugMode = false` and `toggleDebug()` from `render.ts`.
- [x] In `collision.ts`, export `lastMotionPixels: Array<{x:number,y:number}>`.
  Populate it each frame with display-space coordinates of every pixel that
  exceeded threshold (scale back from motion canvas: `px * displayW/MOTION_W`).
  Clear it at the start of each `resolveHits` call.
- [x] In `renderFrame`, when `debugMode`:
  - Draw each enemy hitbox as `rgba(0,255,0,0.25)` fill + `rgba(0,255,0,0.8)` stroke.
  - Draw yellow hitbox for grace-period enemies.
  - Draw each `lastMotionPixels` entry as a 3×3 white rect.
- [x] In `src/main.ts`, add `document.addEventListener('keydown', e => { if (e.key === 'd' || e.key === 'D') toggleDebug() })`.
- [x] No new unit tests (visual feature); manually verify with `npm run dev`.
- [x] Commit: `feat(P0-T5): debug overlay toggle with D key`
