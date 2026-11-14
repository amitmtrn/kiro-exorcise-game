# More Content — Requirements

## Scope

Three groups of new content, one spec:

- **A. New ghosts.** Three ghost types, each with a different motion-counter
  mechanic that works with plain frame differencing (motion inside a hitbox, its
  timing, its position and its amount; no gesture recognition).
- **B. Stage 6 and a finale.** A sixth stage after the stage-5 boss, with its own
  music and a finale boss, and the victory flow moved to the end of stage 6.
- **C. Local high scores.** A top-10 table in `localStorage`, motion-friendly
  name entry (1P and 2P), shown on the title and end screens.

Builds on `stages/` (stage list, combo tiers, lives), `waves/` (spawner, paths,
scripted events), `boss-phases/` (the 3-phase boss, victory flow),
`motion-ui-ergonomics/` (button layout, reach model, entry lock-outs),
`two-player/` and `two-player-card/` (halves, seat flow, per-seat cards),
`demo-mode/` (seeded attract run, persistence switch), `playtest-polish/`
(palette, reduced flashing, settings, text scale) and `music-v2/` (procedural
tracks). Rules from those specs are **not repeated**; this spec only adds to them.

Terms: *telegraph* is the visible cue that precedes a state change or a threat.
*Vulnerable window* is a span of game time in which a confirmed hit banishes the
enemy. *Seat* is one half of a two-player game, simulated like a 1P game.

---

## R1 — Rules shared by every new ghost (group A)

**R1.1** The new ghost types are `wisp` (Twin Wisps), `mirror` (Mirror Ghost) and
`blink` (Blink Ghost). They are normal threats: one that reaches its target costs
a life, resets the combo and counts as missed, exactly like a ghost. A banish
scores, builds the streak, and shows the usual puff, knock, hit-stop and call-out.

**R1.2** **Telegraph.** Every state change of a new ghost is announced by a
telegraph of at least `MIN_TELEGRAPH_MS` = 400 ms (the implementation uses 500 ms)
during which the old rules still apply. The telegraph is part of the state
machine (a named state), never a pure render effect, so tests can prove it.

**R1.3** **Fairness.** A new ghost can always be banished: from the end of the
spawn grace it is vulnerable within at most `MAX_WAIT_MS` (2000 ms) of game time
and the vulnerable window lasts at least `MIN_WINDOW_MS` (1200 ms). A new
ghost needs at least `MIN_TRAVEL_MS` = 4500 ms from its spawn point to the centre
(its speed is derived from the distance, not from a fixed number), which is longer
than the wait plus one window. This holds for every canvas size ≥ 640 × 360 and
every 2P half.

**R1.4** **Timing is deltaMs-only.** Every timer of a new ghost advances by the
`deltaMs` it is given and carries its overshoot into the next state, so the
sequence of states at a given game time does not depend on the frame rate. No
counter counts frames. Hit confirmation still uses the existing camera-frame
gate (`hitFramesRequired`).

**R1.5** **Spawn grace.** The existing 300 ms spawn grace applies. A new ghost
starts in its *safe* state (`blink`: solid, `mirror`: shield, `wisp`: idle) with a
full timer, so nothing changes during the grace.

**R1.6** **Skull clearance.** A new ghost never spawns within `SKULL_CLEARANCE`
(2.5 × the skull hitbox width) of a live skull; the spawn point is re-rolled on
other edges and, failing that, deferred. New ghosts never use red or the skull's
orange as a signal colour, and no telegraph of a new ghost is drawn as a skull
danger cue (red pulse, dashed ring, "!"). Stage 6 stops spawning skulls once the
finale boss is near (R6.1).

**R1.7** **Colourblind redundancy.** Each type has its own silhouette feature and
its own state icon, drawn in every palette, so state and type never depend on
colour: wisps are small round ghosts joined by a link line with a ring timer;
the mirror ghost carries a hexagonal shield with a "▮" bar when closed and a
cracked outline when open; the blink ghost shows a solid body with a "◆" mark
when solid and a dashed outline with a "◇" mark when ethereal. The `cb` palette
gets three extra colours that keep CIEDE2000 ≥ 12 from every other enemy colour
under normal vision, protanopia, deuteranopia and tritanopia.

