# Audio — Design (P1)

## Architecture

All audio lives in `src/audio/`:
```
src/audio/
  context.ts   — singleton AudioContext, lazy-init on first user gesture
  sfx.ts       — procedural SFX functions
  music.ts     — looping background music (procedural or file-based)
  index.ts     — re-exports + setMuted(), setVolume()
```

## AudioContext

Created lazily on the first `pointerdown` or `keydown` event to satisfy
browser autoplay policy. Subsequent calls return the cached instance.

```ts
export function getAudioContext(): AudioContext { ... }
```

## SFX (all procedural)

Each SFX function creates short-lived nodes, connects them to a gain node on
the context destination, and lets them auto-GC when finished.

```ts
export function sfxGhostHit(): void    // filtered noise burst, 0.15 s
export function sfxBatHit(): void      // short sine squeak, 0.1 s
export function sfxSkullHit(): void    // 80 Hz sine + low-pass filtered noise, 0.3 s
export function sfxLifeLost(): void    // descending glide 440→220 Hz, 0.5 s
export function sfxCombo(n: number): void  // sine at 220*n Hz, 0.12 s
export function sfxStageClear(): void  // C4→E4→G4 staggered, 0.3 s each
export function sfxBossHit(): void     // 60 Hz sine, 0.3 s
export function sfxBossDefeated(): void // C4→E4→G4→C5, 0.4 s each
```

## Background music (procedural)

> **Superseded by `music-v2/`.** The `setTimeout` single-voice sequencer and its
> unconnected crossfade gain described below were replaced by a look-ahead
> 3-voice engine. SFX, mute and volume sections still apply.

Rather than shipping audio files, background music is generated with a simple
sequencer: a repeating pattern of notes played by an `OscillatorNode` through
a low-pass filter and reverb (convolver with a synthetic impulse response).

Each stage has a `MusicPattern` — a sequence of `{ freq, duration }` objects —
stored in `src/audio/music.ts`. The sequencer loops the pattern.

The boss pattern uses a minor key with faster tempo.

This avoids all licensing complexity and keeps the bundle under 15 kB.

## Mute / volume

```ts
// src/audio/index.ts
let masterGain: GainNode
export function setMuted(muted: boolean): void
export function setVolume(v: number): void   // 0–1
```

`setMuted` sets `masterGain.gain.value` to 0 or restores it. State saved in
`localStorage('exorcise-volume')`.

## Crossfade

`music.ts` keeps a reference to the current pattern's gain node. On stage
transition, ramp the current gain to 0 over 0.5 s, then start the new pattern
with gain ramping from 0 to 1.
