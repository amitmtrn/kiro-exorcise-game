# Motion UI Ergonomics — Requirements

## Scope

Every motion-activated (wave-to-press) button moves from the lower body band to
**raised-hand zones**: the upper part of the frame, at the left and right edges,
at shoulder-to-overhead height. Pressing needs a deliberate, hand-sized, ~0.65 s
hover instead of any 3 moving samples for 0.8 s, so body sway, walking and legs
cannot press a button. Layout lives in one pure module used by rendering, hit
testing and onboarding. The same pass fixes the lockout, resolution, stale-frame,
2P and sound-hint problems found by the UI audit.

Out of scope: gameplay (enemies, scoring, stages, boss), the exorcist card
content and privacy rules, audio assets, any new asset or runtime dependency.
Clicks / taps and keyboard shortcuts behave exactly as before.

---

## Current state (UI audit, before this spec)

Source: read-only audit `logs/ui-audit.md`. Centres are % of canvas (x, y) at
1280×720; "4:3" values are for 640×480. Every motion button read the whole-frame
mask, needed only **3 moved samples** inside its circle and an **800 ms** dwell,
bridged gaps of up to 150 ms and never decayed.

| Screen | Button | Centre (x%, y%) | Zone / risk |
|---|---|---|---|
| Start | 1 PLAYER | (50, 72) | hips of a centred player; reach down |
| Start | 2 PLAYERS | (68.3, 72); 4:3 (82.5, 72) | lower torso; nothing mirrors it on the left |
| 1P stage summary | NEXT | (50, 84) | thighs; clipped at 4:3; no entry lockout |
| 1P game over | RETRY | (35, 72) | hip / resting hand; no entry lockout |
| 1P game over | MENU | (65, 72) | hip; abandons the run; `if`/`if` resolution, MENU wins a tie |
| 1P game over | EXORCIST CARD | (50, 90.5) | shins on the centreline; covered by the sound hint |
| 1P victory | PLAY AGAIN / MAIN MENU | (35, 74) / (65, 74) | hips; 1500 ms lockout with latch |
| 1P victory | EXORCIST CARD | (50, 92.5) | shins; sound hint |
| 1P card preview | SAVE / NO PHOTO / CLOSE | (38.2, 84.4) / (50, 84.4) / (61.8, 84.4) | thighs; SAVE downloads a file and is 43 px from NO PHOTO (29 px at 4:3) |
| 2P stage summary | NEXT (shared) | (50, 84), on the divider | reads both halves; no lockout; clipped at 4:3 |
| 2P end | PLAY AGAIN / MAIN MENU (shared) | (35, 73.5) / (65, 73.5) | on each player's inner arm and hip; whole-frame mask, one player's sway decides for both |
| 2P end | EXORCIST CARD per player | (25, 92.4) / (75, 92.4) | own shins; smallest, lowest target |
| 2P card preview | SAVE / NO PHOTO / CLOSE per half | P1 (13.4 / 25 / 36.6, 84.3), P2 (63.4 / 75 / 86.6, 84.3) | thighs; circles 8 px apart at 4:3; one open preview locks the other player's shared buttons with no timeout |

Other findings: lockouts are inconsistent (none on 1P game over, summary and 2P
summary; start and 2P end skip `update` so they have no release latch and a
continuing wave fires at 1.8 s / 2.3 s); the stale motion points kept on a
duplicate camera frame keep a button filling; sizes are pixel-clamped; the
sound-unlock hint (bottom 4 %) covers the card offer and NEXT and is never
dismissed by webcam-only players; the 2P mute button (50 %, 14 %) overlaps the
"PLAYER n WINS!" and "STAGE CLEAR!" banners.

---

## R1 — Raised-hand zones

**R1.1** Every motion button of every screen and mode has its centre at or above
**40 %** of the canvas height (rows at 17 % and about 38 %, or lower only to
clear the mute button, never below 40 %).

**R1.2** No button centre is on a player's body centreline column:
`|x − c| ≥ 0.18 · areaWidth`, with `c = 0.5·W` in 1P and `c = 0.25·W / 0.75·W` for
P1 / P2 in 2P (area width = the half). Buttons sit in two edge columns of the
area (1P: 12 % and 88 % of the width; each 2P half: an outer column at the
screen edge and an inner column at 80 % / 20 % of the half).

**R1.3** Mirror-correct: the layout is in display coordinates and the camera
view is mirrored, so a button the player sees on their right is reached with
their right-side hand. No x-flip is applied anywhere in the button code.

**R1.4** Covered screens and buttons: start (1 PLAYER, 2 PLAYERS); 1P and 2P stage
summary NEXT; 1P game over RETRY, MENU, card offer; victory PLAY AGAIN, MAIN MENU,
card offer; 1P card preview SAVE, NO PHOTO / PHOTO, CLOSE; 2P end PLAY AGAIN,
MAIN MENU (a copy per half), per-player card offer; per-half card preview SAVE,
NO PHOTO / PHOTO, CLOSE.

**R1.5** Buttons are inside the canvas (inside the owning half in 2P), at least
one radius apart (centre distance ≥ 3 radii), and never overlap the title /
score / banner text rects, the card image or the mute button of the screen.

