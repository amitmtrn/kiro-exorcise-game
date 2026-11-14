# CI Timeout — Design

## Cause
The R1.5 property simulates 120 s at a frame time `f` drawn from 2–120 ms, 200
times. Steps per run are `120000 / f`, so small `f` dominates: the mean is
about 4 200 steps, 830 000 `stepFrameBudget` calls in all (each allocates a new
state object). That takes 0.45 s on a laptop with Node 24 and 5.8–7.2 s on the
runner (Node 20, shared vCPU), over the 5 s default.

## Controller timescales (why a shorter span is enough)
`stepFrameBudget` reacts over these windows (`quality.ts`):

| Part | Duration |
|---|---|
| Step down | `DOWN_AFTER_MS` 2 s over budget, then `SETTLE_MS` 3 s |
| Step up | `UP_AFTER_MS` 6 s under budget × `upPenalty` (1 here: the penalty only grows after a step down inside 30 s), then `SETTLE_MS` 3 s |
| Rolling average | time constant `AVG_TAU_MS` 1 s, converges in about 5 s |
| Refresh estimate | creeps up at `REF_CREEP` 0.01 ms per ms, so it needs at most (120 − 16.67) / 0.01 = 10.3 s to follow the slowest frame time |

Longest chain for a constant `f`: the refresh estimate settles by 10.3 s, then
three steps up from level 3 take 6 s + 3 s = 9 s each, 27 s. Upper bound for the
last possible change: 10.3 + 27 ≈ 38 s (about 40 s with the average's
convergence). A later flip would need another full window with unchanged
thresholds, which constant input does not produce.

Measured: a sweep of `f` = 2…120 in steps of 0.37 ms, all four start levels,
over 240 s: the last level change is at 25.3 s (`f` = 31.23, start 3), and the
refresh estimate stops moving by 10.3 s. So a **60 s** span covers the bound
(41 s) with a 1.5× margin and the measurement with a 2.4× margin, and contains
20 settle windows and 10 up-wait windows.

## Test changes (`quality.property.test.ts`)
- The random property runs 60 s instead of 120 s. `numRuns` stays 200, `f`
  stays 2–120, every start level, and an explicit 30 s timeout.
- A new example test runs the **original 120 s** for `f` in
  `[2, 120, 14, 16.67, 18.34, 20, 21.67, 28.9, 29, 36.67, 38.3, 38.4, 43.33]`
  and every start level. These are the extremes and the thresholds: the 14 / 20 ms
  floors, 16.67 × 1.1 and × 1.3, 33.33 × 1.1 and × 1.3, and the 15 % snap edges
  of the 30 Hz class.
- The R1.1 test (step-size independence) is untouched.
- The random property and the examples share a helper that records only the direction of each change, with
  no per-change objects.

## Other slow tests
Measured with `vitest run --reporter=verbose` before the change:

| Test | Local | Action |
|---|---|---|
| `demo.sim.test.ts` full runs | 0.7–2.8 s | Already have 60–240 s per-test timeouts with the reason in the file header; keep. Added a comment at the first one. |
| `mcp-server.test.mjs` SIGKILL grace | 3.4 s | Has 15 s. Comment added: the grace period is real wall-clock time. |
| `mcp-server.test.mjs` sandbox timeout, concurrent run, hung-run kill, signal tests | 0.6–2.0 s | No explicit timeout (5 s default). `describe` timeout 30 s with a comment: they wait on real timers and child processes. |
| `spawn.property.test.ts` BUG-5 | 0.9 s | 600 s of 8–100 ms ticks, 25 runs × 2. Keep the property, add a 30 s timeout with a comment. |
| `bonus.property.test.ts` whole round | 0.7 s | A whole 20 000-tick round per run. 30 s timeout with a comment. |
| `spawn.waves.property.test.ts` intensity-scaled time | 0.4 s | 30 s timeout with a comment. |

The global default is not raised.

## Workflow
`setup-node` `node-version: 20` becomes `22`. The harness README, the MCP
server and `.kiro/settings/mcp.json` need Node ≥ 22 (`node:` APIs used by the
tools tests), and Node 22 is the active LTS. Steps, permissions and actions are
otherwise identical. `package.json` has no `engines` field; none is added.

## Duration guard: skipped
A test that fails when a file takes longer than a budget depends on the machine
(shared runners vary by 10× or more), so it would be flaky by construction.
Vitest's own per-test timeout already is that guard, and R2 gives each long
test an explicit one. A deterministic alternative would be a step-count budget,
but the property's cost is in the controller, which is out of scope.
