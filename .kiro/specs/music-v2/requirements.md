# Music v2 — Requirements

## Scope

The background music from `audio/` T3 is one sawtooth voice whose notes are
timed with `setTimeout`, so it drifts and stutters when the tab is busy. Its
"fade-in" gain node is created but never placed in the signal path, so
there is no real crossfade (audio R2.4 was never met). This spec replaces it
with a 3-voice procedural sequencer driven by the audio clock, intensity
layers that follow the combo, a title theme, a boss theme and a real 0.5 s
crossfade.

Unchanged (apart from a comment edit in `context.ts`): all SFX (`sfx.ts`), `context.ts` (master gain, mute, volume,
`localStorage`), and the public `startMusic(stage)` / `stopMusic()` names.
All music stays procedural: no audio files, no fetches, no new dependencies.
All patterns are original compositions written for this project.

---

## R1 — Scheduler

**R1.1** Note timing comes from `AudioContext.currentTime`. No note start time
is derived from `setTimeout` / `setInterval` delivery times.

**R1.2** A look-ahead scheduler runs from a 25 ms timer. On every tick it
schedules all steps whose start time is before `now + 100 ms`.

**R1.3** Each step of a running track is scheduled exactly once. Step `n` starts
at `startTime + n × stepDuration`, computed by multiplication, so there is no
cumulative drift however many loops have played.

**R1.4** A step is never scheduled further than the look-ahead window ahead of
`now`.

**R1.5** If the timer stalls (background tab) and steps are already more than
50 ms in the past, those steps are skipped rather than played in a burst. The
scheduler resynchronises with the clock and never schedules a step twice.

**R1.6** A step is 1/16 note. Tempo is a per-track BPM.

**R1.7** While the tab is hidden the scheduler is paused (no throttled, sparse
stuttering) and resumes with a resync when the tab is visible again.

**R1.8** The scheduler resumes a context that is `suspended` or `interrupted`.

## R2 — Voices

**R2.1** Three voice groups: **bass** (low sawtooth through a low-pass filter),
**drums** (kick, snare and hi-hat; snare and hat are filtered noise, the kick is
a pitch-dropping sine with a noise click) and **lead** (triangle/square through a
low-pass filter). The extra arpeggio layer of R3 is a fourth, plucked triangle voice.

**R2.2** Noise comes from a short buffer generated in code with a fixed-seed
generator, shared per `AudioContext`.

**R2.3** Every voice connects through its layer gain → track bus → the existing
master gain (`getMasterGain()`), so the mute toggle and volume apply to music.

## R3 — Intensity layers

**R3.1** Combo tier (`state.combo`, 1–4) selects the active layers:

| Combo | Layers audible |
|---|---|
| x1 | bass + hi-hat |
| x2 | + kick + snare |
| x3 | + lead |
| x4 | + arpeggio |

**R3.2** Values outside 1–4 or non-finite are clamped (NaN → x1).

**R3.3** Layers fade in or out over 150 ms when the tier changes. Playback and
timing are unaffected, so layers stay in sync.

**R3.4** The title theme always plays at tier 3 (bass, drums, lead), regardless
of combo. The boss theme never drops below tier 2.

**R3.5** The tier is remembered across tracks, so a new stage starts at the
current combo tier.

## R4 — Tracks

**R4.1** Tracks: `title`, `stage1`–`stage4`, `boss`. Each has its own BPM,
progression and melody, in a minor key (A minor with a flat second and a raised
seventh available, optionally transposed per track).

**R4.2** Stage 5 plays `boss`; stages 1–4 play `stage1`–`stage4`. The start
screen plays `title`.

**R4.3** Before the first user gesture the game is silent (audio R2.3). The
title theme is requested on the start screen; it begins to sound when the
browser lets the context run.

**R4.5** Unlocking audio: the AudioContext only runs after a user gesture. The
camera-permission prompt is browser UI and does not count, and a webcam-only
player may start via motion buttons without touching anything. So while the
context is not running the game shows a "Click or press any key to enable
sound" hint, and listens for any `pointerdown`, `touchstart`, `keydown` or
`click` until the context reports `running` (a refused `resume()` re-arms on the
next gesture). Music requested earlier then starts from the current track.

**R4.4** Summary and game-over stop the music with a 0.5 s fade out; victory
already stops it. Returning to the start screen restarts `title`.

## R5 — Crossfade

**R5.1** Each track plays through its own bus gain that *is* in the signal
path (bus → master).

**R5.2** Switching tracks ramps the outgoing bus from its current level to 0 and
the incoming bus from 0 to 1 over 0.5 s, both starting at the same
`currentTime`. `stopMusic()` fades the outgoing bus to 0 over 0.5 s.

**R5.2a** If the context is not running (nothing rendered yet) a replaced track
was never audible: its bus is disconnected at once instead of faded, and no
retirement is queued (`currentTime` is frozen, so it would never complete).
Layer gains change outright in that state. `AudioParam.value` is stale until
rendering, so it is never read as the level of a never-rendered param.

**R5.3** After the fade the old track's scheduler is stopped and its nodes are
disconnected. The outgoing track schedules no new steps once the fade starts.

**R5.4** Requesting the track that is already playing does nothing.

## R6 — Pattern data

**R6.1** Patterns are plain data in `src/audio/music/patterns.ts`, parsed by
a pure function into per-step events.

**R6.2** Every voice of a track has the same number of steps; the step count is
a whole number of 16-step bars.

**R6.3** Every pitch is a valid note name and, before transposition, belongs to
the allowed spooky scale (A minor + flat 2nd + raised 7th). Every held-note
marker follows a note.

**R6.4** BPM is between 60 and 160; transposition is between −5 and +5 semitones.

## R7 — Non-goals

Sample files, reverb convolvers, per-note panning, a music volume slider
separate from the master volume.
