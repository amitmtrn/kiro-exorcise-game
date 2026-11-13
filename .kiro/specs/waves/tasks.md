# Waves — Tasks (P1)

## T1 — Path model (pure)
Files: `src/game/paths.ts`, `src/game/paths.test.ts`, `src/game/paths.property.test.ts`

- [x] `PathSpec`, `pathPosition`, `pathDurationMs`, `pathExits`, `marginPx`, `makePath` (line / arc / flyby / drop), `makeSwarm`.
- [x] Unit tests: endpoints exact, bounds for every type over time, flyby edge to edge at several heights, arc bulges toward the centre, swarm lanes, `leftRight` edges.
- [x] Property tests: positions within the extended box (R1.6); uniform canvas scale by `k` scales positions and keeps the duration (R6.2).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(waves-T1): data-driven path model`

## T2 — Wave scripts, intensity curves, bonus config
Files: `src/game/waves.ts`, `src/game/stages.ts`, `src/game/waves.test.ts`

- [x] `WaveScript`, `STAGE_SCRIPTS` for stages 1–4 (none for 5), `BONUS_ROUND`, `intensityAt`, `spawnRateFor`, `speedFactorFor`, `pickPath`; `StageConfig.waves` / `bonusAfter` (stage 2), `stageLabel` in `stages.ts`; `GameState.waveIndex` / `bonus` (initial values).
- [x] Unit tests: kinds enabled in `enemyMix`, events ordered and inside the stage, weights positive, no `drop` on `leftRight` stages, bats only flyby / swarm, boss stage untouched.
- [x] Unit tests: intensity starts ≤ 0.3, non-decreasing up to `peakAt`, max at `peakAt`, peaks rise per stage with stage 4 = 1.0, mapping functions monotonic.
- [x] Unit tests: bonus config has no ghost / skull / lunger, only exiting paths, 15 s.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(waves-T2): wave scripts, intensity curves, bonus config`

## T3 — Path movement, culling, reach rule, candy type
Files: `src/game/state.ts`, `src/game/enemies/candy.ts`, `src/game/enemies/movement.ts`, `src/game/enemies/reach.ts`, `src/game/enemies/waveSpawn.ts`, `src/game/loop.ts`, tests

- [x] `Enemy.path` / `pathMs` / `harmless`, `EnemyType` `'candy'`, `hitboxFor('candy')`.
- [x] `moveSingle` follows `pathPosition`; `cullExitedEnemies` culls finished or fully-exited paths; legacy movement unchanged.
- [x] `isThreat` / `splitReached` in `reach.ts`; `loop.ts` uses it.
- [x] `spawnWave` builds path enemies (ghost, bat, pumpkin, candy).
- [x] Unit tests: movement along a path, legacy enemies unchanged, cull rules, `splitReached` (flyby / harmless / bonus never missed, converging threat missed, skull and boss survive).
- [x] Property tests: frame-rate independent positions through `moveEnemies`; flyby enemies exit and are culled and never culled while visible (R2.2, R6.1).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(waves-T3): path movement, culling and reach rule`

## T4 — Wave-driven spawner
Files: `src/game/enemies/spawn.ts`, `src/game/state.ts` (`waveIndex`), `src/game/round.ts` (reset), tests

- [ ] Timers scaled by intensity; path picked from the script mix; scripted events fire in order via `waveIndex`; cap and skull rules unchanged; stage 5 unchanged.
- [ ] Unit tests: calm start vs peak spawn rate, scripted event timing and truncation, disabled kinds skipped, boss stage spawns nothing.
- [ ] Property tests: cap never exceeded with scripted events, skull uniqueness, events fire in order exactly once under arbitrary tick splits.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(waves-T4): intensity-driven wave spawner`

## T5 — Bonus round
Files: `src/game/state.ts` (`bonus`), `src/game/round.ts`, `src/game/enemies/spawn.ts`, `src/game/collision.ts`, `src/ui/hud.ts`, `src/ui/screens.ts`, tests

- [ ] `advanceToNextStage` inserts the bonus after stage 2; title card and HUD use `stageLabel`; the bonus ends in the normal summary then stage 3; retry never starts in a bonus.
- [ ] `tickSpawners` bonus branch (candy + one-hit harmless pumpkins, exiting paths only).
- [ ] `resolveHits` candy branch (75 × combo; pumpkin 200 × combo).
- [ ] Unit tests: stage 2 → bonus → stage 3 flow, lives and score carried, candy / pumpkin scoring.
- [ ] Property test: a whole simulated bonus round (spawn, move, cull, reach) never reduces lives.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(waves-T5): harmless bonus round`

## T6 — Candy art and docs
Files: `src/game/render.ts`, `README.md`

- [ ] Procedural candy sprite (palette colours, no external assets); ghosts trail along their path direction.
- [ ] README: spec table row, spec count, tree, test count.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `docs(waves-T6): candy art and README`

## T7 — Manual smoke test (webcam)
- [ ] Stage 1 starts calm and gets busier; ghosts arrive from varied points, not one spot; a flyby crosses edge to edge and leaves without a life lost.
- [ ] Bat swarms cross the screen; missing bats costs nothing.
- [ ] Bonus round after stage 2: candy and pumpkins, lives unchanged, then stage 3.
- [ ] Stage 4 peaks, then the boss stage behaves as in boss-phases.
