# Balancer — Design

## Layout
```
tools/motion-harness/
  mcp-server.mjs        # R3  JSON-RPC stdio server (+ pure exports)
  mcp-server.test.mjs   # R1–R3 unit tests incl. spawned server with a mock run.sh
  mcp-server.property.test.mjs  # R1.4, R3.4 properties (fast-check)
  run.sh                # R4  host-resolver rule, full cleanup
.kiro/
  settings/mcp.json     # R5  workspace MCP registration
  agents/balancer.json  # R6  custom agent
tools/balancer-config.test.mjs  # R5.2, R6.2, R6.3 config checks
```

## mcp-server.mjs

Exports (pure, unit-tested) and a `main()` that only runs when the file is the
entry point (`import.meta.url === pathToFileURL(process.argv[1]).href`).

| Export | Purpose |
|---|---|
| `parseHarnessOutput(text)` | R1. Scan lines, keep the last *valid* line that matches `^t\+\d+s (\{.*\})$`, `JSON.parse`, validate field types. Returns `{ ok: true, metrics }` or `{ ok: false, error }` (error includes the last 400 chars). |
| `validateRunArgs(args)` | R3.4. Returns `{ mode, seconds }` or throws `ArgError`. `seconds` default 30, integer 5–120. |
| `readStageConfig(root)` | R2. See below. |
| `runHarness({mode, seconds}, opts)` | spawns `bash <script> <mode> <seconds>` (`detached: true`, argv array), collects stdout+stderr, kills the process group on timeout. |
| `handleMessage(msg, ctx)` | one JSON-RPC message → response object or `null` (notifications). |
| `startServer(input, output, ctx)` | line reader over stdin; one JSON object per line; writes responses as one line each. |

### JSON-RPC
`initialize` → `{ protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "motion-harness", version } }`.
`tools/list` → the two tools with JSON-Schema `inputSchema` (`mode` enum,
`seconds` min/max). `tools/call` → `{ content: [{ type: "text", text }], structuredContent, isError }`.
Errors: `-32700` parse, `-32600` invalid request (no `method`), `-32601` unknown
method, `-32602` bad params (missing tool name / unknown tool). Tool-level
failures (bad args, busy, harness error, timeout) are `isError: true` results,
as MCP recommends, so the model can read and react to them.

Concurrency: a module-level `running` flag; a second `run_harness` while
running returns `isError` immediately. Requests are handled concurrently so
`ping` and `read_stage_config` still answer during a long run.

Result rules (R3.5a): `timedOut` → error; non-zero exit → error (exit code +
output tail); no valid line → error; only exit 0 + valid line is a success.

Lifecycle (R3.5b): the active child's pid is kept in a module variable;
`SIGINT`/`SIGTERM`/`SIGHUP`, stdin `close` and `exit` call `killActive()`
(`process.kill(-pid, 'SIGKILL')`) and the signal handlers then `process.exit`.

Cross-process lock (R3.5): only for the default `run.sh`; `out/harness.lock`
opened with flag `wx`, content = pid, stale when `process.kill(pid, 0)` throws
ESRCH; released in `finally` and by `killActive`. Custom scripts (tests) skip it.

Unknown argument properties are rejected by `validateRunArgs` (schema says
`additionalProperties: false`).

Timeout: `seconds * 1000 + 60_000` (test-only override `EXORCISE_HARNESS_TIMEOUT_MS`); `process.kill(-pid, 'SIGTERM')`, then
`SIGKILL` after 3 s. `run.sh`'s own EXIT trap does the normal cleanup (R4.2).

### readStageConfig
`typescript` (already a devDependency) `transpileModule` compiles
`src/game/waves.ts` and `src/game/stages.ts` to CommonJS; `evalSandboxed(code, table)` runs each file in a fresh `node:vm` context whose
only global is a `require` *created inside that context* (a lookup in `table`,
which has exactly `./waves` for stages; everything else throws), with `module`
and `exports` declared inside the context too, so no host `Function` is
reachable. Tests assert `process`/`fetch` are undefined and
`require.constructor('return process')()` throws. Type-only imports are elided by TS, so no other module is needed. The
result `{ stages: STAGES, bonusRound: BONUS_ROUND }` is passed through
`JSON.parse(JSON.stringify())` (drops functions, makes it plain data).

## run.sh changes (R4)
- Chrome gets `--host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"` so
  nothing but loopback resolves (no component updates, no telemetry, no CDN).
- The EXIT trap (`cleanup`) kills Vite and Chrome **and their children**
  (`kill_tree` over `pgrep -P`), then a last-resort `pkill` scoped to this run's
  `--user-data-dir`, then waits. Verified after a real run with
  `pgrep -af "profile-|vite"` (must be empty).

## Config files

`.kiro/settings/mcp.json`:
```json
{ "mcpServers": { "motion-harness": {
  "command": "node",
  "args": ["tools/motion-harness/mcp-server.mjs"],
  "timeout": 300000,
  "requestTimeout": 300000 } } }
```
`.kiro/agents/balancer.json` (current format: `tools` selectors +
`permissions.rules`):
```json
{ "name": "balancer", "description": "...", "prompt": "...",
  "mcpServers": { "motion-harness": { ...same... } },
  "includeMcpJson": false,
  "tools": ["read", "write", "@motion-harness"],
  "permissions": { "rules": [
    { "capability": "mcp", "match": ["motion-harness/*"], "effect": "allow" },
    { "capability": "fs_read", "match": ["**"], "effect": "allow" },
    { "capability": "fs_write", "match": ["tools/motion-harness/out/balancer-report.md"], "effect": "allow" },
    { "capability": "fs_write", "match": ["src/**", ".kiro/**", ".git/**", "package*.json", ".gitignore",
      "README.md", "index.html", "vite.config.ts", "tools/*.mjs", "tools/motion-harness/*.*"], "effect": "deny" } ] },
  "resources": ["file://.kiro/steering/*.md", "file://.kiro/specs/stages/*.md", "file://.kiro/specs/waves/*.md", "file://tools/motion-harness/README.md"] }
```
Exact match patterns are confirmed against `kiro-cli agent validate` output.

## Why report-only
A balance change needs a human playtest with a real hand; the harness can only
show that detection and flow work. So the agent has no way to modify code, and
its report labels each proposal with the metric that motivated it and the
playtest needed to confirm it.

## Tests
- Pure: parsing (valid, noise, last-line-wins, wrong types, empty, truncated
  JSON), `validateRunArgs`, `readStageConfig` (5 stages, ids 1–5, wave events
  sorted, bonus round present, no function values).
- Spawned server with a mock `run.sh` (`EXORCISE_HARNESS_SCRIPT`): handshake,
  `tools/list`, `tools/call` for both tools, bad args, unknown tool/method,
  malformed JSON, concurrent-run rejection, timeout kill (short mock sleep with
  a test-only timeout override), stdout purity.
- Property (fast-check): parse round-trip with arbitrary noise; `validateRunArgs`
  accepts exactly the documented domain and never lets a string with shell
  metacharacters through.
- Config: MCP/agent files have no secrets/urls/env/absolute paths/remote
  launchers; agent tool set has no `shell`/`web`; agent MCP entry equals the
  workspace entry; write permission is limited to the report path.
