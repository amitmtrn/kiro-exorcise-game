# Balancer — Tasks

## T1 — Metric parsing and stage config reader (pure)
Files: `tools/motion-harness/mcp-server.mjs`, `tools/motion-harness/mcp-server.test.mjs`, `tools/motion-harness/mcp-server.property.test.mjs`

- [x] `parseHarnessOutput`, `validateRunArgs`, `readStageConfig` exported from `mcp-server.mjs` (no side effects on import).
- [x] Unit tests: parsing (valid, noise, last line wins, wrong types, no metrics, truncated JSON), arg validation, stage config shape against the live sources.
- [x] Property tests: parse round-trip with arbitrary noise; `validateRunArgs` domain and shell-metacharacter rejection.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(balancer-T1): harness metric parser and stage config reader`

## T2 — JSON-RPC stdio server and tools
Files: `tools/motion-harness/mcp-server.mjs`, `tools/motion-harness/mcp-server.test.mjs`

- [x] `handleMessage` / `startServer`: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`, error codes.
- [x] `run_harness` (argv spawn, one at a time, process-group timeout) and `read_stage_config`.
- [x] Spawned-server tests with a mock `run.sh` (handshake, list, both calls, bad args, busy, unknown tool/method, malformed JSON, timeout, stdout purity). Chrome is never launched.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(balancer-T2): motion-harness MCP stdio server`

## T3 — Registration and harness hygiene
Files: `.kiro/settings/mcp.json`, `tools/motion-harness/run.sh`, `tools/balancer-config.test.mjs`

- [x] `.kiro/settings/mcp.json` registers `motion-harness` (relative path, no env/url).
- [x] `run.sh`: Chrome limited to loopback with a host-resolver rule; EXIT trap closes Vite and Chrome and their children.
- [x] Config tests (R5.2, R5.3) and a `run.sh` content test (resolver rule, trap).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(balancer-T3): register MCP server, loopback-only harness cleanup`

## T4 — `balancer` agent
Files: `.kiro/agents/balancer.json`, `tools/balancer-config.test.mjs`

