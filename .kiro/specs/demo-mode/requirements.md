# Demo Mode — Requirements

## Scope

A camera-free attract / demo mode for filming the submission video. A scripted
"ghost hand" plays a whole run (stages 1–5, bonus round, boss, victory, Exorcist
Card preview) and loops back to the title screen. The hand does not bypass any
game code: it produces the same inputs the camera pipeline produces (a pair of
320 × 180 frames, from which `computeMotionMask` builds the mask), so hit
detection, combo, hit-stop, knock-back, call-outs, waves, boss phases, victory,
the motion buttons and the card all run through their normal code paths.

Builds on `stages/`, `waves/`, `juice/`, `boss-phases/` (the run it plays),
`motion-ui-ergonomics/` (button zones, dwell, lockouts) and `exorcist-card/`
(the preview). Normal (non-demo) play is not changed by this spec.

Key bindings already taken (checked in `main.ts`): `D`/`d` debug overlay, `M`/`m`
mute, `1` / `2` mode, `Space` start, `C` / `S` / `N` / `Enter` / `Esc` card. The
demo toggle is **`G`** ("ghost hand").

---

## R1 — Switching demo on and off

**R1.1** `?demo=1` in the page URL starts demo mode at page load. `?demo=0` (or
no `demo` parameter) starts the normal game. Optional parameters: `seed=N`
(non-negative integer, default `7`, a seed that plays a clean run at common window
sizes), `stage=N` (1–5, default `1`: the stage the run starts at) and `speed=N` (1–4, default `DEMO.timeScale`). A missing or invalid
value falls back to its default; nothing throws.

**R1.2** On the title screen of a normal game, `G` (no Ctrl / Meta / Alt) switches
demo mode on. In demo mode `G` switches it off. `G` in a normal game anywhere but
the title screen does nothing.

**R1.3** In demo mode any key press or click / tap on the canvas, other than `G`
(R1.2) and the passive keys of R1.4, leaves demo mode and shows the normal title
screen. Loading with `?demo=0` is the same normal game as no parameter.

**R1.4** Passive keys do not leave demo mode: bare modifier keys (`Shift`,
`Control`, `Alt`, `Meta`) and `M` / `m` (mute). `M` is a key press, so it also
unlocks audio for a take with sound (see R7.2).

**R1.5** Leaving demo mode stops the demo loop, restores everything demo mode
replaced (R3.3, R6.1), and starts the normal flow (camera permission, onboarding
as usual). Entering demo mode from the title screen releases the camera that the
normal flow had opened.

---

## R2 — No camera, no onboarding, no network

**R2.1** In demo mode `navigator.mediaDevices.getUserMedia` is never called, so
there is no permission prompt, and no `<video>` element is created.

**R2.2** Onboarding is skipped (no silhouette guide, no how-to, no camera-denied
screen) and nothing is read from or written to the onboarding storage key.

**R2.3** Demo mode makes no network request: no `fetch`, `XMLHttpRequest` or
`navigator.sendBeacon`, no external asset, no new dependency. Everything it
draws is procedural canvas art.

**R2.4** The webcam layer shows a procedural dark backdrop (graveyard colours,
same tint and fog as the game) instead of video.

---

## R3 — Synthetic motion in the camera pipeline's format

**R3.1** The synthetic camera produces, every tick, a `current` and a `previous`
frame of `MOTION_W × MOTION_H` RGBA data with the layout `computeMotionMask` and
`computeFrameDiff` read (grey luminance, row-major, 4 bytes per pixel). Passing
them to the real `computeMotionMask` yields a `MotionMask` whose `points` lie on
the 4-pixel sampling grid and cover the discs the hand moved; `changed` is true
on a new camera frame and false on a duplicate.

**R3.2** The camera delivers a new frame every 1000 / 30 ms of demo time. A tick
that falls between two frames receives the previous frame again (duplicate
frame), exactly as a 30 fps webcam under a 60 fps loop does. A new frame carries
a few pixels of sensor noise below `DIFF_THRESHOLD`, so `changed` is true on every
genuine frame. A hand at rest produces no moved pixels.

**R3.3** The loop's demo branch feeds these frames to the same functions the
camera branch feeds (`computeMotionMask`, `updateMotionPixels`, `resolveHits`, the
motion buttons). `updateMotionPixels`, the motion buttons and `resolveHits` are
not modified and cannot tell the difference.

**R3.4** Frame content depends only on the hand positions given to the camera:
the same positions give byte-identical frames.

---

## R4 — The scripted hand

**R4.1** The driver is a pure, deterministic state machine
`update(deltaMs, view) → hand position`. Its only randomness is a PRNG seeded from
`seed`. The same seed and the same sequence of `(deltaMs, view)` give the same hand
positions. It has no DOM and no canvas access.

**R4.2** *Aiming.* While playing it targets a hittable enemy (`isHittable`) that is
on screen and past the spawn grace, most urgent first (closest to the centre; ghosts
and lungers before harmless bats and candy). It reacts after a delay of 180–320 ms
from the first moment the enemy is on screen. During a boss wind-up it reacts after
the "!" and glow have shown (phase 2: 300–400 ms, phase 3: 120–180 ms), so the telegraph
is visible before the hit.

