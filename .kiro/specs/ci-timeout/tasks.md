# CI Timeout — Tasks

Timings are local (Node 24), from `npx vitest run --reporter=verbose`. Touched tests, before → after (explicit timeouts only, speed unchanged): BUG-5 spawn 930 → 977 ms (30 s), bonus round 713 → 1465 ms under load (30 s), intensity-scaled spawn 432 → 409 ms (30 s), sandbox timeout 2004 → 2003 ms (20 s), SIGKILL grace 3427 → 3451 ms (15 s), demo sims 0.7–2.8 s unchanged (60–240 s).

## T1 — Speed up the R1.5 property
Files: `src/game/quality.property.test.ts`

- [x] Measure the before time (445 ms).
- [x] Random property: span 60 s, direction tracking without allocation, same range and `numRuns` 200 (R1.1, R1.2).
- [x] Fixed examples at the original 120 s for 2 ms, 120 ms and every band edge, every start level (R1.3).
- [x] Record the after time here (R1.4): isolated, same machine, 3 runs: 393–487 ms before, 232–272 ms after (about −45 %); the 13 fixed examples cost 1–19 ms each. The test also has a 30 s timeout.
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `test(ci-timeout-T1): faster R1.5 property with fixed edge examples`

## T2 — Explicit timeouts for legitimately long tests
Files: `src/game/enemies/spawn.property.test.ts`, `src/game/enemies/spawn.waves.property.test.ts`, `src/game/bonus.property.test.ts`, `src/demo/demo.sim.test.ts`, `tools/motion-harness/mcp-server.test.mjs`

- [x] Per-test or per-describe timeout with a reason comment on each test in the design table (R2.1, R2.2).
- [x] `vite.config.ts` untouched (R2.3).
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `test(ci-timeout-T2): explicit timeouts for long tests`

## T3 — Node 22 in the deploy workflow
Files: `.github/workflows/deploy.yml`

- [x] `node-version: 22`; nothing else changes (R3.1, R3.2).
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `ci(ci-timeout-T3): run the deploy workflow on Node 22`

## T4 — Docs and counts
Files: `README.md`, `docs/KIRO.md`

- [x] README spec table, tree and spec count; `docs/KIRO.md` spec list and counts (R5.1).
- [x] Run `npm test` three times in a row and `npm run build`; all clean.
- [x] Commit: `docs(ci-timeout-T4): list the spec, sync test counts`

## T5 — Manual: confirm CI
- [ ] Merge, then check that the Deploy workflow is green and the live demo is updated.
