# Two Player — Requirements

## Scope

A local two-player split-screen mode on the **same single webcam**. The
mirrored camera view is split into a left and a right half; each player plays
only in their own half with their own enemies, spawners / waves, score, lives,
combo / streak tiers, hit-stop, knock-back, call-outs and HUD. Single-player is
not changed.

Builds on `stages/` (stages, lives, combo tiers), `waves/` (spawner scripts),
`juice/` (knock, hit-stop, call-outs), `boss-phases/` (boss, victory) and
`hit-detection-fix/` (mirror parity of motion and display). All of those rules
apply **per half**; this spec only adds what is new.

Out of scope: more than two players, per-player cameras, online play, MediaPipe
hand tracking, persisting scores.

---

## R1 — Halves and mirror mapping

**R1.1** The play area is split at `W / 2`. Half 0 (left) is `x ∈ [0, W/2)`,
half 1 (right) is `x ∈ [W/2, W)`. Every game coordinate (enemy position, spawn
edge, target centre, boss sway) is expressed **relative to its own half**
(`0 … W/2`), so a half behaves exactly like a canvas `W/2` wide and `H` high.

**R1.2** Mirror-correct ownership. The motion frame is captured mirrored, like
the display (`hit-detection-fix/`). Player 1 owns the **left** half of the
mirrored view: a person standing on their own left in the room appears on the
left of the screen and plays the left half. A camera pixel at raw column `c`
(un-mirrored, width `w`) belongs to half 0 iff its mirrored column `w − 1 − c`
is in the left half, i.e. raw columns in the right half of the sensor image
belong to player 1.

**R1.3** Motion crop. The 320 × 180 motion frame is cut into two 160 × 180
frames (columns 0–159 and 160–319). Each half's hit detection (frame differencing,
swipe centroid, hit gate) sees **only its own columns**. Hitboxes are scaled with
the half's own scale (`160 / (W/2)` horizontally, `180 / H` vertically).

**R1.4** No cross-half hits. Motion anywhere in one half never registers on an
enemy in the other half, whatever the hitbox position, size or overhang. A hitbox
that overhangs the half edge samples nothing outside its half.

**R1.5** A visible divider line is drawn down the middle of the screen, over the
webcam and below the HUD text, in Pumpkin Orange (`#ff6b1a`) with a soft glow.

---

## R2 — Independent per-player state

**R2.1** Each player has their own `GameState`: lives (3), score, streak,
combo tier (x1–x4), best combo, enemies, particles, score labels, knocks,
call-outs, hit-stop, shake, flash, spawn timers and wave script position.
A change to one player never changes the other player's state.

**R2.2** Hit-stop is per player: a banish freezes only that player's half
simulation; the other half and the shared stage clock keep running.

**R2.3** Speeds are scaled by canvas height and positions lie inside the half's
width (`feel-fix/`). Enemy spawn edges, the "reaches the centre" target and the
skull / lunger rules use the half's centre (`W/4` from the half's left edge).

**R2.4** The HUD is drawn per half, in that half's coordinates: hearts, score,
combo, stage label and timer, with a small "P1" / "P2" tag. A single mute button
is drawn at the top centre of the screen (the half HUDs do not draw one).

**R2.5** The high score is not updated by two-player games and never saved
(`localStorage` is read for the title screen only, as today).

---

## R3 — Stages, timer and boss

**R3.1** Both players play the same stage with the **same stage timer**. The
timer counts down on the real `deltaMs` (not paused by either player's hit-stop)
and is shown identically in both halves.

**R3.2** Each player has their own spawners and wave script; the scripts are
driven by the shared stage clock, so intensity rises for both at the same moment.

**R3.3** Boss stage (stage 5): each half gets its **own boss instance** with the
full 10 hits, spawned in the centre of that half. The boss keeps its normal pixel
size and phases (`boss-phases/`); its sway, hover position, lunge reach and
minion spawning are computed from the half's width and the screen height, so it
fits in the half. Defeating the boss ends that player's stage ("cleared") and
awards the normal 1000 × combo bonus to that player only.

**R3.4** Stage flow is shared. Stage title, stage summary and bonus round are
shown to both halves at the same time; the next stage starts for every player who
is still in the game when the shared summary ends (auto-advance or motion NEXT).

---

## R4 — Players out, round and game end

**R4.1** A player who loses all lives is **out**: their half stops spawning and
simulating (no enemies, no timers) and shows a large "OUT" banner with their
final score. The other player keeps playing undisturbed.

**R4.2** A player whose boss is defeated is **cleared** for the stage: their
half stops spawning and shows "CLEARED" until the shared stage ends.

**R4.3** The stage ends when every player who is not out has finished (timer at
zero, or boss defeated). A player whose timer expires with a live boss is out
(`boss-phases/` R6.5, per player).

**R4.4** The game ends (end screen) when both players are out, or after the final
stage is finished. It does not end while at least one player can still continue.

**R4.5** Players who are out at the start of a later stage stay out for the rest
of the game.

---

## R5 — End screen and winner

**R5.1** The end screen shows both final scores ("PLAYER 1" / "PLAYER 2") and
declares the winner (higher score), or "IT'S A TIE!" when the scores are equal.
Being out does not by itself decide the winner; the score does.

**R5.2** The end screen offers "PLAY AGAIN" (same mode, new game) and "MAIN MENU"
(back to the start screen) as motion buttons, with the same input lock-out as the
victory screen so a wave that ended the game cannot trigger them.

---

## R6 — Mode selection

**R6.1** The start screen offers two motion buttons, "1 PLAYER" and "2 PLAYERS".
Waving over a button starts a game in that mode. The 1 PLAYER button stays where
the old START button was.

**R6.2** Keys `1` and `2` select the mode and start the game from the start
screen. Space starts in the currently remembered mode.

**R6.3** The last chosen mode is remembered **for the session only** (in memory;
no `localStorage`, cookie or URL) and is highlighted on the start screen. The
default is 1 player. "Play Again" and "Main Menu" keep it.

---

## R7 — Single-player unchanged

**R7.1** In 1 PLAYER mode the game plays exactly as before: same state machine,
same full-width canvas, same HUD, same screens, same scoring and high-score
saving. All existing tests pass unchanged. Returning to the title screen never
starts a game by itself: the start-screen buttons ignore motion for 1 s after the
screen is (re)entered.

**R7.2** `resolveHits` / `scaleHitbox` keep their current behaviour when called
without the new optional motion-width argument.

---

## R8 — Constraints

**R8.1** All gameplay timing is `deltaMs`-based; no per-frame counters are added.

**R8.2** Privacy: no network, no storage of video or images. The cropped motion
frames are transient in-memory buffers, as the full motion frame already is.

**R8.3** Procedural canvas art and existing procedural SFX only; no new assets, no
new runtime dependencies (`fast-check` is already a dev dependency).

**R8.4** Half logic (geometry, crop, session reducers, winner) is pure and
unit-testable (no DOM, no canvas).

**R8.5** Tests cover: half assignment and mirror mapping for motion and hitboxes,
no cross-half hits (property test with random hitboxes and motion masks),
independent lives / score / combo per player, player-out behaviour, winner / tie
selection, mode selection, and that 1P mode is unaffected.
