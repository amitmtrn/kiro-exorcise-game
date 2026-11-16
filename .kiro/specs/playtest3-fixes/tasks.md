# Playtest 3 Fixes — Tasks

## T0 — Spec
- [x] `requirements.md`, `design.md` (root causes) and `tasks.md`.
- [x] Commit: `docs(playtest3-fixes-T0): spec for the third playtest bugs`

## T1 — End screens: the intro plays once, a round trip does not flash
Files: `src/ui/screens.ts`, `src/ui/splitscreen.ts`, `src/game/loop.ts`
- [x] Failing tests first: the first victory frame after a name-screen round trip has the full backdrop alpha and the banner at rest; same for the 2P final; backdrop alpha never drops (1P victory, 1P game over, 2P final) at any frame step.
- [x] `screens.ts`: separate intro clock and input lock; `resetVictoryButtons()`.
- [x] `splitscreen.ts`: `finalIntro` separate from `finalLock`; `resetFinalButtons()`.
- [x] `loop.ts`: name-screen `onDone` uses the button-only resets.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(playtest3-fixes-T1): end screens keep their backdrop and banner after the name screen`

## T2 — Skull lanes: nothing hides a skull
Files: `src/game/skullLane.ts`, `enemies/waveSpawn.ts`, `enemies/spawn.ts`, `enemies/skull.ts`
- [x] Failing tests first: a swarm / flyby spawned beside a skull has no sample inside the skull zone; a skull does not pick the row of a lane on screen.
- [x] `skullLane.ts`: `skullClearancePx`, `skullZone`, `pathHitsZone`.
- [x] `spawnWave` `avoid` (re-roll, thin, empty); `tickSpawners` passes the skull zones, scripted events wait.
- [x] Skull candidates rejected when their zone meets an on-screen lane.
- [x] Property tests (`skullLane.property.test.ts`): new bat / candy / ghost / pumpkin paths stay clear of an active skull; a skull never picks an occupied row; per 2P half and small areas.
- [x] Demo seed 5 sims clean. The game-over coverage test in `demo.sim.test.ts` moves to seed 60 at speed 3 (no seed in 1–16 loses a stage any more).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(playtest3-fixes-T2): keep lanes and skull rows clear of each other`

## T3 — Docs
Files: `README.md`, `docs/KIRO.md`, `tools/judge-docs.test.mjs`
- [x] Property-test count (historical 119 in 31 files kept, current figure added), spec list, test history (PR #12 merged `d693a3d` 1887; playtest3-fixes PR #13 row), credits row left for the operator, README specs tree.
- [x] `tools/judge-docs.test.mjs` passes; `npm test` and `npm run build` clean.
- [x] Commit: `docs(playtest3-fixes-T3): README and KIRO.md for the third playtest`

## T4 — Manual: webcam replay
- [ ] Win a run: closing the name screen on YOU WIN shows no bright flash and no second banner wobble.
- [ ] Stage 4 and 6: no bat swarm flies through a skull's row while it is on screen.
