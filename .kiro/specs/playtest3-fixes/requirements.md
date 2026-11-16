# Playtest 3 Fixes — Requirements

## Scope

Amit's third real-webcam playtest (6:15 screen capture of the live site at
`main` `d693a3d`, 1 player, 1920 × 906 window) won the full run: all six stages,
YOU WIN at 5:35 with 116575 points and two hearts lost. It found two problems.
Each one gets a root cause in `design.md`, found by reading the code and pinned
by a failing test before the fix. Builds on `playtest2-fixes/` (skull zones and
grace, end screens), `playtest1-fixes/` (name screen, end-screen delay),
`waves/` (paths), `more-content/` (new ghosts) and `playtest-polish/` (reduced
flashing).

Out of scope: balance numbers, new enemy types, audio, the boss, the 2P rules,
the name-screen look (see the unconfirmed observations in `design.md`).

Verified fine, not changed (PR #12 fixes confirmed on a real webcam): the danger
ring with "!" and the MISSED call-out, skulls entering from the side, the skull
grace ring, the countdown ticks, the end-screen music bed, the confirm blips.

---

## R1 — Bright flash when the name screen closes on the victory screen (video 5:44.65–5:45.0)

**R1.1** Each end screen (1P YOU WIN, 1P GAME OVER, 2P final) plays its intro
once per arrival: the backdrop fades in and the banner wobbles in. Closing the
name screen or the card preview returns to the same screen with the backdrop at
its full alpha and the banner at rest. The intro never replays.

**R1.2** The backdrop alpha of an end-screen visit never drops from one rendered
frame to the next, at any frame rate, including across a name-screen or
card-preview round trip.

**R1.3** The reset that runs when the name screen closes restarts only the
buttons (lock-out and fill state), so the hand that pressed OK presses nothing
else. A new arrival at an end screen (new run, play again, new 2P game) resets
the intro as before.

**R1.4** No dark → bright → dark flash occurs, so the reduced-flashing setting
is not bypassed. GAME OVER keeps its constant backdrop.

## R2 — A skull hidden in a bat swarm (video 3:48.9–3:49.4, stage 4)

**R2.1** While a skull is on screen, no newly spawned path enemy (ghost, bat,
pumpkin, candy; flyby, swarm, line, arc or drop, with its sway) passes within
`skullClearancePx` of the skull's lane: the corridor from its entry edge to its
hover point, including the hover rect. The clearance is one hand radius plus
one skull hitbox width (capped at 20 % of the area height on very small areas).

**R2.2** A skull never picks a hover row whose corridor is within the clearance
of the remaining path of an enemy already on screen. If no candidate row is
clear it waits and tries again on a later tick.

**R2.3** A spawn that cannot be made clear is thinned, re-rolled (a scripted
event gives up its fixed height after a few tries) or, when nothing fits, waits
for the skull to leave. A scripted event is never lost.

**R2.4** The rules apply per area: each 2P half and every stage with skulls
(stage 6 included). Skulls stay a real hazard for a careless swat: grace, hover
time, hitbox and hit rules are unchanged.

**R2.5** The demo sims at seed 5 stay clean (no skull hit, no game over).

## R3 — Docs

**R3.1** `docs/KIRO.md` and the README keep the historical figure "119 property
tests (`fc.assert`) in 31 files (at `df26f4d`)" and add the current count from
`grep -rh 'fc\.assert' src tools | wc -l` and `grep -rl ... | wc -l` (it was 178
in 50 files before this spec). Spec list, test counts and test history: PR #12
is merged as playtest2-fixes (merge commit `d693a3d`, 1887 tests) and a
playtest3-fixes row (PR #13, this branch) is added. Credits get the row
"After playtest3-fixes (PR #13)" with the figure left for the operator; the
playtest2-fixes row stays 928.32 and the README keeps its 928.32 line. The
README specs tree lists `playtest3-fixes/`. `tools/judge-docs.test.mjs` passes.
No trademark names, no network calls, the privacy line is unchanged.

---

## Acceptance criteria
1. `npm test` and `npm run build` pass after every task; existing tests pass.
2. Property tests: end-screen backdrop alpha never drops at any frame step (1P victory, 1P game over, 2P final) and is full on the first frame after a name or card round trip; with an active skull no new path enemy comes within the clearance of its lane; a skull never picks a row an on-screen lane occupies.
3. Demo `seed=5` sims stay clean.
