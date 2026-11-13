# Music v2 — Design

## Module layout

```
src/audio/
  music.ts               public API (startMusic, stopMusic, startTitleMusic, setMusicCombo) + singleton engine
  music/
    patterns.ts          track data + parseTrack (pure)
    layers.ts            Layer type, tierForCombo, effectiveTier, layersForTier (pure)
    scheduler.ts         StepScheduler: look-ahead logic on an injected clock (pure)
    voices.ts            bass / kick / snare / hat / lead / arp note renderers
    engine.ts            createMusicEngine(ctx, destination, timers): buses, crossfade, layers
  test/fakeAudio.ts      (src/test) recording fake AudioContext used by tests
```

## Pattern format

Each voice is a string of whitespace-separated tokens, one token per 1/16 step:

- pitched voices: a note name (`A2`, `Bb3`, `G#4`) starts a note; `_` holds the
  previous note for one more step; `.` is a rest.
- drums: `x` hit, `X` accented hit, `.` rest.

```ts
interface TrackDef {
  id: TrackId            // 'title' | 'stage1'..'stage4' | 'boss'
  bpm: number
  transpose: number      // semitones
  fixedTier?: number     // title: 3
  minTier?: number       // boss: 2
  bass, kick, snare, hat, lead, arp: string
}
```

`parseTrack(def)` → `{ steps, stepEvents: StepEvent[] }` where each `StepEvent`
may hold `bass`, `lead`, `arp` (`{ midi, lenSteps }`) and `kick`, `snare`, `hat`
(accent boolean). It throws on malformed data; tests parse every track.
The A-minor-based scale check uses pitch-class offsets from A:
`{0,1,2,3,5,7,8,10,11}`. Bars are written with small helpers (`bar(template,
{R:'A2'})`, `rep`, `arpBar`) so the source stays readable; helpers only return strings.

## Scheduler

```ts
class StepScheduler {
  constructor(o: { bpm: number; steps: number; lookAheadSec?: number /*0.1*/;
                   maxLateSec?: number /*0.05*/; onStep(step: number, time: number): void })
  start(time: number): void
  tick(now: number): number   // steps fired
  stepDuration: number        // 60 / bpm / 4
}
```

`tick(now)`: while `time(n) < now + lookAhead`: if `time(n) >= now - maxLate`
call `onStep(n % steps, time(n))`; `n++`. `time(n) = start + n * stepDuration`.
`n` only grows, so a step is never scheduled twice and there is no drift.
The engine's single `setInterval(25 ms)` calls `tick(ctx.currentTime)`.

## Layers

```ts
type Layer = 'bass' | 'hat' | 'kick' | 'snare' | 'lead' | 'arp'
const LAYER_MIN_TIER = { bass:1, hat:1, kick:2, snare:2, lead:3, arp:4 }
tierForCombo(c)             // clamp(trunc(c)) to 1..4, NaN → 1
effectiveTier(def, combo)   // fixedTier ?? max(minTier ?? 1, tierForCombo(combo))
layersForTier(t)            // Record<Layer, boolean>
```

`onStep` only creates nodes for layers active at that moment; each layer also
has a `GainNode` whose target (0/1) ramps over 150 ms when the tier changes so
layers fade rather than click.

## Engine and crossfade

```
voice nodes → layer gain → track bus gain → destination (= getMasterGain())
```

`play(id)`: if `id` is the current track, return. Otherwise build a
`TrackPlayback` (bus, six layer gains, scheduler started at `now + 0.05`), then
`crossfade(prevBus.gain, newBus.gain, now, 0.5)`:

```
out: cancelAndHoldAtTime(now) [fallback: cancelScheduledValues(now)]; setValueAtTime(param.value, now) (explicit anchor in both paths); linearRampToValueAtTime(0, now+dur)
in : cancelScheduledValues(now); setValueAtTime(0, now);        linearRampToValueAtTime(1, now+dur)
```

The old playback moves to `retiring` with `retireAt = now + dur`; it no longer
ticks its scheduler. On the first timer tick at or after `retireAt` its bus is
disconnected. `stop()` ramps the current bus to 0 the same way. Timer tick also
calls `ctx.resume()` if the context is suspended (it is a no-op until the
browser allows it, which keeps the game silent before the first gesture).

