# Boss Phases — Requirements

## Scope

The stage-5 boss (`stages/` T7) is currently inert: it drifts to the centre and
parks, the stage "clears" on the timer whether or not it is alive, defeating it
does not end the stage, and after stage 5 the game silently loops to stage 1.
This spec turns the boss into a 3-phase state machine, makes boss defeat and
timeout end the game properly, adds a victory screen, and makes the lunger
hittable only during/after its wind-up.

Builds on `stages/` (R2.4 stage 5, R5 lives, R6.2 lunger) and supersedes the
per-round 3-hit boss of `boss-combo/` (which is kept for history only). The
10-hit boss health (`BOSS_HITS_NEEDED`) and 1000 × combo defeat score are kept.

Review items already fixed by earlier specs and **not** repeated here:
frame-rate independent / screen-scaled movement and skull despawn (`feel-fix/`),
combo tiers x2/x3/x4 (`stages/` R4.1, `pbt/` R6), Kiro hook format (`hooks/`),
property tests (`pbt/`).

---

## R1 — Phase thresholds

**R1.1** The boss has a phase 1, 2 or 3 derived only from its remaining health
fraction `remaining / hitsNeeded`: phase 1 at ≥ 66 %, phase 2 below 66 %, phase 3
below 33 %. With 10 hits that is phase 2 after the 4th hit and phase 3 after the 7th.

**R1.2** The phase never decreases and increases by at most one step per hit.

**R1.3** Reaching a new phase interrupts the current attack: the boss returns to
its idle drift, its idle timer restarts and an immediate extra summon is queued.
The boss flashes white (existing hit flash) and the screen shakes.

---

## R2 — Phase 1: summoner

**R2.1** The boss enters from the top-centre, descends to a hover height near
the top of the screen (≥ `BOSS_SIZE × 0.75` px, ~20 % of canvas height) and then
drifts left and right along the top in a slow sine sweep.

**R2.2** While idle the boss summons one small ghost every 5 s from its own
position. Minions behave like normal ghosts (wobble toward the centre; reaching
the centre costs a life and resets the combo). At most 3 minions are alive at once.

**R2.3** In phase 1 the boss can be hit at any time (after the spawn grace).

**R2.4** The normal stage-5 ghost spawner is disabled; the boss is the only
source of ghosts in stage 5.

---

## R3 — Phase 2: lunging swipes

**R3.1** After an idle period of 3 s the boss starts an attack: **wind-up →
lunge → recover**, then returns to idle.

**R3.2** Wind-up lasts 600 ms. It is clearly telegraphed: the boss stops, shakes
and glows pumpkin orange (`#ff6b1a`) with a pulsing ring; a "!" appears above it.

**R3.3** After the wind-up the boss lunges in a straight line to the centre of
the screen at ~1.0 canvas heights per second. If it gets within the centre
threshold (40 px) the player loses a life, the combo resets, the screen shakes,
and the strike counts at most once per lunge.

**R3.4** After a strike the boss lingers for 1.2 s ("recover"), then returns to
its hover height and idle drift.

**R3.5** In phases 2 and 3 the boss is **vulnerable only during wind-up, lunge
and recover**. While idle it is shielded: drawn with a translucent bubble and
hits are ignored (the 2-frame hit gate is reset).

**R3.6** A hit during wind-up or lunge staggers the boss: the attack is cancelled
and it enters recover without striking.

**R3.7** Phase-2 summons continue every 6 s, only while the boss is idle
**and on its hover line**. A summon that falls due while the boss is flying home
from the centre (for example after a phase change during recover) stays queued
until it arrives, so minions never spawn on top of the player at the centre.

---

## R4 — Phase 3: enrage

**R4.1** Phase 3 uses the same attack cycle with: idle 1.5 s, wind-up 350 ms
(still visibly telegraphed), lunge ~1.5 canvas heights per second, recover 700 ms.

**R4.2** The boss summons **2** minions every 3.5 s, with a cap of 5 alive.

**R4.3** Enrage visuals: red-orange aura (`#c0392b`), faster sway, health bar label "ENRAGED".

---

## R5 — Hit pacing

**R5.1** After each boss hit the boss ignores further hits for 400 ms, so a
continuous wave cannot drain all 10 hits in a fraction of a second.

**R5.2** The boss health bar shows tick marks at the 66 % and 33 % thresholds
and the current phase.

---

## R6 — Defeat, timeout, victory

**R6.1** On the boss's final hit the stage ends **immediately**: remaining
minions are cleared, the 1000 × combo bonus is awarded, the existing particle
burst, orange-ish flash, shake and fanfare play.

**R6.2** If the defeated boss was in a non-final stage the phase becomes
`summary`. In the final stage (stage 5) the phase becomes `victory`.

**R6.3** The `victory` screen shows "YOU WIN!", the **total score** (carried
across all stages), the best score if higher, and "Play Again" / "Main Menu"
motion buttons (labels "PLAY AGAIN" / "MAIN MENU"). The buttons ignore motion for
1.5 s after the game enters `victory` (the lockout is keyed off the phase
transition, not the render clock, so a backgrounded tab does not restart it). Both reset to a fresh game from stage 1 (Play Again goes
straight to the stage-1 title card). The high score is saved.

**R6.4** After the final stage the game never loops to stage 1 on its own:
`advanceToNextStage` from the last stage yields `victory`, not stage 1.

**R6.5** If the stage timer reaches 0 while a boss is alive the phase becomes
`gameover` (not `summary`). The normal game-over screen offers "Retry Stage".

**R6.6** If the boss is defeated and the timer would expire on the same tick,
the defeat wins (victory). If the last life is lost on the same frame as the final hit, game over wins:
the boss stays alive and the 1000-point bonus is not awarded.

---

## R7 — Lunger vulnerability

**R7.1** A lunger is hittable only while its `movePhase` is `windup` or `lunge`.
During `approach` hits are ignored and the hit gate is reset.

**R7.2** An approaching lunger is drawn translucent so the player can tell it is
not yet hittable; the wind-up glow is unchanged.

---

## R8 — Constraints

**R8.1** All art is procedural canvas drawing (no image assets). No new audio
files (existing procedural SFX are reused), no network fetches, no new runtime
dependencies.

**R8.2** Boss logic is pure and unit-testable (no DOM, no canvas) and
frame-rate independent (`deltaMs`-based).

**R8.3** Unit tests cover every phase transition, defeat → victory and timeout →
game over, shielded/vulnerable windows, lunger vulnerability; property tests
cover phase monotonicity and frame-rate independence of the boss timers.
