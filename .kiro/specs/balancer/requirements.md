# Balancer — Requirements

## Scope

The motion harness (`tools/motion-harness/`) already proves that hits and the
motion buttons work with a synthetic webcam, but its output is a log that a
human has to read. This spec exposes the harness to Kiro as a local **MCP
server** and adds a custom **`balancer` agent** that runs the harness, reads the
current stage / wave tuning and proposes `stages.ts` / `waves.ts` changes as a
written report. The agent never edits game code and never commits.

No gameplay code changes. Gameplay timing stays `deltaMs`-based (nothing here
touches the loop); the only timing in this spec is the harness's wall-clock run
length, which is a test-tool concern.

Builds on `hooks/` (hook format, `.kiro/` is tracked), `hit-detection-fix/`
(metrics meaning), `stages/` and `waves/` (the tuning being read).

Out of scope: remote/HTTP MCP servers, auto-applying tuning, real-webcam
playtests, new runtime dependencies.

---

## R1 — Metric parsing

**R1.1** `parseHarnessOutput(text)` returns the metrics of the **last valid**
progress line printed by `drive.mjs` (`t+<n>s {json}`; a later line that is
truncated or wrongly typed is skipped and the previous valid line is used) as an object with
`frames`, `hits`, `motionFrames`, `maxMotion`, `playFrames`, `firstPlayAtMs`,
`threshold`, `highScoreSaved`.

**R1.2** Numeric fields are finite numbers; `highScoreSaved` is a string or
`null`. A line with a missing or wrongly typed field is rejected, not coerced.

**R1.3** Output with no valid progress line (Chrome failed to start, page not
found) yields an error that includes the tail of the output; it never throws an
unhandled exception and never returns partial or invented metrics.

**R1.5** A run whose *final* progress line (`t+Ns ERR …`, `t+Ns undefined`, a
reloaded page) is not valid metrics is an error, never the last earlier valid
line: stale numbers are not a result. `drive.mjs` also exits 2 in that case, and
the server checks the last `t+N` line itself.

**R1.4** Noise before / between progress lines (`page:`, `monitor:`, `space:`
lines, blank lines, ANSI-free garbage) is ignored. Property: for any valid
metrics object and any noise lines, a progress line round-trips unchanged.

---

## R2 — Stage config reader

**R2.1** `readStageConfig()` returns the live tuning from `src/game/stages.ts`
and `src/game/waves.ts` as JSON: every stage (`id`, `name`, `durationMs`,
`enemyMix`, `spawnEdges`, `spawnIntervalMs`, `speedMultiplier`, `maxEnemies`,
`waves`), plus `bonusRound`.

**R2.2** It reads the TypeScript sources at call time (no copy, no generated
file), so it can never drift from the code, and it uses only the repo's
existing `typescript` dev dependency — no new packages.

**R2.3** It evaluates only those two files in an isolated `vm` context with no
`process`, `fetch` or file access and a `require` that resolves only
`./waves`. `module`, `exports` and `require` are created *inside* the context,
so no host object (and no host `Function`) is reachable from the evaluated code
(`require.constructor('return process')()` throws). The context global has a
null prototype, so `this.constructor.constructor` and bare `constructor.constructor`
resolve to the context's own `Function`, never the host's. Tested.

---

## R3 — MCP server (stdio, local only)

**R3.1** `tools/motion-harness/mcp-server.mjs` is plain Node ≥ 22 with no
dependencies. It speaks newline-delimited JSON-RPC 2.0 on stdin/stdout (MCP
stdio transport), protocol version `2025-06-18` (echoing the client's version
when it is one of the versions it knows).

**R3.2** It implements `initialize` (returns `capabilities.tools`, `serverInfo`),
ignores `notifications/initialized`, answers `ping`, `tools/list` and
`tools/call`. Unknown methods return JSON-RPC error `-32601`; malformed JSON
returns `-32700`; stdout carries only protocol messages (logs go to stderr).

**R3.3** Tools:
- `run_harness { mode: "sweep" | "wave", seconds: integer 5–120 (default 30) }`
  runs `tools/motion-harness/run.sh <mode> <seconds>` and returns the parsed
  metrics as text content (JSON) plus `structuredContent`.
- `read_stage_config {}` returns R2.1. Any argument is rejected with `isError: true`
  (its schema says `additionalProperties: false`).

**R3.4** Invalid arguments (unknown mode, `seconds` out of range or not an
integer, extra shell-looking strings, **unknown properties**) return a tool result with
`isError: true`; they never reach a shell — the script is spawned with an argv
array, never through a shell.

**R3.5** `run_harness` allows one run at a time (the harness uses fixed ports);
a concurrent call returns `isError`. The lock also holds across server
processes: the real harness takes `tools/motion-harness/out/harness.lock`
(published atomically with a hard link of a private temp file, so it is never
visible empty; holds the owner pid; a lock whose pid is dead is stale and
replaced; an unparsable lock is held unless older than 10 s), so a second Kiro session gets `isError` instead of killing the first
run's Chrome. A run is killed (whole process group) after `seconds + 60 s`, and
the result then reports a timeout.

**R3.5a** The result is a success only if the script exits with code 0 **and**
prints a valid progress line. A non-zero exit (crash, signal) is `isError: true`
with the exit code and the output tail, even if earlier progress lines parsed:
partial metrics are never returned (R1.3).