**R1.8** **Reduced flashing.** No new telegraph strobes. Telegraphs are slow
amplitude ramps; the fastest pulse of any new telegraph runs at ≤ 3 Hz, and at
≤ 1 Hz when the reduced-flash setting is on (`variantPulseHz()`: 1.5 Hz, a quarter of that when reduced). The new
content requests no full-screen flash outside the flash scheduler (the finale
defeat uses the existing flash, which already goes through it). With reduced flashing the mirror's
absorb ring is a dim, fixed-size fade instead of a bright expanding pulse.

**R1.9** **Settings.** The text scale, palette, reduced-flash, mute and quality
settings apply to everything added by this spec (call-outs, tips, banners, the
table and the name screens).

**R1.10** **1P and 2P.** New ghosts live in a seat's `GameState.enemies`. They
are spawned, moved, hit and removed by the same code in 1P and in each half; a
wisp pair never spans the divider (both wisps spawn inside one half). This holds
for king-summoned pairs too: the pair midpoint is clamped so both wisps stay inside
the area, and the pair stacks vertically when the area is narrower than a pair.

---

## R2 — Twin Wisps (`wisp`)

**R2.1** Wisps spawn as a pair (same `pairId`), side by side, on the same edge,
both flying toward the centre with a ghost wobble. They are smaller (80 %) and
take 5.0 s to reach the centre (their target is the exact centre of the area).

**R2.2** *Linking.* The first confirmed hit on either wisp does not banish it. It
becomes **lit** for `TWIN_WINDOW_MS` = 2000 ms: drawn with a bright ring and a
link line to its partner, and a ring timer that shrinks.

**R2.3** *Both hit.* A confirmed hit on the partner while the first is lit banishes
**both** (2 × 150 × combo, one streak step each; both score at the combo in force when the pair was hit, even if the first banish crosses a tier). The partner can be hit at any
time after its own spawn grace, also before the first is hit.

**R2.4** *Re-merge.* The last `TELEGRAPH_MS` (500 ms) of the lit window is the
**merging** telegraph (the ring blinks slowly and the link line pulses; the
wisps keep their course, so their travel time is unchanged). When the window ends unhit, the lit wisp returns to `idle` (nothing is
lost). A wisp in `merging` is still hittable and a hit there still links or
completes the pair.

**R2.5** *Threat.* A pair costs **one** life: when either wisp reaches the centre
the pair is removed and a single life is lost.

---

## R3 — Mirror Ghost (`mirror`)

**R3.1** The mirror ghost spawns **shielded** (state `shield`). While shielded it
cannot be banished. A confirmed hit on a shielded mirror ghost is *absorbed*: a
bright "clink" ring and spark burst on the shield, a soft sound, no score, no
combo loss, no life loss.

**R3.2** The shield **cracks** after `SHIELD_BREAK_HITS` = 2 absorbed hits (hits
within `ABSORB_COOLDOWN_MS` = 300 ms of the previous absorbed hit do not count,
so one swipe cannot count twice) **or** after `SHIELD_MAX_MS` = 1500 ms of
game time, whichever comes first.

**R3.3** *Cracking* (telegraph, 500 ms): the shield shows cracks and a rising glow;
it still absorbs. After it, the ghost is **open** (`OPEN_MS` = 1300 ms) and
can be banished, then **closing** for 500 ms (the shield fades back in; still
hittable), so the vulnerable window is 1800 ms. Then it is `shield` again.

**R3.4** The mirror ghost takes 6.5 s to reach the centre and has a normal ghost
hitbox.

---

## R4 — Blink Ghost (`blink`)

**R4.1** The blink ghost alternates between **solid** and **ethereal** on a fixed
rhythm: solid `SOLID_MS` = 1600, `warnOut` 500, ethereal `ETHEREAL_MS` = 1400,
`warnIn` 500 (period 4000 ms). It starts solid.

**R4.2** It is vulnerable in `solid` and `warnOut` (2100 ms) and invulnerable in
`ethereal` and `warnIn`. Motion over an invulnerable blink ghost does nothing
and resets its hit gate; the ghost keeps moving and is drawn translucent with a
dashed outline.

