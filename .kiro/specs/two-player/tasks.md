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
- [x] README: two-player section, spec table row, spec count and test count; `.kiro/specs` list.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `docs(two-player-T5): README`

## T6 — Manual smoke test (webcam, two people)
- [ ] Start screen: wave over 1 PLAYER → normal game; MENU → wave over 2 PLAYERS → split screen; keys 1 / 2 / Space.
- [ ] Person on the left of the room plays the left half (their reflection is on the left); motion in the other half never hits.
- [ ] One player loses all lives: that half shows OUT and stops spawning, the other continues; both out → end screen with the winner.
- [ ] Stage 5: each half has its own boss; defeating one shows CLEARED for that half.
- [ ] Tie and winner banners; PLAY AGAIN keeps the mode.

## T7 — Review fixes
Files: `src/game/loop.ts`, `src/game/twoPlayer.ts`, `src/ui/hud.ts`, `src/ui/screens.ts`,
`src/ui/splitscreen.ts`, tests, `design.md`

- [x] BLOCKER: 2P button callbacks (PLAY AGAIN, MAIN MENU, NEXT) are applied after the tick instead of being overwritten by `tickTwo`'s result (R3.4, R5.2, R6.3); loop tests drive them.
- [x] CLEARED is shown for a seat whose boss is defeated while the session is still playing (`seatStatus` → `cleared`) (R4.2, R3.3); test.
- [x] `startRequest` is cleared during a 2P game so keys do not leak to the start screen (R6.2); test.
- [x] Shared mute button moved below the top HUD row; test updated.
- [x] Divider drawn below the HUD layer (R1.5).
- [x] A seat that goes out has its enemies cleared (R4.1); test.
- [x] Remembered-mode ring is Pumpkin Orange.
- [x] `design.md` corrected (function names, signatures, `ui/splitscreen.ts`, `toHalfPoints`).
- [x] Summary `nextBtn` rebuilt on a height-only resize.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(two-player): apply 2P button actions after the tick, show CLEARED, clear stray keys, layout and doc fixes` (05b1ed6)

## T8 — Second review fixes
Files: `src/game/halves.ts`, `src/game/loop.ts`, `src/game/twoPlayer.ts`, `src/ui/screens.ts`,
`src/ui/splitscreen.ts`, tests, `design.md`, `README.md`

- [x] SHOULD-FIX: start-screen lock-out + button rebuild on entry so MENU's wave cannot start a game (R7.1); test `screens.start.test.ts`.
- [x] SHOULD-FIX: integer `halfWidth` (`floor(W/2)`), used for canvases, offsets and divider; test with odd width.
- [x] NIT: summary / final buttons rebuilt on phase entry; final-screen radius follows resize.
- [x] NIT: mute button drawn after overlays; no clear jingle when both players are out.
- [x] NIT: skip motion crop on duplicate camera frames; `twoPlayerActive` reset on MAIN MENU and in `startLoop`.
- [x] NIT: 2 PLAYERS button clamped on narrow screens; tasks bookkeeping (T7 commit subject, order); README count.
- [x] `npm test` and `npm run build` both clean (883 passed).
- [x] Commit: `fix(two-player): second review fixes`

## T9 — Third review fixes (verdict READY; NITs)
Files: `src/game/halves.ts`, `src/game/loop.ts`, `src/game/twoPlayer.ts`, `src/ui/screens.ts`,
`src/ui/splitscreen.ts`, tests, `design.md`

- [x] NIT: start-screen lock-out reset by explicit `resetStartScreen()` instead of a 250 ms render gap; test.
- [x] NIT: start buttons never overlap / leave the canvas on narrow widths; test.
- [x] NIT: shared summary shows only the score for an out seat.
- [x] NIT: 2P seat ticks the clock after the simulation, like 1P (wave thresholds identical); test.
- [x] NIT: `cropMotionHalf` reuses per-seat scratch buffers (optional `slot`); test.
- [x] NIT: `seatStatus` dead branch simplified and documented; test.
- [x] NIT: `twoPlayerActive` set in `begin(2)`.
- [x] `npm test` and `npm run build` both clean (887 passed).
- [x] Commit: `fix(two-player): third review fixes`


## T10 — Merge integration with exorcist-card
Files: `src/game/loop.ts`, `src/main.ts`, `src/ui/screens.ts`, `src/game/loop.card.test.ts`, `README.md`, both `design.md`

- [x] Both features kept: 1P card offer on game over / victory, 2P split-screen end screen.
- [x] Card is 1P only: no card bookkeeping, snapshot or input in 2P; test added. (superseded: per-player cards, see `two-player-card/`)
- [x] Decision recorded in both specs' `design.md`.
