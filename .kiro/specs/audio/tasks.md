# Audio — Tasks (P1)

## T1 — AudioContext + mute/volume
- [x] Create `src/audio/context.ts` with lazy `getAudioContext()`.
- [x] Create `src/audio/index.ts` with `masterGain`, `setMuted()`, `setVolume()`.
- [x] Save/load volume from `localStorage`.
- [x] Unit tests: `setMuted` sets gain to 0; `setVolume` clamps to [0,1].
- [x] Commit: `feat(audio-T1): AudioContext + mute/volume`

## T2 — SFX
- [x] Implement all 8 SFX functions in `src/audio/sfx.ts`.
- [x] Wire into `collision.ts` (ghost hit, bat hit, skull hit), `loop.ts` (life lost), `round.ts` (stage clear, boss defeated).
- [x] Commit: `feat(audio-T2): procedural SFX`

## T3 — Background music sequencer
- [x] Implement `src/audio/music.ts` with `MusicPattern` type and 5 patterns (4 stage + 1 boss).
- [x] `startMusic(stage)` and `stopMusic()` with 0.5 s crossfade.
- [x] Commit: `feat(audio-T3): procedural background music`

## T4 — Mute button + M key
- [x] Add mute toggle button to HUD (HTML overlay, top-right). _(Shipped as a canvas-drawn pill button with a pointerdown hit test — see skin-T5.)_
- [x] Add `M` keydown listener in `main.ts`.
- [x] Commit: `feat(audio-T4): mute button + M key`

## T5 — Integration test (manual)
- [ ] SFX play on ghost/bat/skull hits.
- [ ] Music starts on first gesture, loops, crossfades on stage change.
- [ ] Mute button and M key silence everything.
- [ ] Volume preference survives page reload.
