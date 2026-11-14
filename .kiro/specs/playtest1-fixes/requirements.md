# Playtest 1 Fixes — Requirements

## Scope

Amit's first real-webcam playtest (screen capture of the live site at `main`
`8462694`, 1 player, built-in webcam) found seven problems. Each one gets a
root cause in `design.md`, found by reading the code and reproduced by a
failing test before the fix. Builds on `feel-fix/`, `boss-phases/`,
`motion-ui-ergonomics/`, `more-content/` (name screen), `exorcist-card/`,
`two-player-card/` and `playtest-polish/` (adaptive quality).

Out of scope: balance numbers (spawn rates, stage lengths), new enemies, audio
assets, the 2P rules themselves.

---

## R1 — Instant game over (video 2:55, stage 3, 3 of 3 hearts, then the name screen)

**R1.1** One hit or miss costs at most one heart. Enemies that reach the
target in the same tick, a skull hit and a boss strike are separate events but
share one grace window (R1.2).

**R1.2** After a heart is lost the player is protected for `LIFE_GRACE_MS`
(1000 ms of game time, `deltaMs`-based). Any further life loss inside the window
is ignored (the enemy or skull is still removed). Lives never drop by more than
1 inside the window.

**R1.3** The loss is visible: the hearts shake and flash for `LIFE_FX_MS`
(700 ms). With reduced flashing on, the shake amplitude is reduced and the
hearts do not blink (steady highlight only).

**R1.4** Game over is reached only at 0 hearts (or the boss timeout, `boss-phases`
R6.5). With lives above 1, no single tick can reach `gameover`.

**R1.5** A game over starts with a death transition of `DEATH_MS` (1000 ms,
`deltaMs`-based): the play field freezes, the hearts show 0 with the
loss effect, nothing scores and no screen with buttons is shown. `gameover`
state always carries this transition (also the boss timeout and a 2P seat).

**R1.6** The GAME OVER (or YOU WIN) screen is shown first. The name screen opens
only `NAME_DELAY_MS` (1500 ms) after that screen appeared, never straight from
play, in 1P and in 2P.

## R2 — Motion buttons fill but do not fire (name screen OK, card CLOSE)

**R2.1** Every interactive button on the end screens (game over, victory, name
entry, card preview; in 1P and in each 2P half) has a motion zone equal to its
drawn circle, and fires its action exactly once when its ring is full.

**R2.2** When one hand covers two neighbouring buttons, the one with the larger
moved area wins the frame; the other does not fill. A neighbour that is clipped
by the hand never steals the press (and never fires its own action instead).

**R2.3** An open preview or name screen never lets a button fire an action that
is not visible on screen (R3.2 for the name screen).

## R3 — Name entry flow

**R3.1** The name screen shows the generated default name with its first letter
highlighted from the start. **OK finishes naming immediately** (accept the
name as shown); it never moves a hidden cursor.

**R3.2** ◄ / ► change the letter under the highlighted cursor in place. The
default name is kept until a letter is changed. The cursor moves to the next
letter by itself `CURSOR_ADVANCE_MS` (1500 ms) after the last ◄ / ► press, up to
`PICK_LEN` letters. Keyboard typing and Enter work as before.

**R3.3** No extra NEXT LETTER button: a third column slot would sit below the
40 % height line (motion-ui-ergonomics R1.1). The layout keeps three buttons at
raised-hand height (rows A and B in the stacked column, one alone in the other),
in 1P and in each 2P half.

**R3.4** Helper text: `Wave OK to save • ◄ ► change letter • or type and press Enter`
(2P: `OK saves • ◄ ► change letter`). It names no key that is not a letter and
fits its band at every supported size.

## R4 — Exorcist card preview

**R4.1** Each preview button's drawn circle equals its hit zone, including the
mirrored P2 half and the 2P per-player card. No stray zone or ring exists. The
small yellow disc at the card's top-right corner is the card art's moon
(`card/draw.ts`), not a button; that is recorded in `design.md` and checked by a
test that lists every motion circle the preview draws.

**R4.2** Neither the buttons nor their progress rings (`radius + RING_OUTSET`)
overlap the card image, its border or its glow margin, at every canvas size from
640 × 360 to 1920 × 1080 and text scale 1 to 1.5, in 1P and in each 2P half.

## R5 — Mirroring (verification only)

**R5.1** One test proves the display draw, the motion capture, the card photo
and the 2P half snapshot apply the same horizontal mirror, so a hand on the
player's right is drawn on the screen's right and a hit registers where it is
drawn. Code changes only if the test finds an inconsistency.

## R6 — Video stutter (verification, fix only if wrong)

**R6.1** The webcam video is drawn every tick at full canvas resolution at every
quality level; the adaptive level only reduces the motion-diff grid and effects.
A test fixes this; code changes only if it finds throttling.

## R7 — Docs

**R7.1** README controls and name-entry text, README spec table, tree and
counts, `docs/KIRO.md` spec list and counts, and the credits table row
`After playtest1-fixes` (figure left for the operator; the 802.22 row stays).
`tools/judge-docs.test.mjs` passes. No trademark names, no network calls, the
privacy line is unchanged.

---

## Acceptance criteria
1. `npm test` and `npm run build` pass after every task; existing tests pass (changed only where a rule above changed).
2. Property tests: with lives > 1 no tick reaches `gameover`; lives drop by at most 1 inside the grace window; `gameover` always carries the death transition.
3. Regression tests: every end-screen button's zone equals its rect and fires once; OK finishes naming.
4. Demo `seed=5` sims stay clean.
