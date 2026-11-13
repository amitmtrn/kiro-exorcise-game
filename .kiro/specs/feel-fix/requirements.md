# Feel Fix — Requirements (P1)

## Goal
The game must play the same on a 60 Hz, 120 Hz or 144 Hz display and on any
screen size. A ghost crosses a 1080p screen in roughly 4–6 s on stage 1. The
cursed skull visits and leaves. The combo multiplier follows the tiers already
written in `.kiro/specs/stages/requirements.md` R4.

Out of scope (tracked separately): boss attacks/phases and the post-stage-5
ending, lunger hit-only-during-wind-up, the `test-on-save` hook format, and
property-based tests.

---

## R1 — Frame-rate-independent, screen-relative movement

**R1.1** Enemy `speed` is expressed in **canvas heights per second** (unit-less).
Pixel velocity is `speed × canvasHeight` px/s. The old "px per frame at 60 fps"
semantics are removed.

**R1.2** `moveEnemies(enemies, deltaMs, canvasW, canvasH)` advances every enemy
by `velocity × deltaMs / 1000`. Travelling for 1 s of simulated time gives the
same position at 60 Hz, 120 Hz and 144 Hz step sizes (within 2 px at 1080p).

**R1.3** Ghost wobble and bat zigzag are time-based: the sine phase advances in
rad/s and the lateral velocity scales with `canvasHeight`, so they are also
frame-rate independent. A step never overshoots the enemy's target.

**R1.4** Doubling `canvasHeight` doubles the distance covered per second.

**R1.5** Lunger hold distance (where it stops to wind up) scales with
`canvasHeight`; wind-up stays 600 ms of wall time; lunge speed stays 2.5×.

**R1.6** Tuning: on stage 1 (`speedMultiplier` 0.8) a ghost spawned on the left
or right edge of a 1920×1080 canvas reaches the centre ring in 4–6 s. Later
stages are faster through `speedMultiplier` in `stages.ts` (stage 4 ≈ 3.6 s).
Other enemy base speeds keep their previous ratio to the ghost.

---

## R2 — Skull exits

**R2.1** A skull accumulates *on-screen time* while its centre is inside the
canvas. After **4 s** on screen it turns around and leaves: it is flagged
`exiting`, retargeted to a point outside the screen on the side it is nearest
to, and flies out at 1.5× speed.

**R2.2** An exiting skull is removed once it is entirely outside the canvas.
Skulls never park permanently.

**R2.3** An exiting skull does not count as the "active" skull: a new skull may
spawn while one is leaving. At most one *non-exiting* skull exists at a time.

**R2.4** Skulls still cost a life when hit (unchanged), including while exiting.

---

## R3 — Combo tiers (matches stages R4.1–R4.3)

**R3.1** `GameState.streak` counts consecutive banishes since the last reset.
`combo` (the score multiplier) is derived from it:
`streak < 3 → x1`, `3–5 → x2`, `6–9 → x3`, `≥ 10 → x4`. The multiplier never
exceeds x4.

**R3.2** An enemy reaching the centre resets `streak` to 0 and `combo` to x1
(stages R4.2). Losing a life any other way (skull hit) does not change combo.

**R3.3** A hit is scored at the multiplier in force *before* that hit's streak
increment. `bestCombo` is the highest multiplier reached in the stage.

**R3.4** The HUD shows the multiplier bottom-right, hidden at x1 (unchanged;
stages R4.3). Screen shake fires on a scoring hit when `streak ≥ 3`.

---

## R4 — Tests

**R4.1** Movement over 1 s is identical (≤ 2 px) at 60/120/144 Hz for ghost,
bat and straight-line enemies.

**R4.2** Speed scales linearly with canvas height.

**R4.3** Stage-1 ghost crossing time on 1920×1080 is within 4–6 s.

**R4.4** Skull exit timing: still on screen at 3.9 s, exiting after 4 s, culled
once off-screen; off-screen approach time does not count; a leaving skull does
not block a new skull spawn.

**R4.5** Combo boundaries: streak 2→x1, 3→x2, 5→x2, 6→x3, 9→x3, 10→x4, 50→x4;
reset on enemy reaching centre.
