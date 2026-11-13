# Waves — Requirements (P1)

## Scope

Today every ghost, bat and pumpkin spawns on a random edge and walks in a straight
line to a point within 120 px of the centre; spawn rate is a flat random timer for
the whole stage. Every stage therefore plays the same way. This spec adds
data-driven wave scripts (path types, scripted set pieces), a difficulty curve
inside each stage, and a short bonus round between stage 2 and stage 3.

Builds on `stages/` (R2 stage config, R5 lives), `feel-fix/` (deltaMs-based,
canvas-height-scaled movement; skull lifecycle), `pbt/` (property tests, spawner
cap and skull uniqueness) and `boss-phases/` (the boss stage keeps its own
spawning; lunger and skull behaviour are unchanged).

---

## R1 — Path types

**R1.1** Enemies move along one of five path types:
`line`, `arc`, `flyby`, `drop`, `swarm`.

**R1.2** `line` — edge to a point in the play area (x 20–80 %, y 25–75 % of the
canvas), not the centre. `arc` — the same, along a curve that bulges toward the
canvas centre. `drop` — enters above the top edge and falls (fast, then slowing)
to a landing point in the play area. It costs a life only when its fall time is
up, and that takes at least 1.8 s on any canvas size (R1.5). A `line` / `arc` walk is at least 0.85
canvas heights long, so even the fastest stage 1 ghost needs about 4 s to cost
a life. The bound is constructed, not sampled: a random target that is too close
is replaced by the point 0.85 H away in the same direction (clamped to the play
area, else the farthest play-area corner). On canvases too narrow to reach 0.85 H
(portrait windows) the walk is the longest one the play area allows.

**R1.3** `flyby` — crosses the canvas edge to edge (left→right or right→left) at a
chosen height (15–80 % of the canvas height, several heights per wave; end points are clamped into that band after jitter), never
aimed at the centre, and leaves the screen on the other side. Swarm lanes are
clamped to the same 15–80 % band, so no member is parked off screen.

**R1.4** `swarm` — a small cluster (3–5) of flyby members moving together in
separate lanes (small lateral offsets, ±5 % speed). Lanes stay distinct after
clamping: the lead's centre is kept inside the band by the lane spread.

**R1.5** Every path is a pure function of the enemy's accumulated path time
(`pathMs`, advanced by `deltaMs`) and the canvas size. Positions are identical
whatever the frame rate (R6) and every distance, speed and amplitude is in canvas
heights, so the same wave plays the same on any canvas size.

**R1.6** Every path position stays within the canvas extended by the off-screen
margin (`max(0.12 × H, 64)` px) for the whole life of the enemy.

---

## R2 — Threat rules

**R2.1** Ghosts and pumpkins on `line`, `arc` or `drop` paths end inside the
canvas; reaching the end point costs a life exactly as before (stages R5.1, combo
reset).

**R2.2** A path that ends off screen (`flyby`, `swarm`, off-screen `drop`) never
costs a life. The enemy is removed ("culled") once it has left the canvas on the
far side, and at the latest when its path time reaches the path duration. A
flyby is never culled while any part of it is still on screen before that time.

**R2.3** Bats use `flyby` and `swarm` paths only: they are points, not threats
(product: "swatted away for points"). Their path mix may therefore contain only
`flyby` and `swarm`.

**R2.4** Skulls, lunger and the boss keep their existing movement and lifecycle
(feel-fix R2, stages R6.2, boss-phases). Boss-stage minions keep their existing
spawning.

---

## R3 — Wave scripts

**R3.1** Each of stages 1–4 has a wave script in `src/game/waves.ts`, referenced
from `stages.ts` (`StageConfig.waves`). Stage 5 has none and keeps its own
spawning (boss-phases).

**R3.2** A script contains: a path mix per enemy kind (weights for the random
spawner), an ordered list of scripted events
`{ atMs, kind, path, count, height? }`, and an intensity curve (R4).

**R3.3** Scripted events fire once, in order, when the stage clock reaches
`atMs`. A kind that is not enabled in the stage's `enemyMix` is never spawned.
A stage with `spawnEdges: 'leftRight'` never uses `drop` or top/bottom entries.

**R3.4** The enemy cap (`maxEnemies`, boss excluded, exiting skulls excluded) and
the skull rules (at most one non-exiting skull) apply to every spawn, random or
scripted. Scripted events fire before the random timers. A scripted group that
only partly fits is truncated to the free slots; an event with no room (a swarm
needs at least 3 free slots, any other event 1) waits, in order, until there is,
rather than being dropped. The cap is never exceeded.

**R3.5** Scripts are plain data: changing a number never requires touching game
logic.

---

## R4 — Intensity curve

**R4.1** Each script has an intensity curve: piecewise-linear points
`(progress 0–1, level 0–1)` and a `peakAt` progress. It starts calm (level ≤ 0.3
at progress 0), is non-decreasing up to `peakAt`, reaches its maximum at `peakAt`,
and may ease down afterwards (breather before the summary / boss).

**R4.2** Intensity scales the random spawner (timer rate `0.6 + 0.9 × level`) and
the speed of newly spawned enemies (`0.85 + 0.3 × level`). The stage progress is
`(durationMs − roundTimeMs) / durationMs`, clamped to 0–1.

**R4.3** The peaks rise from stage to stage; stage 4, the last before the boss,
peaks at 1.0, near the end of its stage.

---

## R5 — Bonus round

**R5.1** A short bonus round (15 s) plays after stage 2's summary and before
stage 3's title card, configured by `StageConfig.bonusAfter` (data, not code).

**R5.2** The bonus round spawns only harmless enemies: candy (new `candy` enemy
type) and pumpkins that need one hit. They enter on `flyby`, `swarm` or off-screen
`drop` paths and leave the screen.

**R5.3** The bonus round cannot cost a life: no skull, ghost or lunger is ever
spawned, no bonus enemy reaches a target, and the "reached the centre" check is
disabled while `state.bonus` is set. Lives carry through unchanged. The combo
is reset on entering and on leaving the bonus round, exactly as at every other
stage transition (`createInitialState`); within the bonus round it builds on hits
and is never broken by misses.

**R5.3a** Random candy (single or swarm, including a swarm's truncation and its
fallback to a flyby) never takes the last free slot (`maxEnemies − 1`), so bonus
pumpkins and scripted events are not starved by candy the player has not cleared.
Random bonus pumpkins and scripted events may use the last slot.

**R5.4** Candy scores 75 × combo, a bonus pumpkin 200 × combo. Hits extend the
combo as usual. The summary screen follows the bonus round, then the next stage.

**R5.5** The title card and HUD show "Bonus Round — Candy Storm". Retrying after a
game over never starts in a bonus round.

---

## R6 — Frame-rate independence

**R6.1** All timing is `deltaMs`-based: path progress, scripted events, spawn
timers, intensity. Splitting a duration into any number of ticks gives the same
enemy position (within 1e-6 × canvas size).

**R6.2** Scaling the canvas uniformly by `k` scales every path position by `k` and
leaves the path duration unchanged.

---

## R7 — Tests

**R7.1** Unit tests: script validation (kinds enabled, events ordered and within
the stage, weights positive, edge rules), path bounds for every type, intensity
curve shape, bonus round harmlessness.

**R7.2** Property tests (fast-check): frame-rate independent positions, canvas
scale invariance, bounds, flyby exit and cull, spawner cap with scripted events,
bonus round never costs a life.
