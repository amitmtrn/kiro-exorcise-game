# Motion harness

Runs Exorcise in headless Chrome with a **synthetic webcam** and reports whether
hits and the wave-to-press buttons actually fire. It exists because the manual
smoke tests were the only check on frame differencing, and two bugs lived there
for weeks (see `.kiro/specs/hit-detection-fix/design.md`, "camera frame rate").

| Mode | Video | Expectation |
|---|---|---|
| `sweep` | textured background with sensor noise; a hand-sized blob sweeps through the vertical centre band | Space starts the game; `hits` climbs; a score is saved at the stage summary |
| `demo` | **no camera at all**: opens `?demo=1&seed=$SEED` (default 5) without fake-camera flags; the scripted ghost hand plays | `calls.getUserMedia`, `fetch`, `xhr`, `sendBeacon` stay 0; `cardAtMs` (real ms until the Exorcist Card preview opened) becomes ≥ 0 after about 2.5 min; `highScoreSaved` stays `null` |
| `wave` | same background; a textured hand waves over the 1 PLAYER button (30 % from the left, raised-hand zone) in 2 s bursts with 1 s gaps (the start screen's release latch needs the hand to leave once); the driver clicks the onboarding Skip | **no keypress**; `firstPlayAtMs` becomes ≥ 0 within a few seconds |

```bash
tools/motion-harness/run.sh sweep 55
tools/motion-harness/run.sh wave 30
SEED=5 tools/motion-harness/run.sh demo 170
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

## Recording the demo

Demo mode (`.kiro/specs/demo-mode/`) needs no camera and no harness: it is the game itself with a scripted
ghost hand. To film the submission video:

1. `npm run dev`, then open `http://localhost:5173/kiro-exorcise-game/?demo=1&seed=5` in a normal browser window
   sized to the recording (for example 1280×720 or full-screen 1920×1080). The run depends on the canvas size;
   `seed=5` is a clean run (no game over) at 960×540, 1280×720, 1366×768, 1440×900 and 1920×1080.
2. Press `M` twice (mute, unmute). The key press unlocks audio; any other key or a click leaves demo mode
   (browser keys stay: `F1`–`F12` and Ctrl / Cmd / Alt chords such as reload, so `F11` full screen is fine).
3. Start the screen recorder (OBS, the OS recorder, or `chrome --app=<url> --window-size=1280,720` for a chrome-less window).
   The title screen waits a moment, then the ghost hand presses 1 PLAYER. A run takes about 2.5 minutes at the
   default `speed=2`; add `&speed=1` for real-time gameplay (about 5 minutes). The pace is the same on any
   display of 60 Hz or more.
4. Re-take: reload the page (`F5`, Ctrl+R / Cmd+R or the reload button). The same seed at the same window size plays the identical run, and the attract loop
   replays it after the card.

`run.sh demo` is the headless check of the same URL in Chrome: it counts `getUserMedia` / network calls (must stay 0)
and reports when the card preview opened. Nothing is downloaded and the saved high score is not touched.
