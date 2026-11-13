# Motion harness

Runs Exorcise in headless Chrome with a **synthetic webcam** and reports whether
hits and the wave-to-press buttons actually fire. It exists because the manual
smoke tests were the only check on frame differencing, and two bugs lived there
for weeks (see `.kiro/specs/hit-detection-fix/design.md`, "camera frame rate").

| Mode | Video | Expectation |
|---|---|---|
| `sweep` | textured background with sensor noise; a hand-sized blob sweeps through the vertical centre band | Space starts the game; `hits` climbs; a score is saved at the stage summary |
| `wave` | same background; a textured hand waves over the START button | **no keypress**; `firstPlayAtMs` becomes ≥ 0 within a few seconds |

```bash
tools/motion-harness/run.sh sweep 55
tools/motion-harness/run.sh wave 30
```

The video is 320×180 @ 30 fps on purpose: it reproduces the real-world case of
a 30 fps camera under a 60 fps game loop (every other tick sees a duplicate
frame). Output columns: `frames` (rAF ticks), `hits` (enemies banished),
`motionFrames` / `maxMotion` (whole-frame motion mask activity), `playFrames` /
`firstPlayAtMs` (phase probe: the game canvas is transparent mid-screen only
while playing), `threshold` (auto-calibrated diff threshold), `highScoreSaved`.

Requirements: `python3` + `numpy`, `google-chrome` (override with `CHROME=`),
Node ≥ 22. Generated videos and browser profiles land in `out/` (git-ignored).

## MCP server and `balancer` agent

`mcp-server.mjs` exposes `run_harness` and `read_stage_config` to Kiro over stdio (registered in `.kiro/settings/mcp.json`); the report-only `balancer` agent uses them to propose tuning changes. See the README section "Balancer agent and motion-harness MCP server" and `.kiro/specs/balancer/`. Chrome is restricted to loopback (`--host-resolver-rules`) and Vite and Chrome are closed when the run ends.