**R4.3** `warnOut` and `warnIn` are the telegraphs: the outline switches from
solid to dashed (or back) while the body fades by a slow ramp. The rhythm is
visible from the first frame, so a player can predict the next window.

**R4.4** The blink ghost takes 6.0 s to reach the centre, on a straight line with a
slow wobble.

---

## R5 — Stage 6 (group B)

**R5.1** `STAGES` gains stage 6, "Stage 6 / The Midnight Finale", 60 s, after the
stage-5 boss. Stage 5 stays the mid-game boss; defeating it now ends the stage
with a normal summary (phase `summary`) and the game continues. Stage 6 is the
last stage: `victory` is reached only by defeating the finale boss.
design.md justifies this choice against restructuring.

**R5.2** Stage 6 timeline (stage clock = elapsed time of the 60 s round):
a scripted introduction of the three new ghosts, one at a time, starting at 2 s,
one wave of mixed new ghosts at 14 s, and **the finale boss** (R6) at 22 s. No
scripted new-ghost event is scheduled after 17 s (an event still waiting for a
free slot is dropped 3 s after its time, so nothing scripted spawns after 19.5 s),
and no skull spawns after 15 s, so the boss fight starts on a clear field. The
stage cap is 5 enemies.

**R5.3** *Stage title card.* The stage-6 card shows one hint line per new ghost
("TWIN WISPS: hit both", "MIRROR: wave twice, then swat", "BLINK: swat while
solid"), each with the ghost's icon shape. The hint text uses the text scale. With hints, the name and subtitle sit higher and the
countdown digit is placed below the subtitle's measured size, so no two lines overlap at
640 × 360 or larger and text scales 1, 1.25 and 1.5.

**R5.4** *Call-outs.* The first time each new type appears in a stage (also when the Hollow King summons it), a tip
call-out ("HIT BOTH!", "WAVE TWICE!", "WAIT FOR SOLID!") shows next to it for
1.8 s. The finale boss arrival shows "THE HOLLOW KING!" for 2.5 s, 3 s before
the boss enters.

**R5.5** *Music.* Stage 6 plays its own original procedural track `finale`
(`music-v2` format, A-minor scale rules, never below combo tier 2, distinct
bass and lead from every other track). `trackForStage(n ≥ 6)` returns `finale`.

**R5.6** *Cards and screens.* The Exorcist Card and the 2P cards record stage 6
like any other stage (stage reached, score); the card badge for a finale win is
"FINALE CLEARED" in 1P and the existing winner badge in 2P. `YOU WIN!` and the
victory screen are shown after stage 6 only.

---

## R6 — Finale boss: the Hollow King (`boss` with `finale`)

**R6.1** The finale boss is the existing boss state machine (`boss-phases/`)
with `finale = true`: same 10 hits, same phase thresholds, hit i-frames,
shield-while-idle rule and defeat rules. The ghost spawner and the skull spawner
are off from `bossAtMs` − 7 s.

**R6.2** *Telegraphs.* Every wind-up lasts at least 400 ms: phase 2 700 ms, phase 3
450 ms (the stage-5 boss keeps 600 / 350 ms). Lunge speed is 0.9 / 1.3 canvas
heights per second, so the lunge is slower than stage 5 and always beatable.

**R6.3** *Minions are the new ghosts.* Phase 1 summons one blink ghost every
6 s (cap 2); phase 2 summons one wisp pair every 8 s (cap 4 minions, a pair counts
2); phase 3 summons one mirror ghost every 7 s plus a blink ghost every other
summon (cap 3). When the blink does not fit the cap the mirror is summoned alone.
Minions appear beside the boss (`KING_MINION_OFFSET_PX` = 1.1 boss widths, on the side facing the
centre), clear of its sprite on any canvas size, and a summon waits while a live skull is within
the R1.6 clearance of that point. Summons only happen at the hover line, exactly as in
`boss-phases` R3.7, and obey R1.5 (spawn grace).

**R6.4** *Fairness of the fight.* From the moment the boss enters, 38 s remain
(60 − 22). With the stated windows the boss is vulnerable for at least 1800 ms
per attack cycle after every phase change (wind-up + recover: 1800 ms in phases 2 and 3,
pinned by a test); the design.md budget shows a
competent player needs about 20 s. Timeout with the boss alive is game over (as
`boss-phases` R6.5).

**R6.5** *Look.* The finale boss wears a gold crown instead of the witch hat, has
violet-gold aura colours; in the `cb` palette the crown (purple) keeps the distance rule against the boss body, pumpkin and bat eyes, and the
health bar label reads "HOLLOW KING".

**R6.6** *Victory.* Defeating it awards 1000 × combo plus a finale bonus of 2000,
ends the game with `victory`, and plays the fanfare.

---

## R7 — Existing flow updates (group B)

**R7.1** `advanceToNextStage` from stage 5 goes to stage 6 (stage title, lives and
score carried); from stage 6 it yields `victory`. The `stages` table no longer
assumes stage 5 is last anywhere (boss spawn, card, 2P `won` status, demo). The card's
boss moment is taken when a boss on the field last tick is gone and the phase is now
`summary` or `victory`, in 1P and 2P alike (`bossDefeatedSince`).

**R7.2** In 2P, stage 6 runs on both halves like any other stage. A half that
defeats the king reaches `victory`; the other half keeps playing until it wins,
loses or its timer ends (the existing 2P rules).

**R7.3** Onboarding: the how-to text lists the new ghosts in one line ("Later
stages bring twin wisps, mirror ghosts and blinkers") and nothing else about it
changes.

---

## R8 — High-score storage (group C)

**R8.1** The table lives in `localStorage` key `exorcise-highscores` as JSON: an
array of at most 10 entries `{ id, name, score, stage, date, mode }` where `name`
is 1–8 characters of `A–Z 0–9 -`, `score` an integer ≥ 1, `stage` an integer
1–6, `date` a `YYYY-MM-DD` string, `mode` `"1P"` or `"2P"`. Nothing else is
stored: **never video, images, or any camera data**.

**R8.2** Sorted by score descending; equal scores keep the older entry first.
A score qualifies when the table has fewer than 10 entries or it beats the last.

**R8.3** Loading validates every field; invalid entries are dropped, the rest is
sorted and cut to 10. Unreadable or hostile JSON gives an empty table and never
throws. Storage errors (quota, privacy mode) are swallowed.

**R8.4** *Migration.* If `exorcise-highscores` is absent and the legacy key
`exorcise-highscore` holds a positive integer, the table starts with one entry
`{ name: "OLD-BEST", score, stage: 1, date: <today>, mode: "1P" }` and is saved.
The legacy key is left in place and still written (older builds keep working);
the HUD best score is the larger of the two. Only a score left by an older build
migrates: before this build first writes the legacy key it settles the migration
(`ensureTable`), storing an empty table when there is nothing to migrate, so its own
mid-run legacy write never becomes an "OLD-BEST" row.

**R8.5** *Demo mode.* With persistence off (`setHighScorePersistence(false)`, set
by demo mode) the table loads empty, nothing is read from storage and nothing is
written, the legacy key included.

---

## R9 — Names and the name picker (group C)

**R9.1** Every recorded run gets a default generated name `WORD-XX` (WORD one of
`GHOST BOO SPOOK BAT WISP MOON CRYPT WITCH`, XX two hex digits), at most 8
characters, from the game's random source. The entry is **recorded immediately**
when the run ends, so a player who does nothing is in the table.

**R9.2** A name screen follows the end screen's entry and offers three motion
buttons: ◀ (previous letter), ▶ (next letter) and OK. The first ◀ / ▶ replaces the
default with the letter `A` at position 1; ◀ / ▶ cycle `A–Z` with wrap-around; OK
accepts the letter and moves to the next of 3 positions; OK on the 3rd position or
on an untouched default accepts the name. The entry is renamed in place.

**R9.3** *Keyboard fallback.* Typing `A–Z 0–9 -` (lower case is upper-cased)
replaces the default and appends up to 8 characters, Backspace deletes, Enter
accepts. Other keys do nothing. Space is not used.

**R9.3a** *Pointer fallback.* A click or tap on a name-screen button (◀, OK, ▶) does what
the motion button does, in 1P and in each 2P half (the click is routed to the half
that contains it). A click on no button does nothing.

**R9.4** *Timeout.* An untouched name screen accepts the default after 10 s; once
a button or key was used the screen waits up to 30 s since the last input, then
accepts what is there (an empty name falls back to the default). All name-screen
timing uses the screen's own clock (`now`), never frames.

**R9.5** *Ergonomics.* The name buttons follow `motion-ui-ergonomics`: centre at or
above 40 % of the height, in the side columns (◀ and OK stacked on the left of the
player's reach, ▶ on the right) and clear of the text. In 2P each half has its
own three buttons inside the half, within the reach model of that player. The
screens are `name` and `name2p` in `layout.ts`, so the layout property tests
(`SCREENS_1P`, `SCREENS_2P`) cover them. The buttons have the standard entry
lock-out and release latch, and one action per frame.

---

## R10 — Where the table shows (group C)

**R10.1** The title screen shows the table as two pages of 5 rows, switching every
4 s of the screen clock, in the central text band above 47 % of the height
(`HIGH SCORES`, rank, name, score). With an empty table it shows nothing new.

**R10.2** (Only the run just finished is highlighted; a run that does not qualify highlights nothing.) The game-over and victory screens show the top 5 rows below 47 % of the
height, within the wide text band, with the player's own entry highlighted (in
the top 5 or added as a 6th row with its rank).

**R10.3** The table never overlaps button columns or the mute button (covered by
the layout rects), and uses the text-scale setting (up to the size its box allows; the title table's font floor is 8 px so rows stay inside the central band) and the palette.

---

## R11 — Two players (group C)

**R11.1** When a 2P game ends, each seat's score is recorded (if > 0) with
`mode: "2P"` and the stage that seat reached, each with its own default name.

**R11.2** Each qualifying seat gets its own name picker in its half, at the same
time, driven only by that half's motion points. The 2P end buttons appear when
both halves are done (accepted, timed out or nothing to name).

**R11.3** Keyboard typing in 2P edits the name of P1 only (P2 uses the buttons);
Enter accepts P1's. When only P2 has a name screen open, keys are not taken (mute `M` keeps working).
While a name screen takes keys (1P, or 2P with P1's screen open) every letter, `M` included, goes to the
name; the 1P hint says so and the mute button stays tappable (`NAME_HINT`: "M is a letter here").
Ranks are read from the final table after both seats are recorded; a seat whose entry
was pushed out by the other seat gets no name screen.

---

## R12 — Demo mode

**R12.1** Demo mode (`?demo=1&seed=5`) stays deterministic, camera-free and 1P. The
demo run plays through stage 6 and the finale to victory with the same seed;
`demo.sim.test.ts` keeps passing at the tested window sizes. If seed 5 no longer
plays a clean run at those sizes, the default seed and every doc that names it
change together.

**R12.2** Demo scores are never saved (R8.5) and the demo shows no name screen
and no table on the title screen (nothing is read).

**R12.3** The demo hand driver treats the new ghosts by their vulnerability: it
never swipes an invulnerable blink ghost or a shielded mirror ghost, and it hits
both wisps of a pair inside the window.

---

## R13 — Constraints and docs

**R13.1** No trademark names (the existing guard test must pass); no network
fetches; no copyrighted assets (procedural canvas and Web Audio only); no new
runtime dependencies (fast-check is already a dev dependency).

**R13.2** The privacy line stays exactly "Your video stays on your device. Nothing
is uploaded."

**R13.3** Pure logic (state machines, table, picker, layout) has no DOM or canvas
access and is `deltaMs`-based.

**R13.4** Property tests cover: telegraph precedes every state change; a hit is
always possible within the vulnerable window; frame-rate independence of the
state machines; table invariants (≤ 10, sorted, valid, idempotent load);
name sanitising; picker closure; layout of the new buttons (existing layout
properties).

**R13.5** Docs: README (controls table, stages, enemies, high scores, specs tree),
`docs/KIRO.md` (spec lists, history, test count, credits row), spec task list
ticked only when code and tests exist. The balancer stays report-only.
