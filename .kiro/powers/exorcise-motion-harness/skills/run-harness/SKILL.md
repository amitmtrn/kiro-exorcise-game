---
name: run-harness
description: Run the Exorcise synthetic-webcam motion harness (sweep, wave, demo) and read its metrics. Use when checking that hit detection, wave-to-press buttons or game flow still work without a real camera.
---

# Run the motion harness

The harness starts the Vite dev server, opens headless Chrome with a synthetic
30 fps webcam video, drives the game and prints one metrics line. Chrome is
restricted to loopback. It needs `python3` + `numpy`, `google-chrome` and Node >= 22.

## Modes

| Mode | What the synthetic hand does | Use it to check |
|---|---|---|
| `sweep` | A hand-sized blob sweeps through the enemy path. Space starts the game. | Frame-diff hit detection: `hits` must be > 0. |
| `wave` | The hand waves over the 1 PLAYER button in 2 s bursts. No keypress. | Wave-to-press buttons: `firstPlayAtMs` must be >= 0 within a few seconds. |
| `demo` | No camera. Seeded, deterministic playthrough. | Demo mode only. Added in PR #6; not on branches without it. |

## How to run

Preferred: the `run_harness` tool of the `motion-harness` MCP server
(`mode`: `sweep` or `wave`, `seconds`: 5 to 120, default 30). One run at a time.
A run takes about `seconds` + 10 s.

Shell fallback (from the repo root):

```bash
tools/motion-harness/run.sh sweep 55
tools/motion-harness/run.sh wave 30
SEED=5 tools/motion-harness/run.sh demo 170   # only where demo mode exists (PR #6)
```

## Reading the output

| Field | Meaning | Healthy |
|---|---|---|
| `frames` | requestAnimationFrame ticks | > 0 |
| `hits` | enemies banished | sweep: > 0 |
| `motionFrames`, `maxMotion` | whole-frame motion-mask activity | `motionFrames` > 0 |
| `playFrames`, `firstPlayAtMs` | frames in play; when the game left the menu | wave: `firstPlayAtMs` >= 0 |
| `threshold` | auto-calibrated diff threshold | a number |
| `highScoreSaved` | saved at the stage summary | `null` is normal for runs shorter than stage 1 (45 s) |

Sanity order: `motionFrames` > 0, then `hits` > 0 (sweep) or `firstPlayAtMs` >= 0
(wave). If a sanity check fails, the problem is detection or the harness, not balance.

## Limits

The synthetic hand is a script, not a player. The metrics show that detection
and game flow work. They do not show that difficulty feels right. If a run
errors, report the error text and retry once at most.
