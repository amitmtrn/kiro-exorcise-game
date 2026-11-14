# Playtest Polish — Requirements

## Scope

Three polish areas found in playtests, in one spec with separate requirement
groups:

- **A. Performance** on weak laptops and mobile: a frame-budget monitor that
  steps quality down and back up, a motion-diff grid that can change size at
  run time, and `?quality=` overrides.
- **B. Audio levels**: one master bus (gain, bus compressor, limiter) for all
  SFX and music, and a per-sound gain table so loudness is consistent.
- **C. Accessibility**: settings panel, colourblind-safe palette with shape
  redundancy, bigger text, reduced flashing.

Out of scope: balance, scoring, spawn rates, stage content, the motion-button
layout (`motion-ui-ergonomics/`), the exorcist card content, new audio files,
new runtime dependencies, network access.

**Unchanged unless a requirement below says so:** normal gameplay feel, balance,
motion-button layout, and demo-mode determinism. With default settings, quality
level 0 and a camera at full speed, the simulation, the 320 × 180 motion grid and
the existing demo sim tests behave exactly as before. Demo mode never changes
quality level, grid, or settings-driven simulation.

Review items of earlier specs are not repeated: raised-hand zones, entry
lockouts and the 650 ms dwell (`motion-ui-ergonomics/`), duplicate-frame handling
(`hit-detection-fix/`), seeded runs (`demo-mode/`), procedural audio (`audio/`,
`music-v2/`).

---

## A. Performance

### R1 — Frame budget monitor

**R1.1** A pure controller (`FrameBudget`) receives the elapsed time of every
frame (`deltaMs`) and keeps a **time-weighted rolling average** of frame time
(exponential, time constant 1000 ms) and a refresh estimate (time constant 300 ms).
No count of frames and no per-frame constant is used anywhere in it: feeding the same wall-clock span in 8 ms or 32 ms steps
gives the same decisions.

**R1.2** Quality levels, cumulative, `0` is full quality:

| Level | Name | Changes |
|---|---|---|
| 0 | full | nothing reduced |
| 1 | lite effects | particle and combo call-out counts reduced |
| 2 | lite diff | motion-diff grid 160 × 90 |
| 3 | minimal | motion-diff grid 96 × 54, fog and candle flicker off |

**R1.3** Step down one level when the average stays above the down threshold
for **2000 ms** of accumulated time. Step up one level when the average stays below
the up threshold for **6000 ms**. Between the two nothing happens. Both thresholds
are relative to the display: the monitor keeps an estimate of the refresh interval
(it starts at 60 Hz; it falls toward a faster frame interval with a **300 ms time
constant** and otherwise rises by at most 1 ms per 100 ms, never above the frame
interval). The estimate is snapped to the 120 / 60 / 30 Hz interval it is within
**15 %** of, else to 60 Hz. The thresholds are `max(20, 1.3 × refresh)` down and
`max(14, 1.1 × refresh)` up. A 60 Hz display (16.7 ms intervals, also with ±4 ms
jitter) and a 30 fps-capped browser can therefore step back up; on a 120 Hz display
the values are the plain 20 / 14 ms. A steady 28 ms or 40 ms stream is a slow
machine, not a display, and steps down. A steady frame time of about 29–38 ms is
treated as a 30 Hz cap and does not step down, but only for a display that has never
run faster: once the session has spent **1000 ms** in frames shorter than 25 ms, the
30 Hz band is no longer snapped to (a vsync-locked weak laptop that falls from 60 to
30 fps is a slow machine) and a sustained 29–38 ms stream steps down. (Review fixes
RF1, RF10, RF20.)

**R1.4** Hysteresis: after any change no further change happens for
**3000 ms** (settle time); the average is re-seeded to the middle of the current
band (the mean of the down and up thresholds) so the old, stale value does not
trigger the next step. A step up that is followed
by a step down within **30 s** doubles the step-up wait (up to 4×), so a machine
sitting right on the border settles instead of flip-flopping.

**R1.5** For any constant frame time the level moves in one direction only (never
down then up, or up then down), and always stays within 0–3. A constant 30 fps
cap (29–38 ms) from the start of the session therefore keeps level 0; a stream that
drops into that band after the display ran faster only steps down. (Changes of the frame time caused by a level
change itself are not constant-frame-time input; the up-wait penalty of R1.4 limits
such oscillation.)

**R1.6** Frames longer than **250 ms** (tab hidden, debugger pause) are ignored,
not counted as slow.

### R2 — Adaptive motion-diff resolution

**R2.1** The motion grid is one of `320 × 180` (stride 4, today's value and the
default), `160 × 90`, `128 × 72`, `96 × 54` (stride 2, 2, 1 respectively). Level 2 uses 160 × 90,
level 3 uses 96 × 54; 128 × 72 is supported and tested as an intermediate size.
A pure module (`webcam/grid.ts`) holds the current grid; hit detection, the
motion mask, swipe estimation and two-player halves read the grid from it.

