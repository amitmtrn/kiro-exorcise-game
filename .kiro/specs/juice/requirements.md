# Juice — Requirements

## Scope

A swat currently ends in a puff and a "+N" label. This spec makes a hit *feel*
like a hit: the direction of the player's swipe is estimated from the motion
mask, the banished enemy is knocked away along it (spinning and fading), the
game freezes for a beat on impact, combo tiers get call-out text, and stages
open and close with short animations. Everything is procedural canvas art and
Web-Audio-free: no new assets, no new dependencies, no network.

Builds on `spooky-skin/` (shake, white flash, score pops), `feel-fix/` and
`pbt/` (every effect is `deltaMs`-based and frame-rate independent),
`stages/` R4 (combo tiers x2/x3/x4) and `boss-phases/`. Hit detection itself
(`computeFrameDiff`, the 2-frame gate, thresholds) is **not** changed.

---

## R1 — Swipe direction estimation

**R1.1** For every enemy whose hit gate sees motion, the centroid of the
moved pixels inside its hitbox is recorded for that camera frame. When the
gate confirms a hit, the swipe vector is the shift between the centroid of the
previous gate frame and the centroid of the confirming frame, in display
space (+x right, +y down).

**R1.2** The result is a unit vector plus a magnitude (display px). If the
shift is smaller than 1 % of the canvas height the vector falls back to
"radial": from the current centroid to the enemy centre (the hand pushes the
enemy away). If that is also degenerate it falls back to straight up. The
estimate never returns NaN and its vector always has length 1.

**R1.3** Mirror-correct: motion coordinates are already in display
orientation (the motion canvas is captured mirrored), so a hand moving right
on screen yields `dx > 0`. Mirroring a mask horizontally negates `dx` and keeps
`dy`; mirroring twice is the identity.

**R1.4** Estimation uses only the sampled points of the frames the gate
already inspects. It must not add a second whole-frame pass; only enemies with
motion in their hitbox pay for the centroid.

**R1.5** Duplicate camera frames (`frameIsNew === false`) leave the stored
centroids untouched, like the gate counters (tech.md "Camera frame rate").

---

## R2 — Knock-back

**R2.1** A banished ghost, lunger, bat, candy, pumpkin (final hit) or boss is
not removed instantly: a *knock* (a visual copy of the enemy) flies off along
the swipe vector while spinning and fading. Cursed skulls keep their existing
puff (they are a penalty, not a reward).

**R2.2** Knock speed is `KNOCK_SPEED × canvasHeight` px/s, scaled by swipe
strength clamped to [0.6, 1.5]. Position is the closed-form drag trajectory
`p0 + v0 · (1 − e^(−k t)) / k`, so it depends only on the knock's age, never
on how that age was split into steps.

**R2.3** Knock lifetime is 600 ms. Alpha falls monotonically from 1 to 0,
scale shrinks monotonically from 1 to 0.4, the angle advances at a constant
spin rate whose sign follows the horizontal swipe direction. A knock is removed
once its age reaches its lifetime.

**R2.4** The displacement of a knock from its origin always points along the
swipe vector (dot product with the unit vector ≥ 0, equal to the distance
travelled) and its distance never decreases with age.

**R2.5** Knocks are game-time: they age with the simulation delta (frozen
during hit-stop) and keep ageing on the summary and game-over screens so none
are left stuck.

**R2.6** Rendering reuses the enemy draw routines (no new sprites).

---

## R3 — Hit-stop

**R3.1** Every scoring banish freezes game time for `HITSTOP_MS` = 60 ms.
Overlapping hit-stops do not add up: the remaining freeze becomes the max of
the old and new value.

**R3.2** While frozen, enemy movement, spawning, the round timer, boss
timers, particles, knocks and call-outs do not advance. The webcam draw, the
motion capture, motion buttons and hit detection keep running (input is never
blocked) and rendering continues every tick.

**R3.3** Frame-rate independent: the total frozen time of one hit-stop is
exactly 60 ms whatever the step sizes (30, 60, 144 Hz, a 100 ms stall). A step
that crosses the end of the freeze advances the simulation by only the
remainder, so `frozen + live = deltaMs` for every step.

**R3.4** A freeze never outlives its game: hit-stop is cleared when a stage
starts and ignored outside `playing`.

---

## R4 — Combo call-outs

**R4.1** When a banish raises the combo multiplier, a call-out `x{N} COMBO!`
(slime green) appears at the enemy.

**R4.2** Otherwise, at combo ≥ x2 and on every second streak count
(`streak % 2 === 0`), a praise word appears: x2 → `NICE!`, x3 → `GREAT!`,
x4 → `PERFECT!`. Combo x1 never shows a call-out. Selection is a pure
function of (previous combo, new combo, streak).

**R4.3** A call-out pops in (scale overshoot), rises and fades over 900 ms of
game time, is kept inside the canvas, and at most 3 are alive (oldest dropped).

**R4.4** Typography follows design.md: chunky glowing display font, palette
colours only.

---

## R5 — Stage intro / outro

**R5.1** Intro: during the stage title card the stage name slides in from the
left, the subtitle from the right (overshoot ease), and everything fades out
over the last 300 ms. The pose is a pure function of elapsed ms and total ms.

**R5.2** Outro: on the summary screen the dark overlay fades in over 500 ms
and the `STAGE CLEAR!` (or `BONUS CLEAR!`) banner drops in with a wobble that
settles within 900 ms; the stat rows fade in staggered afterwards. The pose is a
pure function of `summaryShownMs`.

**R5.3** Motion buttons keep working during the animations and are never
delayed; animations only change how the existing text arrives.

---

## R6 — Constraints

**R6.1** All timing is `deltaMs`-based; no per-frame counters are introduced.

**R6.2** Procedural canvas only; no new runtime dependencies, assets, audio
files or network fetches; existing tests keep passing.

**R6.3** New logic is pure and unit tested; invariants (unit swipe vector,
mirror symmetry, knock monotonicity, hit-stop conservation, call-out
selection) also get fast-check properties.
