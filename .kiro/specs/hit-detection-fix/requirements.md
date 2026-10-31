# Hit-Detection Fix — Requirements (P0)

## Goal
Swatting must feel right. Standing ~1 m from a laptop webcam, a swat at a ghost
on either side of the screen must banish it within ~0.2 s. Standing still for
10 s must produce zero false hits.

---

## R1 — Mirror parity

**R1.1** `captureFrame` in `src/webcam/diff.ts` must draw the video frame with
the **same horizontal mirror transform** used by `drawWebcamFrame`
(`translate(width, 0)` + `scale(-1, 1)`), so that a pixel at screen coordinate
(x, y) in the displayed image corresponds to the same pixel (x, y) in the
motion-capture image.

**R1.2** A unit test must verify this: given a pixel drawn on the **left** side
of a mirrored capture canvas, `computeFrameDiff` with a hitbox covering that
left region returns `true`; a hitbox covering the right region returns `false`.

---

## R2 — Enemy coordinate system

**R2.1** Enemy `x` and `y` represent the **center** of the enemy sprite in
canvas coordinates. All existing code that treats them as the top-left corner
must be corrected.

**R2.2** The hitbox `{ x, y, w, h }` top-left must always equal
`{ cx - w/2, cy - h/2 }` where `cx, cy` is the enemy center.

**R2.3** The "reached center" check in the game loop must compare the enemy
**center** (`enemy.x, enemy.y`) to `enemy.targetX, enemy.targetY`, not the
hitbox corner.

---

## R3 — Fixed-size motion canvas

**R3.1** Motion detection runs on a dedicated off-screen canvas fixed at
**320 × 180 px** (16:9), independent of the display canvas size.

**R3.2** Each tick, the video is drawn mirrored into this small canvas
(same transform as R1.1, but at 320 × 180).

**R3.3** Before calling `computeFrameDiff`, hitbox coordinates from display
space are scaled into motion-canvas space:
```
motionX = hitbox.x * (320 / displayW)
motionY = hitbox.y * (180 / displayH)
motionW = hitbox.w * (320 / displayW)
motionH = hitbox.h * (180 / displayH)
```

**R3.4** `computeFrameDiff` always receives `canvasWidth = 320`.

---

## R4 — Noise reduction and fairness

**R4.1 — 2-frame confirmation.** A hit is only registered when
`computeFrameDiff` returns `true` for **2 consecutive frames** (or any 2 frames
within a 100 ms window). A single noisy frame does not count.

**R4.2 — Spawn grace period.** No hit is registered on an enemy during the
first **300 ms** after it is spawned (enemy `spawnedAt` timestamp vs `now`).

**R4.3 — Hitbox enlargement.** All hitbox dimensions are increased by **20%**
(multiply `w` and `h` by 1.2, keep centered) so that near-misses still
register.

**R4.4 — Auto-calibration.** On game start, the loop measures background
luminance variance for **1 second** (capturing frames but not checking hits),
then sets `DIFF_THRESHOLD` to `backgroundNoise * 2.5` (minimum 15, maximum 60).
This adapts to dim or bright environments automatically.

---

## R5 — Debug overlay

**R5.1** Pressing `D` toggles a debug overlay on `#game-canvas`.

**R5.2** While active, the overlay draws:
- Each enemy's hitbox as a semi-transparent colored rectangle
  (green = eligible, yellow = in grace period).
- The motion mask: for each sampled pixel that exceeded `DIFF_THRESHOLD` in the
  last frame, draw a small bright dot at the corresponding **display** position.

**R5.3** The debug overlay has no effect on game logic.
