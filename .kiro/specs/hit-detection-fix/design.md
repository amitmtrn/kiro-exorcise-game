# Hit-Detection Fix — Design (P0)

## Root-cause analysis

### Bug 1 — Mirror mismatch
`drawWebcamFrame` flips the canvas (`translate(w,0) + scale(-1,1)`) so the
player sees a mirror. `captureFrame` calls `ctx.drawImage(video, 0, 0, w, h)`
— no flip. A ghost at screen-left x=100 has its hitbox at x=100. But in the
unmirrored capture canvas, x=100 is the *right* side of the raw video feed.
Motion on the player's left hand maps to the right side of the capture canvas,
so diff checks are on the wrong side.

Fix: apply the same flip in `captureFrame` (only the small motion canvas, not
the display canvas which already works).

### Bug 2 — x,y semantics
`createGhost` calls `randomEdgeSpawn` and uses the returned `x, y` both as
the enemy center **and** as the hitbox top-left (`hitbox.x = x - SIZE/2`).
`movement.ts` treats `enemy.x, enemy.y` as the center (it computes `targetX -
enemy.x` for the direction vector). So movement is correct, but the initial
hitbox after `createGhost` is wrong for one tick until `movement.ts` re-centers
it.

Fix: verify all factories set `hitbox` from center coords. Add a shared
`hitboxFor(type, cx, cy)` helper and use it everywhere including factories.
(`movement.ts` already has this helper — just ensure factories use it too.)

### Bug 3 — Motion canvas size
Running `getImageData` on a 1920×1080 canvas each tick for each enemy is
expensive. A 320×180 canvas has 36× fewer pixels. Hitbox coordinates must be
scaled down proportionally.

---

## Data model changes

### Enemy — add `spawnedAt`

```ts
interface Enemy {
  // ... existing fields ...
  spawnedAt: number   // performance.now() when the enemy was created
  hitCount: number    // number of consecutive frames diff was true (for 2-frame gate)
}
```

### `captureFrame` signature change

```ts
// src/webcam/diff.ts
export function captureFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
): void {
  const { width, height } = ctx.canvas
  ctx.save()
  ctx.translate(width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, width, height)
  ctx.restore()
}
```

### Motion canvas

Created once in `startLoop`, fixed 320×180:

```ts
const MOTION_W = 320
const MOTION_H = 180

const currentCanvas = document.createElement('canvas')
currentCanvas.width = MOTION_W
currentCanvas.height = MOTION_H
// same for prevCanvas
```

### Hitbox scaling helper

```ts
// src/webcam/diff.ts
export function scaleHitbox(
  hitbox: Hitbox,
  displayW: number,
  displayH: number,
): Hitbox {
  const sx = MOTION_W / displayW
  const sy = MOTION_H / displayH
  return {
    x: hitbox.x * sx,
    y: hitbox.y * sy,
    w: hitbox.w * sx,
    h: hitbox.h * sy,
  }
}
```

### Auto-calibration

```ts
// src/webcam/diff.ts
export async function calibrateDiffThreshold(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  durationMs = 1000,
): Promise<number> { ... }
```

Samples frame pairs over `durationMs`, computes mean luminance diff per pixel,
returns `clamp(meanDiff * 2.5, 15, 60)`. Called once from `startLoop` before
the rAF begins; the loop shows "Calibrating…" in the HUD during this time.

### 2-frame confirmation in `resolveHits`

`enemy.hitCount` increments when diff is true, resets to 0 when false.
A hit fires when `hitCount >= 2` and `now - spawnedAt > 300`.

#### Update 2026-11-02 — camera frame rate (regression found by the motion harness)

Webcams deliver 30 fps (15 fps in low light) while `requestAnimationFrame`
runs at 60. Every other tick therefore compared a camera frame **with itself**:
diff = 0 everywhere, `hitCount` reset, and the gate could never reach 2. Hits
were impossible on any real camera; `tools/motion-harness` reproduced it
(0 hits in 45 s, then 12 after the fix).

- `computeMotionMask(current, prev, MOTION_W, MOTION_H)` in `diff.ts` samples
  the whole motion canvas on the `SAMPLE_STRIDE` grid each tick and reports
  `changed` — any non-zero luminance delta. A live camera frame always carries
  sensor noise, so `changed === false` means "no new frame", not "no motion".
- `resolveHits(…, now, frameIsNew)` skips the diff and leaves every
  `hitCount` untouched when `frameIsNew === false`; only hit flashes expire.
  The gate now means **two consecutive camera frames with motion**.
- The same mask feeds `lastMotionPixels` (display space) via
  `updateMotionPixels()`, replacing the old per-enemy population — see the
  stages spec, "Motion buttons". On a duplicate frame the previous pixels are
  kept so a held wave is not interrupted.

### Hitbox enlargement

Applied in `hitboxFor` / enemy factories: multiply `w` and `h` by `1.2`,
re-center (`x -= w * 0.1`, `y -= h * 0.1`).

### Debug overlay state

A module-level `let debugMode = false` in `src/game/render.ts`, toggled by a
`keydown` listener on `'d'` / `'D'`. `renderFrame` draws the extras when true.

The motion mask pixels are computed inside `resolveHits` and stored in a
`lastMotionPixels: {x:number,y:number}[]` exported from `collision.ts` (reset
each frame). `renderFrame` reads it when debug is on and scales coords back to
display space.

---

## File change summary

| File | Change |
|---|---|
| `src/webcam/diff.ts` | Mirror in `captureFrame`; add `scaleHitbox`, `calibrateDiffThreshold`; export `MOTION_W`, `MOTION_H` |
| `src/webcam/diff.test.ts` | New mirror-parity test; calibration smoke test |
| `src/game/state.ts` | Add `spawnedAt`, `hitCount` to `Enemy` |
| `src/game/enemies/ghost.ts` | Set `spawnedAt: performance.now()`, `hitCount: 0`; use shared `hitboxFor` |
| `src/game/enemies/bat.ts` | Same |
| `src/game/enemies/skull.ts` | Same |
| `src/game/enemies/movement.ts` | `hitboxFor` already correct; no change needed |
| `src/game/collision.ts` | 2-frame gate, grace period, scale hitbox before diff; export `lastMotionPixels` |
| `src/game/loop.ts` | Use 320×180 motion canvas; call `calibrateDiffThreshold` before loop; pass `displayW/H` to `resolveHits` |
| `src/game/render.ts` | Debug overlay: hitboxes + motion dots; `toggleDebug()` |
| `src/main.ts` | Register `keydown` listener for `D` key |