**R2.2** Hitboxes are mapped through normalised space: a display-space hitbox
`x/W, y/H, w/W, h/H` lands on the same fraction of the grid at every resolution.
The sample stride scales with the grid so each hitbox still gets about the same
number of samples, and the size of one grid cell (`motionCell`) is updated, so
motion buttons need the same fraction of their circle covered and fill with the
same 650 ms dwell.

**R2.3** On a resolution change, in one tick: both motion canvases are resized and
the previous frame is re-captured from the camera at the new size, the tick is
treated as "no new camera frame", every enemy's hit gate (`hitCount`, stored swipe
centroid) is reset, and the published motion pixels are cleared. No hit and no
button press can come from the size change itself.

**R2.4** The noise calibration (`DIFF_THRESHOLD`) is **carried over** unchanged:
down-scaling only averages sensor noise, so a threshold calibrated at full size
stays an upper bound of the noise at every smaller size. No new calibration
banner appears mid-game.

**R2.5** Property test: for a moving blob (a bright square, hit-box sized, present in
one frame and absent in the other) at any position inside the screen and a
minimum size of 12 % of the canvas width, `computeFrameDiff` reports a hit at
**every supported resolution**; with no blob it never reports a hit.

### R3 — Overrides and visibility

**R3.1** `?quality=low|med|high|auto` (default `auto`; unknown values mean `auto`).
`high` pins level 0, `med` level 2, `low` level 3. A pinned level never changes.
`auto` uses the monitor of R1.

**R3.2** Demo mode ignores `?quality` and the monitor: it always runs at level 0
(320 × 180) so seeded runs stay deterministic.

**R3.3** The debug overlay (`D`) shows the quality level and mode (`auto` or
pinned), the average frame time in ms and the diff resolution. The average is
tracked in every mode, also with a pinned `?quality=`; only auto mode applies a
level change. A pinned mode tracks the plain rolling average only (`trackFrameAverage`):
no step, no re-seed and no settle time, so the shown average never snaps.

**R3.4** Level 1+ thins newly spawned particles (every 2nd kept) and caps
call-outs at 1; level 3 stops drawing fog and draws candle glow without
flicker. Level 0 output is identical to today.

### R4 — Measurement

**R4.1** A simulation test drives the controller with slow, then fast, frame times
(simulated by `deltaMs`) and shows it steps down to level 3 and recovers to
level 0, without flip-flopping.

**R4.2** A micro-benchmark test measures the analysis cost per frame (motion mask
plus six hitbox diffs) at every supported resolution and prints a table. The
numbers in the docs come from running it; none are invented.

---

## B. Audio levels

### R5 — Master bus

**R5.1** All SFX and music connect to **one master gain**; the master gain feeds a
bus compressor (threshold −18 dB, knee 12 dB, ratio 3, attack 10 ms, release
250 ms), then a limiter (threshold −3 dB, knee 0, ratio 20, attack 1 ms,
release 100 ms), then `destination`. Nothing else connects to `destination`.

**R5.2** Mute still works: it sets the master gain to 0 (the bus stays in the
graph). Volume is unchanged (0–1, stored under the existing key).

**R5.3** If the browser lacks `createDynamicsCompressor`, the master gain connects
straight to `destination` (sound still works).

### R6 — Level normalisation

**R6.1** Every SFX id (`ghostHit`, `batHit`, `skullHit`, `lifeLost`, `combo`,
`stageClear`, `bossHit`, `bossDefeated`) has an entry in a gain table, and
music has `MUSIC_GAIN`. Each SFX is described as data (voices), played by one
interpreter and rendered by a pure offline renderer for measurement.

**R6.2** Targets, before the limiter: every SFX has a sample peak of at most
**−3 dBFS** and an active RMS within ±1.5 dB of **−22 dBFS** (peak-limited sounds
may be quieter); the music's estimated RMS is about **6 dB below** that of the
SFX; the boss hit stacked with a combo chime, a ghost hit and music never
exceeds **0 dBFS** in a sample-wise mixing model (all start offsets 0–100 ms).

**R6.3** No audio file is added. Everything is procedural.

---

## C. Accessibility

### R7 — Settings and persistence

**R7.1** Settings: colourblind palette (`cb`), text scale (`1`, `1.25`, `1.5`),
reduced flashing (`reducedFlash`).

**R7.2** The settings panel opens from the title screen with **`O`** or a click on
a small **⚙** button (bottom-left, clear of the motion buttons, the sound hint and
the mute button), and closes with `Esc`, `O` or its Close row. Inside it: Up/Down
select, Enter/Space/click toggle or cycle. While it is open the title's motion
buttons and Space / 1 / 2 / G (demo) do nothing. The panel consumes plain keys
only: Ctrl / Meta / Alt chords, F-keys and Tab keep their browser meaning (reload,
zoom, devtools, fullscreen, focus). Auto-repeat of a held key never toggles a row
or closes the panel. Row labels shrink to fit the panel on narrow canvases.

