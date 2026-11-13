# Property-Based Tests — Requirements (P2)

## Goal
Back the unit tests with property-based tests (PBT) that explore far more input
space than hand-written examples: arbitrary event sequences, arbitrary frame
deltas, arbitrary hitboxes. Any real bug a property finds is fixed in the code
and recorded in `tasks.md`.

Out of scope (tracked separately): boss attacks/phases and the post-stage-5
ending, lunger hit-only-during-wind-up, and any change to game balance.

---

## R1 — Tooling

**R1.1** `fast-check` is added as a **devDependency only** (exact version, no
runtime dependency, no network use by the game).

**R1.2** Property tests live in `*.property.test.ts` files next to the code they
test and run under the existing `npm test` (no new scripts or config).

**R1.3** Runs are reproducible: randomness inside the code under test
(`Math.random`) is replaced by a seeded generator derived from a fast-check
generated seed, so a failing counter-example can be replayed.

---

## R2 — Lives

**R2.1** Under any sequence of game events (life lost to a skull, enemy reaching
the centre, hits resolved by `resolveHits`, timer ticks, combo changes, stage
advance), `lives` is an integer and never negative.

**R2.2** `lives` never increases within a run (stage advance carries lives
over; only a fresh game or a retry restores them).

**R2.3** `phase` is `gameover` whenever `lives` is 0 after a life is lost.

---

## R3 — Score

**R3.1** Under any sequence of scoring events, `score` is monotonic
non-decreasing within a run (restart / retry is a new run and is excluded).

**R3.2** `highScore` never decreases and is always ≥ `score`.

---

## R4 — Spawner cap

**R4.1** Over any sequence of spawner ticks with any positive `deltaMs`
(including deltas larger than the spawn interval), on any stage and canvas
size, the number of non-boss, non-exiting enemies never exceeds the stage's
`maxEnemies`, even when several spawn timers expire on the same tick.

**R4.2** The spawner never creates more than one non-exiting skull at a time,
and never creates a type that is not in the stage's `enemyMix`.

**R4.3** The spawner never spawns outside the `playing` phase.

---

## R5 — Mirror parity

**R5.1** Mirroring a hitbox horizontally (`mirrorHitbox`) twice is the
identity; mirroring a point twice is the identity.

**R5.2** A point is inside a hitbox in screen space iff its mirror is inside the
mirrored hitbox in mirrored space.

**R5.3** `scaleHitbox` and mirroring commute (mirror then scale equals scale
then mirror), so display-space and motion-space mirroring agree.

**R5.4** `computeFrameDiff` agrees between a camera frame and the same frame
mirrored left-right when queried with the mirrored hitbox.

---

## R6 — Combo tiers

**R6.1** `comboForStreak(n)` is in `{1, 2, 3, 4}` for every integer `n ≥ 0` and
is non-decreasing in `n`.

**R6.2** Tier boundaries match stages R4.1 (3 → x2, 6 → x3, 10 → x4) for every
`n`.

**R6.3** Under any sequence of `incrementCombo` / `resetCombo`,
`combo === comboForStreak(streak)`, `bestCombo ≤ 4`, and `bestCombo` never
decreases.

---

## R7 — Frame-rate independence of movement

**R7.1** For any enemy type with a straight-line path (pumpkin, skull), any
speed, any canvas size, and any pair of step sizes, simulating the same elapsed
time gives the same position (≤ 1e-6 of the canvas size; ≤ 0.5 px when the enemy has arrived,
because `moveEnemies` stops an enemy within 0.5 px of its target).

**R7.2** For ghost and bat (wobble / zigzag) the same holds within 2 px at
1080p (scaled with canvas height) for 60/90/120/144/240 Hz.

**R7.3** Movement never overshoots the target and never moves an enemy away
from it along the approach axis for straight-line enemies.

**R7.4** Splitting one step into two halves gives the same result as the full
step for straight-line enemies.
