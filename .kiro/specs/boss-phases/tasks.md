# Boss Phases — Tasks

## T1 — Boss phase state machine (pure)
- [x] Add `'victory'` to `GamePhase`; add boss fields (`bossPhase`, `bossAttack`, `bossTimerMs`, `summonTimerMs`, `bossInvulnMs`, `bossStrike`) to `Enemy` and `makeEnemy`.
- [x] Create `src/game/enemies/bossPhases.ts`: `PHASE_PARAMS`, `bossPhaseFor`, `isBossVulnerable`, `onBossHit`, `moveBoss`, `tickBoss`, `createMinion`.
- [x] `createBoss` initialises the new fields; `moveSingle` delegates boss movement to `moveBoss`; stage 5 `enemyMix.ghost = false`.
- [x] Unit tests: thresholds, every phase transition, attack cycle timing (600 / 350 ms wind-up), stagger, one strike per lunge, summons and caps, hit i-frames, vulnerability windows.
- [x] Property tests: phase monotone and consistent with health; timers frame-rate independent; boss stays in bounds.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(boss-phases-T1): 3-phase boss state machine`

## T2 — Hit rules: shield, lunger wind-up, defeat ends the stage
- [x] Create `src/game/enemies/vulnerability.ts` (`isHittable`) and check it in `resolveHits` before the frame-diff gate (resets the hit gate when not hittable).
- [x] Boss hits go through `onBossHit`; phase change shakes the screen; defeat clears minions and sets `summary` (stages 1–4) or `victory` (final stage).
- [x] Update existing lunger collision tests (lunger now needs `windup` / `lunge`).
- [x] Unit tests: shielded boss ignores hits, lunger approach ignores hits, windup/lunge/recover hits count, defeat → summary / victory with minions cleared.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(boss-phases-T2): shielded boss, lunger only hittable in wind-up, defeat ends stage`

## T3 — Timeout and final-stage flow
- [x] `tickTimer`: timer 0 with a live boss → `gameover`.
- [x] `advanceToNextStage` from the last stage → `victory` (no wrap to stage 1); `tickRound` saves the high score in `victory`.
- [x] Unit tests: timeout with boss → game over, without → summary, defeat on the expiry tick → victory (`collision.test.ts`, R6.6), last stage never loops.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(boss-phases-T3): timeout game over and victory flow`

## T4 — Loop, victory screen, art
- [x] `loop.ts`: call `tickBoss` (life-lost sfx on strike), handle the `victory` phase, stop music on victory.
- [x] `screens.ts`: `renderVictory` with total score and "Play Again" / "Main Menu" motion buttons.
- [x] `render.ts`: wind-up shake/glow/"!", shield bubble, phase-3 aura, phase ticks on the health bar, translucent approaching lunger. Procedural canvas only.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(boss-phases-T4): victory screen, boss and lunger telegraphs`

## T5 — Docs
- [x] README: spec table row, spec count and test count; `stages/tasks.md` note that boss behaviour is now defined by `boss-phases/`.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `docs(boss-phases-T5): README and stages note`

## T6 — Manual smoke test (webcam)
- [ ] Phase 1: boss sways along the top and summons a ghost about every 5 s.
- [ ] 4th hit: shake, boss goes shielded between attacks; winds up for ~0.6 s with orange glow, lunges, strikes (life lost) or is staggered by a hit.
- [ ] 7th hit: enrage — shorter wind-up, two minions per summon, red aura.
- [ ] 10th hit: stage ends at once; stage 5 shows YOU WIN with total score; no loop to stage 1.
- [ ] Let the timer run out with the boss alive: game over.
- [ ] A lunger ignores swats while approaching and is hittable once it winds up.

## T7 — Review fixes
- [x] Summons only fire at the hover line; a phase change during recover at the centre keeps the summon queued until the boss is home (R3.7); test added.
- [x] Test: defeat on the timer-expiry tick → victory (R6.6).
- [x] Same-frame game over leaves the boss alive and unscored (`collision.ts` pending defeat); test added.
- [x] Lunge aims at the live canvas centre; timer overshoot carried across idle → windup and recover → idle; tests added.
- [x] Victory buttons labelled "PLAY AGAIN" / "MAIN MENU"; input lockout keyed off the phase transition (`resetVictoryScreen`); redundant `stopMusic()` removed from the victory branch.
- [x] Property tests: lower y bound; lunge and recover durations frame-rate independent.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(boss-phases): summon only at hover, defer boss defeat on game over, timer carry, victory lockout, labels, tests and spec updates` (183c493)

## T8 — Second review fixes
- [x] Summon timer decrements in every attack state (R3.7, R4.2); overshoot carried (≤ 100 ms); cadence tests added.
- [x] Wind-up "!" drawn beside the boss when there is no headroom (R3.2).
- [x] Phase-change flash no longer draws an opaque shield disc.
- [x] Victory: buttons do not update/fill during the lockout; backdrop fades in over 400 ms; entry hooks run on first entry to the victory branch from any route.
- [x] Game over shows "TIME'S UP" when lives remain (R6.5).
- [x] Doc drift: "MAIN MENU" labels, T7 commit line.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(boss-phases): review round 2`
