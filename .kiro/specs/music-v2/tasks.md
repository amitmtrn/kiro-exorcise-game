# Music v2 — Tasks

## T1 — Pattern data and parser
Files: `src/audio/music/patterns.ts`, `src/audio/music/patterns.test.ts`

- [x] `TrackDef`, `parseTrack`, note-name parser, bar helpers, and six original tracks (`title`, `stage1`–`stage4`, `boss`).
- [x] Tests: every track parses; equal voice lengths, whole bars; pitches in the allowed scale; bpm 60–160; transposition −5…+5; malformed input throws.
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `feat(music-v2-T1): original track patterns and parser`

## T2 — Look-ahead step scheduler
Files: `src/audio/music/scheduler.ts`, `src/audio/music/scheduler.test.ts`, `src/audio/music/scheduler.property.test.ts`

- [x] `StepScheduler` per design (fake-clock friendly, no timers inside).
- [x] Tests: exactly once, no drift after 10 000 steps, look-ahead window respected, stall skip, tempo math.
- [x] Property test: any non-decreasing tick sequence schedules strictly increasing step times, none beyond `now + lookAhead`, none twice.
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `feat(music-v2-T2): look-ahead step scheduler`

## T3 — Intensity layers
Files: `src/audio/music/layers.ts`, `src/audio/music/layers.test.ts`

- [x] `tierForCombo`, `effectiveTier`, `layersForTier`.
- [x] Tests: per-tier layer table (R3.1), clamping and NaN, fixed and min tier, property: layer set grows monotonically with combo.
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `feat(music-v2-T3): combo intensity layers`

## T4 — Voices, engine and crossfade
Files: `src/audio/music/voices.ts`, `src/audio/music/engine.ts`, `src/test/fakeAudio.ts`, `src/audio/music/engine.test.ts`

- [x] Voice renderers and `createMusicEngine` with buses, layer gains, crossfade, stop, retire.
- [x] Fake audio context for tests.
- [x] Tests: notes per layer per tier, layer gain ramps, crossfade ramps (0.5 s, both buses, same start), stop fade, same-track no-op, retire disconnects, no more steps from the outgoing track, remembered combo tier.
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `feat(music-v2-T4): 3-voice engine with real crossfade`

## T5 — Public API and game wiring
Files: `src/audio/music.ts`, `src/audio/index.ts`, `src/game/loop.ts`, `src/audio/music.test.ts`

- [x] Replace the old `setTimeout` sequencer in `music.ts` with the engine; export `startTitleMusic`, `setMusicCombo`.
- [x] `loop.ts`: title music on the start screen, `setMusicCombo(state.combo)` while playing.
- [x] Tests: stage → track mapping (5 → boss), title idempotence without touching the audio context, mute path (voices connect to the master gain).
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `feat(music-v2-T5): wire engine into game`

## T6 — Docs
- [ ] README: spec table row, spec count, test count; `audio/design.md` note that music is superseded by `music-v2/`.
- [ ] Run `npm test` and `npm run build`; both clean.
- [ ] Commit: `docs(music-v2-T6): README and audio note`

## T7 — Manual listening test
- [ ] Title theme loops without drift; combo x1→x4 adds hat/bass, then drums, lead, arpeggio; crossfade between stages is smooth; boss theme at stage 5; mute and `M` silence it.