**R7.3** The panel has **no motion button**: the title screen's raised-hand zones
are already used by 1 PLAYER and 2 PLAYERS and a third target would break the
layout rules. The panel is keyboard and mouse/touch only. (Documented.)

**R7.4** Persistence: one `localStorage` key, `exorcise-settings`, holding only the
three setting values as JSON. Never video, images or anything else. Unreadable or
invalid data falls back to defaults.

**R7.5** URL parameters `?cb=1`, `?bigtext=1` (1.25×) or `?bigtext=2` (1.5×), and
`?reducedflash=1` override stored values for that visit and are not saved. `0`
turns the option off.

**R7.6** `prefers-reduced-motion: reduce` turns reduced flashing on by default
(a stored or URL value still wins).

### R8 — Colourblind-safe palette

**R8.1** With `cb` on, the following use an Okabe-Ito based palette: ghost, bat,
skull, lunger, pumpkin, boss and candy fills; P1 / P2 colours; heart, score,
combo and danger colours; the motion-button ring.

**R8.2** Colour is never the only signal: the skull keeps its distinctive shape
and gains a "!" danger marker and dashed pulsing ring; P1 and P2 HUDs keep their
text labels and get different icons (● / ■); lives are shown as hearts (full vs.
hollow); the combo shows its `×N` text; the button ring has a different dash
pattern per button state.

**R8.3** Pure colour maths in the repo, no dependency: sRGB → linear → XYZ → CIE
Lab, **CIEDE2000** (and CIE76), CVD simulation for protanopia, deuteranopia and
tritanopia with the **Machado et al. (2009)** matrices at severity 1.0.

**R8.4** Property tests: for the key pairs (ghost vs. skull vs. bat vs. pumpkin
fill, P1 vs. P2, life vs. combo vs. score, skull vs. background, ring states) the
CIEDE2000 distance **under each simulated deficiency and unsimulated** is at
least a documented minimum (≥ 12 for enemy and player pairs, ≥ 20 for danger vs.
background).

### R9 — Bigger text

**R9.1** The text scale multiplies HUD, call-out, menu and onboarding text sizes.
Menu text still fits its band (`fit`), HUD boxes are laid out by a pure function.

**R9.2** At 640 × 480 and 1280 × 720 and scales 1, 1.25, 1.5: every HUD text box
is inside the canvas, boxes do not overlap each other or the mute button; fitted
menu text is inside its text band, which never overlaps a motion button; no text is
smaller than the **minimum font sizes** (HUD 16 px, menu text 12 px, call-outs
24 px).

**R9.3** Bigger text applies to the one-player HUD and screens, call-outs, score pops, the onboarding
caption and the CSS text (onboarding, camera help). With a scale above 1 the stage label shrinks (never below
16 px) to stay between the hearts and the timer and is not drawn when even 16 px does not fit (always the case in the
two-player halves of a 640-wide canvas), and the score / combo pulse is reduced where the two would
collide. The two-player split-screen end screens keep their size: they are laid out around per-half buttons and
are not rescaled by this spec. Button labels are fitted to their circle and are not scaled. The two-player
in-game half HUDs are scaled; the right half's player label starts right of the shared mute button, which
straddles the seam, and a layout test checks both labels against it at 640 × 480 and 1280 × 720.

### R10 — Reduced flashing

**R10.1** With reduced flashing on: the full-screen red/orange flash is capped at
**alpha 0.15** (from 0.4) with soft fade in/out (≥ 120 ms ramps); screen shake
amplitude is cut to 25 %; the one-frame white hit silhouette is not drawn.
Random numbers are still consumed the same way (demo determinism). The per-canvas
scheduler resets when the clock goes backwards (leaving demo mode, whose clock
starts at 2^40), so no tint stays on screen and later flashes still show.

**R10.2** No more than **3 flashes in any 1000 ms window** (WCAG 2.3.1): a pure
flash scheduler accepts flash requests (time, amplitude) and drops the ones that
would be the 4th in the window. The limit is per screen: in two-player mode both
halves draw their flash onsets from one shared budget (`flashGroup`), so the whole
screen shows at most 3 flashes in 1000 ms, not 3 per half. A property test samples the produced brightness
waveform at 1 ms and checks the rule for random request streams.

**R10.3** There is no lightning or strobe effect in the game today; the timer's
low-time blink (1 Hz) is within the limit and is covered by the flash-rate test. The
lunger and boss wind-up pulses run at a quarter of their speed (at most 1 Hz) with
reduced flashing on.

### R11 — Privacy

**R11.1** The privacy line stays exactly **"Your video stays on your device.
Nothing is uploaded."** and no new text elsewhere contradicts it. Settings code
never touches video frames.

---

## R12 — Docs and tests

**R12.1** The README documents the settings, URL parameters, quality levels and the
controls table (`O`). The README test count is synced.

**R12.2** Unit and property tests for every area; `npm test` and `npm run build` pass
after every task.