While the context is not running (before the first gesture), `retire()` disconnects
the outgoing bus immediately and `setCombo` sets layer gains with
`cancelScheduledValues` + `setValueAtTime`: `param.value` only updates during
rendering, so reading it would give the default 1 and, on the first gesture, every
track visited so far would sound at once, fading 1→0.

### Audio unlock (`src/audio/unlock.ts`, wired in `main.ts`)
The camera-permission prompt is not a page gesture. `installAudioUnlock` listens
for `pointerdown`, `touchstart`, `keydown` and `click` on `window`; each calls
`getAudioContext()`'s `resume()`. Listeners stay until the context state is
`running` (also observed via `statechange`). A `.sound-hint` element
("Click or press any key to enable sound") is visible while locked. Motion
buttons are not gestures, so a webcam-only player hears sound as soon as they
click, tap or press any key once. Known limits: no limiter on the master bus (a
tier-4 downbeat sums to ~0.8 before SFX; covered by T7); a stop→start of the same
track within 0.5 s builds a fresh playback instead of reviving the fading one.

The old bug (gain node never connected to the notes) cannot recur: voices take
the layer gain as their only destination.

## Public API (`music.ts`)

```ts
startMusic(stage)      // stage 5 → boss, 1–4 → stageN
startTitleMusic()      // cheap if already playing (no AudioContext access)
stopMusic()
setMusicCombo(combo)   // cheap if unchanged
```

The engine is created lazily with `getAudioContext()` / `getMasterGain()` and
the real `setInterval`. `loop.ts` calls `startTitleMusic()` in the start-screen
branch, `startMusic(stage)` on entering `playing` (unchanged), and
`setMusicCombo(state.combo)` while playing. Boss-phase and sfx code is untouched.

## Voices

| Voice | Source | Envelope |
|---|---|---|
| bass | sawtooth → low-pass 420 Hz | 10 ms attack, decay to 0 at note end |
| kick | sine 150→45 Hz in 0.12 s + 15 ms noise click | exp decay 0.2 s |
| snare | noise → band-pass 1800 Hz + triangle 190 Hz | 0.16 s |
| hat | noise → high-pass 7000 Hz | 0.04 s (0.09 s accented) |
| lead | triangle + detuned square (quiet) → low-pass 2200 Hz | 15 ms attack, 85 % sustain |
| arp | triangle | 0.1 s pluck |

Peak levels per voice: kick 0.28 (0.34 accented) plus a noise click routed through the kick gain (real peak about 0.05), snare 0.15
(0.20 accented) plus 0.08 body, bass 0.18, lead about 0.15, hat 0.07–0.11, arp
below 0.1. Peaks rarely coincide (kick and snare sit on different steps), so a
tier-4 downbeat sums to about 0.8 before SFX. There is no limiter; T7 confirms
by ear that full volume does not clip.

Hidden tab: `engine.setPaused(true)` (wired to `visibilitychange` in
`music.ts`) clears the interval; on return the scheduler resyncs and skips
stale steps. `ctx.resume()` is guarded by an in-flight flag. Fades freeze the param with
`cancelAndHoldAtTime` (else `cancelScheduledValues`) and always add an explicit
`setValueAtTime(param.value, now)` anchor so the ramp starts at `now`.

## Testing

`src/test/fakeAudio.ts`: a recording fake context (`currentTime` settable,
`createOscillator/Gain/BiquadFilter/BufferSource/Buffer`, param call logs).

- scheduler: fake clock, exactly-once, no drift over 10 000 steps, window
  respected, stall skip, property test (random tick sequences).
- layers: table per tier, clamping, fixed/min tier, property: monotone in combo.
- engine: layer selection per tier via recorded oscillator/buffer-source starts,
  layer gain ramps, crossfade ramps (both gains, 0.5 s, same start), stop, same
  track no-op, retire disconnects, no setTimeout use for timing.
- patterns: every track parses, equal step counts, scale and bpm, helper output.