**R3.5b** The server tracks the active run and kills its whole process group on
`SIGINT`, `SIGTERM`, `SIGHUP`, stdin end and process `exit`, so a killed server
never leaves Vite / Chrome behind, and the harness lock is released too. On a
signal or stdin end the group first gets `SIGTERM` (so `run.sh`'s cleanup trap,
including the profile-scoped `pkill`, runs) and `SIGKILL` after a 3 s grace
period; only the synchronous `exit` handler sends `SIGKILL` at once. Each
of SIGINT, SIGTERM, SIGHUP and stdin end is tested with a spawned server, and
lock release by `killActive` is tested directly.

**R3.2a** A message with `result` or `error` and no `method` (a client's reply
to a server request) is ignored, not answered with `-32600`.

**R3.6** Local only: no network listener, no HTTP/SSE transport, no `fetch`, no
runtime package fetch (`run.sh` starts Vite with `npx --no-install`, so a
missing `node_modules` fails instead of downloading). Two environment variables
exist **for tests only** (unit tests never launch Chrome): `EXORCISE_HARNESS_SCRIPT`
(script path; default is the repo's `run.sh`) and `EXORCISE_HARNESS_TIMEOUT_MS`
(timeout override; default `seconds + 60 s`), plus `EXORCISE_HARNESS_LOCK` (lock
file path; setting it makes even a custom script take the cross-process lock,
which lets tests cover lock release). They are not set in any `.kiro`
config. A custom script without `EXORCISE_HARNESS_LOCK` bypasses the lock.

---

## R4 — Harness hygiene

**R4.1** Headless Chrome only loads the local Vite server
(`http://127.0.0.1:<port>/…`): `run.sh` passes a host-resolver rule that makes
every other host unresolvable.

**R4.1a** `run.sh` refuses to start (non-zero exit) when the dev port already
serves the game page **or** the DevTools port already answers, so a leftover
Chrome can never be attached to by mistake and report plausible but stale metrics.

**R4.2** The harness closes everything it started (Vite and Chrome, including
their child processes) when it exits, on success, failure and signals.

---

## R5 — Registration

**R5.1** `.kiro/settings/mcp.json` registers `motion-harness` as a stdio server:
`command: "node"`, `args: ["tools/motion-harness/mcp-server.mjs"]`, relative
path, and **both** `timeout` and `requestTimeout` above the longest run
(120 s + 60 s grace = 180 s; set to 300 000 ms). Which field Kiro treats as the
per-request limit is not confirmed (T7), so neither may be the 30 s default.

**R5.2** No `url`, `type: http|sse`, `env`, `headers`, tokens, keys, absolute
paths, `npx`/`npm exec`/`uvx` or other fetch-at-runtime launchers appear in
`.kiro/settings/mcp.json` or **any** `.kiro/agents/*.json` (checked by a test
that iterates all agent files).

**R5.3** `.kiro/` is not listed in `.gitignore` (existing rule, re-checked).

---

## R6 — `balancer` agent

**R6.1** `.kiro/agents/balancer.json` is a valid custom agent
(`kiro-cli agent validate` passes) named `balancer`, with a prompt that defines
the workflow: read the config, run the harness (sweep, then wave), compare the
metrics with the expectations in `tools/motion-harness/README.md`, and write a
**proposal report** of concrete `stages.ts` / `waves.ts` value changes with
reasoning.

**R6.2** Restricted tool set: `read`, `@motion-harness` and `write` — no
`shell`, no `web`, no `subagent`. Permissions allow writing only the report
file `tools/motion-harness/out/balancer-report.md` (git-ignored) and deny writes
to `src/**`, `.kiro/**`, `.git/**`, `package*.json`, `.gitignore`, `README.md`,
`index.html`, `vite.config.ts`, `tools/*.mjs`, `tools/motion-harness/*.*`, plus `.github/**`, `tsconfig*.json`,
`LICENSE*`, `dist/**`, `node_modules/**`, `tools/*`, `tools/motion-harness/*` and the
generated files in `out/` (`*.log`, `*.y4m`, `*.lock`, `*.tmp`, `*.json`, `profile-*/**`, `*/**`).
The deny globs are single-level where needed so the report in `out/` stays
writable; a test checks that no deny glob matches the report path and that
representative other files are all denied. Unmatched paths are not assumed denied,
so the list covers every top-level entry and the tools directories. Kiro's glob
semantics (whether `*` crosses `/`, and precedence of a specific allow over a deny)
are **not verified** here; the test assumes single-level `*`. Paths that only a
cross-directory glob would catch (for example a brand-new file in the repo root or a
nested `tools/x/y.mjs`) are therefore not guaranteed denied by the rules alone; the
prompt forbids them and T7 (manual) confirms the behaviour in Kiro. Nothing here
gives the agent a shell, so it cannot run `git commit` or `git push`.

**R6.3** `resources` point at the three steering docs and the `stages/` and
`waves/` specs; `includeMcpJson` is `false` and the MCP server is declared
inline, identical to R5.1 (a test checks they match).

**R6.4** The prompt states the limits of the evidence: the synthetic hand is not
a player; metrics prove detection works, not that difficulty feels right, so
proposals must be labelled as hypotheses to confirm in a webcam playtest. It
also says that `highScoreSaved: null` is expected for runs shorter than the
45 s stage 1 and is not a failure.

**R6.5** The config test fails (not skips) if `.kiro/agents/balancer.json` is
missing.

---

## R7 — Recorded evidence and docs

**R7.1** `kiro-cli agent validate` output and one real
`tools/motion-harness/run.sh sweep 30` result (via the MCP server) are recorded
in `tasks.md`.

**R7.2** README gains a section describing the MCP server and the agent, a spec
table row, structure entries, and an up-to-date test count.