- [x] `.kiro/agents/balancer.json` per design (prompt, inline MCP server, restricted tools, permissions, resources).
- [x] Config tests (R6.2, R6.3): no shell/web tools, write only to the report, MCP entry equals the workspace one.
- [x] `kiro-cli agent validate --path .kiro/agents/balancer.json` passes; output recorded below.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(balancer-T4): balancer playtest-tuner agent`

Validation result (kiro-cli 3.3.0): `kiro-cli agent validate --path .kiro/agents/balancer.json` printed nothing and exited 0. Control: an invalid file (`{"name":1,"tools":"x"}`) exits 1 with `invalid type: integer 1, expected a string`. `kiro-cli agent list` shows `balancer  Workspace  (v3 format)`.

## T5 — Real harness run
- [x] Run `tools/motion-harness/run.sh sweep 30` through the MCP server (`tools/call run_harness`), confirm no Vite / Chrome processes remain, record the metrics below.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `docs(balancer-T5): record real sweep metrics`

Metrics (real run, 2026-11-13, via the MCP server `tools/call run_harness {mode: "sweep", seconds: 30}`; headless Chrome with the synthetic 30 fps camera; wall time 39.7 s, exit code 0):

| frames | hits | motionFrames | maxMotion | playFrames | firstPlayAtMs | threshold | highScoreSaved |
|---|---|---|---|---|---|---|---|
| 1791 | 7 | 1664 | 354 | 1614 | 2964 | 15 | null |

Reading: detection works (7 hits, motion on 93 % of ticks, auto-calibrated threshold 15, game left the menu after Space at ~3 s). `highScoreSaved` is null because a 30 s run ends before the stage-1 summary (45 s); the 55 s default would save one. After the run no `vite` / Chrome process and nothing on ports 5173 / 9333 remained (R4.2).

## T6 — Docs
- [x] README: "Balancer agent and motion-harness MCP server" section, spec table row and count, structure entries, test count (`node tools/sync-readme-tests.mjs`); `tools/motion-harness/README.md` pointer.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `docs(balancer-T6): README and harness docs`

## T8 — Review fixes
Files: `tools/motion-harness/mcp-server.mjs`, `run.sh`, `.kiro/settings/mcp.json`, `.kiro/agents/balancer.json`, tests, this spec

- [x] Non-zero exit is `isError` even when a progress line parsed (R3.5a); test with "valid line + exit 3".
- [x] Active run killed on SIGTERM/SIGINT/SIGHUP/stdin end/exit (R3.5b); spawned-server test checks the grandchild is gone.
- [x] `timeout` and `requestTimeout` both 300000 (R5.1); `run.sh` uses `npx --no-install vite` (R3.6).
- [x] `validateRunArgs` rejects unknown properties (R3.4); unit + property test.
- [x] Cross-process lock `out/harness.lock` for the real script (R3.5); tests for held, stale and release.
- [x] Sandbox hardened and tested (R2.3); R1.1 wording aligned; env overrides documented (R3.6).
- [x] Config tests iterate all agent files, balancer.json missing fails (R5.1, R5.2, R6.5); deny list extended (R6.2); prompt explains `highScoreSaved: null` (R6.4).
- [x] `npm test` and `npm run build` both clean.
- [x] Commits: `fix(balancer): ...`

## T9 — Second review fixes
Files: `tools/motion-harness/run.sh`, `drive.mjs`, `mcp-server.mjs`, `.kiro/agents/balancer.json`, tests, this spec

- [x] `run.sh` fails fast (non-zero) when Vite dies or the port already serves a page, bounded wait (R3.6); drive in background so traps fire; escaped `pkill` pattern.
- [x] Agent write permissions cover `.github`, `tsconfig*`, `LICENSE*`, `tools/*` and generated `out/` files; test proves the report path is not shadowed (R6.2).
- [x] Stale metrics are an error: `drive.mjs` exits 2 on a failed evaluation and the server checks the last `t+N` (R1.5).
- [x] Spawned-server tests for SIGHUP and stdin end (R3.5b); second-process lock holder test (R3.5).
- [x] Lock published atomically, unparsable lock handled, released by `killActive` (R3.5).
- [x] Client responses ignored (R3.2a); design drift fixed, wave-order / no-function tests added.
- [x] `npm test` and `npm run build` both clean.
- [x] Commits: `fix(balancer): ...`

## T10 — Third review fixes
Files: `src/game/swipe.property.test.ts`, `tools/motion-harness/mcp-server.mjs`, `run.sh`, `.kiro/agents/balancer.json`, tests, this spec

- [x] Flaky property test `swipe.property.test.ts` made deterministic: cases within 1e-6 of the swipe threshold / unit epsilon are skipped (`fc.pre`).
- [x] Signals and stdin end send SIGTERM, then SIGKILL after the grace period (R3.5b); test that the harness's own trap runs.
- [x] Lock release by `killActive` tested via `EXORCISE_HARNESS_LOCK` (R3.5b).
- [x] `run.sh` refuses to start when the DevTools port already answers (R4.1a).
- [x] `read_stage_config` rejects arguments (R3.3); test.
- [x] Agent denies `out/*.tmp` and `out/*/**`; R6.2 states the unverified glob semantics honestly; T7 stays manual.
- [x] `mcp-server.test.mjs` setup (tmp, imports) moved above first use.
- [x] `npm test` and `npm run build` both clean.
- [x] Commits: `fix(balancer): ...`

## T7 — Manual
- [ ] In Kiro CLI: `kiro-cli chat --agent balancer`, ask for a balance report; confirm it runs the harness and writes `tools/motion-harness/out/balancer-report.md` without touching `src/`.
