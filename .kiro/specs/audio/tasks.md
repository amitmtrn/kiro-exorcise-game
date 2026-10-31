# Audio — Tasks (P1)

## T1 — AudioContext + mute/volume
- [ ] Create `src/audio/context.ts` with lazy `getAudioContext()`.
- [ ] Create `src/audio/index.ts` with `masterGain`, `setMuted()`, `setVolume()`.
- [ ] Save/load volume from `localStorage`.
- [ ] Unit tests: `setMuted` sets gain to 0; `setVolume` clamps to [0,1].
- [ ] Commit: `feat(audio-T1): AudioContext + mute/volume`

## T2 — SFX
- [ ] Implement all 8 SFX functions in `src/audio/sfx.ts`.
- [ ] Wire into `collision.ts` (ghost hit, bat hit, skull hit), `loop.ts` (life lost), `round.ts` (stage clear, boss defeated).
- [ ] Commit: `feat(audio-T2): procedural SFX`

## T3 — Background music sequencer
- [ ] Implement `src/audio/music.ts` with `MusicPattern` type and 5 patterns (4 stage + 1 boss).
- [ ] `startMusic(stage)` and `stopMusic()` with 0.5 s crossfade.
- [ ] Commit: `feat(audio-T3): procedural background music`

## T4 — Mute button + M key
- [ ] Add mute toggle button to HUD (HTML overlay, top-right).
- [ ] Add `M` keydown listener in `main.ts`.
- [ ] Commit: `feat(audio-T4): mute button + M key`

## T5 — Integration test (manual)
- [ ] SFX play on ghost/bat/skull hits.
- [ ] Music starts on first gesture, loops, crossfades on stage change.
- [ ] Mute button and M key silence everything.
- [ ] Volume preference survives page reload.
