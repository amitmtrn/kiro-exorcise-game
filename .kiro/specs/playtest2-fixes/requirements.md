# Playtest 2 Fixes — Requirements

## Scope

Amit's second real-webcam playtest (3:39 screen capture of the live site at
`main` `fce349d`, 1 player, built-in webcam, 3024 × 1364 window) played stage 1,
stage 2, the bonus round and stage 3 and ended in a game over in stage 3 with
6 s left (score 58900). It found five problems. Each one gets a root cause in
`design.md`, found by reading the code and pinned by a failing test before the
fix. Builds on `waves/` (paths, reaction window), `stages/`, `feel-fix/` (skull
lifecycle), `more-content/` (new ghosts), `playtest-polish/` (audio bus, gain
table, reduced flash, colour-blind), `playtest1-fixes/` (hearts, grace, motion
buttons) and `music-v2/`.

Out of scope: balance numbers (spawn rates, stage lengths, scores), new enemy
types, audio files, the boss lunge timing (boss-phases R2 keeps its own windup
and pose), the 2P rules.

Verified fine, not changed: one heart per event with a grace period, the death
transition (about 1 s), GAME OVER then the name screen, OK saves the name, the
EXORCIST CARD button and layout, mirroring, frame pacing, audio peak −2.3 dBFS.

---

## R1 — A ghost costs a heart in empty space (video 1:11.8–1:14.5, stage 2)

**R1.1** Every enemy that can cost a heart by arriving (ghost, pumpkin, lunger,
wisp, mirror, blink) shows a telegraph before it does. The telegraph is
`warnMs`, game time (`deltaMs`) spent alarmed while the enemy is on screen. An
enemy is alarmed once its remaining travel time is at most
`TELEGRAPH_LEAD_MS` (1400 ms). It never costs a heart while
`warnMs < TELEGRAPH_MIN_MS` (1000 ms): an enemy that arrives early waits at its
target in the alarmed pose until the telegraph is complete. This holds at any
frame rate.

**R1.2** The telegraph is visible: a danger ring that shrinks onto the enemy
over `TELEGRAPH_MIN_MS`, a red tint and a "!" marker. It never relies on colour
alone: the ring is dashed and the "!" is a shape. With reduced flashing on the
ring is steady (no pulse, no blink). With the colour-blind palette the ring and
mark use the palette's danger colour and the same shapes.

**R1.3** A heart lost by arrival is visibly linked to its cause: a red
"MISSED" call-out appears at the position where the enemy arrived, in 1P and in
each 2P half, also when the heart is protected by the grace window (the combo
still resets).

**R1.4** Threatening line / arc enemies (ghost, pumpkin) end inside the player
zone (the centre of the canvas, `PLAYER_END` box), not at an arbitrary play-area
point. This amends waves R1.2 ("not the centre") and keeps its reaction
window: a line / arc walk never takes less time than a walk of
`MIN_CHORD_H` (0.85) canvas heights at the same nominal speed. A shorter chord
is travelled proportionally slower (speed scaled, duration kept).

**R1.5** Waves R2.1, R2.2, R6 and the bonus-round rule (nothing costs a heart
there) still hold. Positions stay frame-rate independent and scale with the
canvas.

## R2 — A skull homes onto the player's head (video 3:00.4–3:01.0, stage 3)

**R2.1** One function defines the body zone: `bodyZone(W, H)` is the central
column `x ∈ [0.32 W, 0.68 W]`, full height, of the area being played (a 2P seat
passes its half).

**R2.2** A skull's target, its straight path from the spawn point, its hover and
its exit never touch the body zone (hitbox included). Body-zone motion alone
cannot hit a skull.

**R2.3** The skull stays a real hazard: it hovers at the sides of the body zone,
inside the middle of the screen, where a careless swat can reach it.

## R3 — A skull hurts the moment it enters, under the HUD (video 3:18.1–3:18.4)

**R3.1** Skulls never spawn from the bottom edge or the top edge. They enter
from the left or right edge at a height between the top and the bottom HUD
rows.

**R3.2** One function defines the HUD corner rects (`hudRects(W, H)`: hearts
top-left, timer and mute top-right, score bottom-left, combo bottom-right). A
skull's spawn point, path and hover never intersect them.

**R3.3** A skull has a spawn grace of `SKULL_GRACE_MS` (1000 ms, at least the
required 800 ms). The grace starts when the whole hitbox is on screen. While it
runs, touching the skull costs nothing and does not remove it. The danger ring of
R1.2 shows during the grace.

## R4 — Silence after death, silent motion buttons (video 3:18.8 to the end)

**R4.1** Game over plays an original procedural sting (`gameOver`) exactly once
per game over (1P, boss timeout, 2P when the game ends for both seats). Music
stops as before.

**R4.2** A short, soft `uiConfirm` SFX plays exactly once whenever a motion
button fires its action, on every screen, in 1P and 2P (start, summary, game
over, victory, name, card preview, 2P end screens, seat card button).

**R4.3** Optional ambient bed: the title music loops on the game over and victory
screens once the sting has played, so the end screens are not silent.

**R4.4** Every new sound goes through the existing master bus (gain → compressor →
limiter) and has an entry in the per-sound gain table. The stack-safe rule of
playtest1-fixes (any three stacked SFX plus the music peak stay under 0 dBFS) holds
for the new sounds and is tested. No audio files, no copyrighted material.

## R5 — Silent countdown between stages (0:59–1:04, 2:00–2:04, 2:23–2:26)

**R5.1** On every stage title card (stage 1, stage 2, the bonus round, stage 3 and
later, 1P and 2P) a short `countTick` plays once per number (3, 2, 1) and a
`countGo` accent plays once when play begins. Retrying a stage and starting a new
game play them again.

## R6 — Docs

**R6.1** `docs/KIRO.md`: spec list, test count history row for playtest2-fixes
(figure left for the operator), credits table: the row "After playtest1-fixes"
becomes "After playtest1-fixes (PR #11)" with 868.84, and a new row "After
playtest2-fixes" is added. README "Built with Kiro": PR #11 is merged
(playtest1-fixes, merge commit `fce349d`, 1853 tests), playtest2-fixes with its
test count, credits line "868.84 Kiro credits used after the playtest1-fixes
spec (PR #11)", specs tree. `tools/judge-docs.test.mjs` passes. No trademark
names, no network calls, the privacy line is unchanged.

---

## Acceptance criteria
1. `npm test` and `npm run build` pass after every task; existing tests pass (changed only where a rule above changed: waves R1.2 end points).
2. Property tests: no threatening enemy costs a heart with `warnMs < 1000` at any frame rate; skull targets and paths never enter the body zone or the HUD rects and never start on the bottom edge; a skull in its grace costs nothing; stack safety includes the new SFX.
3. Regression tests: a motion-button fire plays `uiConfirm` once; game over plays the sting once; the countdown ticks once per number.
4. Demo `seed=5` sims stay clean.