**R4.3** *Swipes.* Each swipe is a curved path (quadratic Bézier with an
ease-in-out speed profile, 180–800 ms) that passes through the enemy's predicted
position and overshoots it. It starts from where the hand is; it never teleports:
no step is faster than the hand's top speed (4.5 canvas heights per second; a longer
step is shortened and the move falls behind schedule). Between swipes the hand rests
without moving (80–200 ms), so a resting hand never hits anything. A swipe at a
non-urgent target is dropped when an attack or a threat due within 1.2 s is ready
to be swiped (a person changing their mind). An approaching lunger about to wind up
is met: the hand waits beside it.

**R4.4** *Deliberate misses.* About one swipe in eight at a low-urgency target
(not a boss, not a lunger, not within 35 % of the screen height of the centre) passes
beside the enemy instead of through it; the next swipe then hits. A miss never
costs a life by itself.

**R4.5** *Never the skull.* At every frame the hand disc (current and next position)
stays clear of the hitbox of every skull by the hand radius plus a margin (two
motion-canvas pixels plus the skull's travel in one tick). If the next step would break
that, the hand holds still instead (a still hand cannot hit). Planned swipes whose
path breaks the margin are replanned from the other side or skipped.

**R4.6** *Combo.* Because it clears enemies without letting ghosts reach the centre,
a normal run reaches combo x4 (10 consecutive banishes) at least once.

**R4.7** *Buttons.* To press a motion button the hand glides to it after the
screen's entry lockout has passed, then moves in a continuous circle over it. The
button's normal dwell (650 ms, 1000 ms for MAIN MENU / SAVE) applies; if the screen
has not changed after a burst, the hand leaves the circle, rests, and tries again
(release latch). It never presses SAVE.

**R4.8** *Run script.* Title: 1 PLAYER. Stage title: wait. Playing: R4.2–R4.6.
Summary: NEXT. Victory: wait ~2.5 s, press EXORCIST CARD, hold the preview ~4.5 s,
press CLOSE, press MAIN MENU. Game over (only if a run fails): RETRY. Title again:
wait ~3 s, then 1 PLAYER with the driver re-seeded, so every loop plays the identical
run (attract loop).

---

## R5 — Time scale and determinism

**R5.1** Demo mode runs the game on a fixed step of `DEMO.stepMs` (1000 / 60) of
real time multiplied by the time scale (default 2.0). Every game and driver timer is
`deltaMs`-based; the scale only multiplies the `deltaMs` fed in. Frames that arrive
sooner than `DEMO.minFrameMs` after the last processed one (high-refresh displays)
are skipped.

**R5.2** The demo clock (`performance.now()` while demo mode is on) advances by the
same scaled step per processed tick, and `Math.random` is a PRNG seeded from `seed`
and re-seeded at the start of every run. Same seed, same fixed step and same canvas
size: the run is identical every time, in the browser and in the headless simulation.
The clock starts at one fixed value (2^40 ms) far above any real `performance.now()`,
so timestamps left in modules by the normal game cannot lie in its future, and the
driver's own clock restarts at 0 for every run, so float rounding is identical from
run to run. Cosmetic randomness that differs between the browser and the headless
run (sound-effect noise) must not draw from `Math.random`.

**R5.3** Normal gameplay timing, stage durations and balance are unchanged: the
scale exists only in demo mode and `STAGES` is not modified.

---

## R6 — Labelling and persistence

**R6.1** A persistent badge "DEMO" (with a short caption) is drawn on every tick in
every phase: title, stage title, playing, summary, game over, victory and the card
preview. It is drawn above the game and below nothing.

**R6.2** A translucent "ghost hand" cursor (palm, fingers, fading trail, glow) is
drawn where the synthetic motion is, above everything else except the badge, so
viewers understand the input.

**R6.3** The Exorcist Card preview uses a procedurally drawn placeholder portrait
(silhouette with a ghost-white face on a dark scene) in place of a camera snapshot,
and the card carries the chip "DEMO". The card is never saved or downloaded in demo
mode (the download hook is a no-op).

**R6.4** Demo scores never reach `localStorage`: while demo mode is on
`saveHighScore` writes nothing and `loadHighScore` returns 0, so the "Best" line shows
only demo progress and the player's real best is neither shown nor changed. Leaving
demo mode restores both.

**R6.5** The sound-unlock hint ("Click or press any key…") is hidden in demo mode
(a click would leave it). Music and sound effects play as in a normal game.

---

## R7 — Constraints

**R7.1** Normal mode is unchanged: with no demo parameter and no `G` press the game
behaves as before, and every existing test passes unmodified. `loop.ts` changes are
confined to the demo branch and a wrapper; `STAGES`, `collision.ts`,
`motionButton.ts`, `screens.ts` and `state.ts` reducers are not changed (the only
`state.ts` change is the persistence switch of R6.4, default on). `sfx.ts` takes its
white noise from a private generator instead of `Math.random` (R5.2); the sound is
the same white noise.

**R7.2** Recording a take with sound: load `?demo=1&seed=7`, press `M` twice (mute
then unmute, which also unlocks the audio context), then start the screen recorder.
`tools/motion-harness/README.md` and the README document this.

**R7.3** No copyrighted audio or assets, no new runtime dependency, no new network
fetch, no new occurrence of the two original-game names.

**R7.4** Tests: the driver (determinism, format, skull safety, buttons, combo),
the synthetic camera (frame format, duplicates, noise, mask), the demo parameters
and key rules, the badge and cursor, a headless full-run simulation, and "normal
mode unaffected" (see `design.md` Tests).
