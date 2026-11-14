# CI Timeout — Requirements

## Goal
The GitHub Pages deploy workflow runs `npm test` before it builds. Since PR #8
that step fails on `main` (runs on `1156313` and `f0e1d20`) with
`quality.property.test.ts > frame budget properties > constant frame time moves
the level in one direction only (R1.5)`: `Test timed out in 5000ms` (5.8 s and
7.2 s on the runner, 0.45 s on a laptop). The live demo has not been redeployed
since `7575a07`. The suite must pass reliably on a slower runner, with no test
weakened.

Out of scope: game code, gameplay, assertion meaning, the global 5 s default.

---

## R1 — The failing property is fast and no weaker

**R1.1** The test keeps its property (a constant frame time moves the quality
level in one direction only, playtest-polish R1.5), its input range (frame time
2–120 ms, every start level 0–3) and `numRuns: 200`.

**R1.2** Its simulated span may be shortened only if the design shows the span
still covers every level change and the refresh-estimate settling of the
controller, with a margin. The span is stated in `design.md` with its arithmetic.

**R1.3** Fixed examples run the original 120 s span at both ends of the range
(2 ms, 120 ms) and at every band edge (the 14 / 20 ms floors, the 60 Hz and
30 Hz scaled thresholds and the 30 Hz snap edges), for every start level.

**R1.4** Its local duration drops to about half (the span is halved; the step cost is unchanged) and the test gets an explicit 30 s timeout, so a 10× slower runner still passes. Before and after timings are recorded in `tasks.md`.

## R2 — Other slow tests are safe on a slow runner

**R2.1** Every test over ~0.4 s locally (anything that a 10× slower runner would
push towards 5 s) is either made faster without weakening it, or has an explicit
per-test or per-describe timeout with a comment saying why it is legitimately long.

**R2.2** Tests that wait on real wall-clock time (the sandbox timeout, the
SIGTERM-to-SIGKILL grace period, child-process teardown) get an explicit timeout
with the reason in a comment.

**R2.3** The global Vitest default stays at 5 s. No `testTimeout` is added to
`vite.config.ts`.

## R3 — Robust workflow

**R3.1** `deploy.yml` keeps `npm test` and every other step. `setup-node` uses
Node 22 because the harness docs and MCP server require Node ≥ 22.

**R3.2** No new network service, secret or action.

## R4 — Duration guard (only if not flaky)

**R4.1** A guard that fails when a test file is too slow is added only if it
can be deterministic. Otherwise it is skipped and the reason is written in
`design.md`.

## R5 — Docs

**R5.1** README and `docs/KIRO.md` test counts match `npm test`; the spec is
listed in the README spec table and tree and in `docs/KIRO.md`; `docs/KIRO.md`
stays within its 450-line cap; `tools/judge-docs.test.mjs` passes.

---

## Acceptance criteria
1. `npm test` passes three times in a row; `npm run build` passes.
2. The R1.5 test runs in about half its old time, has an explicit timeout and fixed edge examples.
3. No test over the threshold lacks an explicit timeout or a speed-up.
4. `deploy.yml` uses Node 22 and is otherwise unchanged.
