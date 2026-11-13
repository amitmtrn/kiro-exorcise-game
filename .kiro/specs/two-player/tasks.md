# Two Player — Tasks

## T1 — Halves, mirror mapping and half-aware hit detection (pure)
Files: `src/game/halves.ts`, `src/webcam/diff.ts`, `src/game/collision.ts`,
`src/game/halves.test.ts`, `src/game/halves.property.test.ts`,
`src/game/collision.test.ts`

- [x] Create `src/game/halves.ts`: `halfWidth`, `halfOffset`, `seatOfX`, `seatOfRawColumn`, `cropMotionHalf`, `toHalfPoints`, `pickWinner`.
- [x] `scaleHitbox` and `resolveHits` take an optional `motionW` (default `MOTION_W`); behaviour without it is unchanged.
- [x] Unit tests: widths / offsets, ownership boundary at `W/2`, raw-column mirror mapping (left of the room = left seat), crop copies the right columns, `motionW = 160` scaling, defaults unchanged, `pickWinner`.
- [x] Property tests: random hitboxes and motion masks never produce a cross-half hit; ownership partitions every x.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(two-player-T1): half geometry, mirror mapping and half-aware hit detection`

## T2 — Seat simulation and session reducers (pure)
Files: `src/game/step.ts`, `src/game/twoPlayer.ts`, `src/game/loop.ts`,
`src/game/twoPlayer.test.ts`, `src/game/twoPlayer.property.test.ts`

- [x] Extract `stepSimulation` from `loop.ts` into `src/game/step.ts` (1P loop calls it; no behaviour change).
- [x] Create `src/game/twoPlayer.ts`: `createTwoPlayer`, shared clock, per-seat step (hit-stop, effects), out / cleared handling, phase sync, `advanceSession`, `winnerOf`.
- [x] Unit tests: independent lives / score / combo, out seat stops spawning while the other continues, out stays out next stage, boss per seat and cleared, shared stage clock, summary → next stage / final, both out → final, winner and tie.
- [x] Property tests: clock identical for both seats and independent of frame split; changes to one seat never alter the other.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(two-player-T2): per-seat simulation and shared-clock session`

## T3 — Mode selection
Files: `src/game/playerMode.ts`, `src/game/loop.ts`, `src/main.ts`,
`src/ui/screens.ts`, `src/game/playerMode.test.ts`, `src/game/loop.mode.test.ts`

- [x] `playerMode.ts`: session-only mode (default 1), `getPlayerMode` / `setPlayerMode`, `modeForStartRequest`.
- [x] Start screen: "1 PLAYER" (old START position) and "2 PLAYERS" motion buttons, remembered mode highlighted; keys 1 / 2 start in that mode, Space uses the remembered mode.
- [x] Unit tests: default, remember, key mapping, Space uses last mode, nothing is stored (no `localStorage` access).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(two-player-T3): 1 / 2 player selection on the start screen`

## T4 — Split-screen loop, HUD, divider and end screen
Files: `src/game/loop.ts`, `src/game/render.ts`, `src/ui/hud.ts`, `src/ui/screens.ts`,
`src/main.ts`, `src/ui/hud.test.ts`

- [x] 2P branch in the loop: per-seat crop, step, `resolveHits` with `W/2` and `motionW = 160`, off-screen half canvases, divider, `lastBanished` snapshot per seat.
- [x] `renderFrame` / `renderHUD` optional per-seat params (banished, motion pixels, combo pulse, mute, P1 / P2 label); single shared mute button at top centre in 2P.
- [x] OUT / CLEARED overlay, 2P stage title and summary, end screen with both scores, winner or tie, PLAY AGAIN / MAIN MENU.
- [x] Unit tests: `muteButtonRect2P`, per-seat pulse isolation, 1P render defaults unchanged.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(two-player-T4): split-screen loop, HUD, divider and end screen`

## T5 — Docs
- [ ] README: two-player section, spec table row, spec count and test count; `.kiro/specs` list.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `docs(two-player-T5): README`

## T6 — Manual smoke test (webcam, two people)
- [ ] Start screen: wave over 1 PLAYER → normal game; MENU → wave over 2 PLAYERS → split screen; keys 1 / 2 / Space.
- [ ] Person on the left of the room plays the left half (their reflection is on the left); motion in the other half never hits.
- [ ] One player loses all lives: that half shows OUT and stops spawning, the other continues; both out → end screen with the winner.
- [ ] Stage 5: each half has its own boss; defeating one shows CLEARED for that half.
- [ ] Tie and winner banners; PLAY AGAIN keeps the mode.
