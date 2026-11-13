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

- [ ] `.kiro/settings/mcp.json` registers `motion-harness` (relative path, no env/url).
- [ ] `run.sh`: Chrome limited to loopback with a host-resolver rule; EXIT trap closes Vite and Chrome and their children.
- [ ] Config tests (R5.2, R5.3) and a `run.sh` content test (resolver rule, trap).
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(balancer-T3): register MCP server, loopback-only harness cleanup`

## T4 — `balancer` agent
Files: `.kiro/agents/balancer.json`, `tools/balancer-config.test.mjs`

- [ ] `.kiro/agents/balancer.json` per design (prompt, inline MCP server, restricted tools, permissions, resources).
- [ ] Config tests (R6.2, R6.3): no shell/web tools, write only to the report, MCP entry equals the workspace one.
- [ ] `kiro-cli agent validate --path .kiro/agents/balancer.json` passes; output recorded below.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `feat(balancer-T4): balancer playtest-tuner agent`

Validation result: _(recorded when T4 runs)_

## T5 — Real harness run
- [ ] Run `tools/motion-harness/run.sh sweep 30` through the MCP server (`tools/call run_harness`), confirm no Vite / Chrome processes remain, record the metrics below.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `docs(balancer-T5): record real sweep metrics`

Metrics: _(recorded when T5 runs)_

## T6 — Docs
- [ ] README: "Balancer agent and motion-harness MCP server" section, spec table row and count, structure entries, test count (`node tools/sync-readme-tests.mjs`); `tools/motion-harness/README.md` pointer.
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `docs(balancer-T6): README and harness docs`

## T7 — Manual
- [ ] In Kiro CLI: `kiro-cli chat --agent balancer`, ask for a balance report; confirm it runs the harness and writes `tools/motion-harness/out/balancer-report.md` without touching `src/`.