## R2 — Activation

**R2.1** Dwell: a button fills after **650 ms** of accumulated hand motion, with
a visible progress ring around the circle (and the existing wedge fill).

**R2.2** A frame counts as "hand on the button" only when the moved samples
cover at least **12 %** of the circle's area (never fewer than 3 samples). Noise,
a sleeve or a single finger does not count. Coverage is measured in cells of the
motion grid, so it is independent of the canvas size.

**R2.3** Decay instead of reset: while the hand is off the circle the fill drains
at **1.5×** the fill rate from the first off frame (no grace), and the first on
frame after a gap only restarts the clock. A rhythmic sway therefore never
accumulates: a button never fills with less than 650 ms of on-target time, and
`on/off` patterns with off ≥ on never fire, whatever the gap length.

**R2.4** Duplicate camera frames are ignored by buttons: a tick whose camera
frame equals the previous one neither fills nor drains and returns the previous
status. Fill time between two real frames is credited once, capped at 120 ms per
frame, so a stalled camera cannot keep a button filling.

**R2.5** Entry lockout with release latch on **every** screen (start, summary,
game over, victory, 2P summary, 2P end): for 1200 ms after the screen is entered
motion is ignored, and motion present at the end of the lockout must leave the
circle (still > 150 ms) before it can fill. The card preview keeps its 800 ms
lockout + latch. No screen has a lockout without the latch.

**R2.6** One wave = one action: after a trigger a button ignores motion until the
hand has left it.

**R2.7** Mutually exclusive resolution: when several buttons of a screen fill on
the same frame exactly one action fires (fixed priority, safe actions before
destructive ones) and the others are reset and latched. No `if`/`if` pairs.

## R3 — Destructive and side-effect actions

**R3.1** SAVE (file download), MAIN MENU / MENU (abandons the run) use a longer
dwell of **1000 ms**.

**R3.2** They sit alone in their column (other buttons of the screen are at
least 3 radii away, in practice a full column away), never next to a button
that is pressed often.

## R4 — Two players

**R4.1** Each player's buttons are inside their own half at raised-hand height
and read only that half's motion points.

**R4.2** Shared decisions (stage NEXT, PLAY AGAIN, MAIN MENU) have **a copy in
each half**. The action fires when **either** player completes it deliberately
(650 ms / 1000 ms dwell with 12 % coverage, own half only). Chosen over
"both players required" so a player who walked away cannot hold the other
hostage; sway alone cannot press a raised edge button.

**R4.3** An open card preview does not lock the other player out indefinitely: it
blocks the other half's shared buttons for at most **20 s** after it opened; its
own half's shared buttons are inactive while that half's preview is open.

**R4.4** At 640×480 the circles of a half are ≥ one radius apart and the
inner columns of the two halves are ≥ 3 radii apart.

**R4.5** The 2P mute button no longer overlaps banners or titles: shared 2P
banners (STAGE CLEAR, PLAYER n WINS) are drawn below 47 % of the height and the
mute rect is disjoint from every 2P button.

## R5 — Sizes

**R5.1** Radii scale with the canvas: `r = clamp(min(0.07·H, 0.08·W or 0.105·halfW, 0.12·aw − 10), 20, 80)`.
The cap keeps the progress ring (radius + 9 px with its stroke) on the canvas at the outer column.
Nothing is clipped at any size from 640×480 to 2560×1440 (including odd aspect
ratios in that range). Text of the menu screens is fitted to the central 60 %.

## R6 — Sound-unlock hint

**R6.1** The sound hint is at the top centre (1.5 % from the top, at most 56 % of
the width) and does not intersect any motion button, the mute button or the
2P mute button. The hint's font size comes from the same model (`soundHintFontPx`
of the viewport width).

**R6.2** The hint hides itself 8 s after it is shown, so a webcam-only player
(who never clicks) does not keep it over the stage label during play.

## R7 — Onboarding

**R7.1** The silhouette guide's hand targets are exactly the start screen's
button zones (same layout constants, same centres and radii) and it shows the
line "Raise a hand to the glowing circles to press them".

**R7.2** The start screen's instruction is two short lines ("Raise a hand to a
glowing circle" / "or press 1 / 2 • Space = last mode"), each fitted to the
central text band and drawn at 12 px or more on a 640 px canvas.

## R8 — Unchanged behaviour and constraints

**R8.1** Clicks / taps (card offer and preview buttons, mute) and keyboard
shortcuts (Space, 1, 2, C, S, N, Enter, Esc, M) work as before. Gameplay, the
exorcist cards and privacy are unchanged. No new assets, no network use, no new
runtime dependency.

**R8.2** All timing is `now`/`deltaMs` based, never per frame.

**R8.3** Tests: unit tests for each module; property tests (fast-check) for the
layout invariants over random canvas sizes 640×480–2560×1440 (centre ≥ ... see
R1), dwell (single frame / sub-dwell burst / sway never fires), lockout + latch
per screen, exclusive resolution, stale frames, sound hint rect, onboarding
targets = layout zones.
