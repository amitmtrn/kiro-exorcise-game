# 👻 Exorcise

A Halloween browser game inspired by the PS2 EyeToy title **Kung Foo**.
Ghosts and bats fly in from the dark edges of the screen toward your webcam image.
**Swat them away with your hands.** Hit a cursed skull and lose a life. Zero install — just open the URL and play.

## Play now

🎃 **[Live demo →](https://amitmtrn.github.io/kiro-exorcise-game/)**

## How to run locally

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev

# 3. Open the URL printed in the terminal (usually http://localhost:5173)
#    Allow webcam access when the browser asks — that's the whole game.
```

### Other commands

| Command | What it does |
|---|---|
| `npm test` | Run all 167 unit tests (Vitest) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build locally |

## Gameplay

Five Kung Foo-style stages, each 60 seconds, each with its own enemy mix and music.

- **Ghosts** float toward the center of the screen. Swat them before they arrive — each one that gets through costs a life.
- **Bats** zigzag in fast. Quick swipe to send them packing.
- **Lungers** stop, wind up, then lunge at you — hit them during the wind-up.
- **Pumpkins** take two hits.
- **Cursed Skull** ☠️ — glows red on purpose. **Don't hit it.** Costs a life if you do.
- **Stage 5 boss** — a hat-wearing giant ghost with a 10-hit health bar.
- 3 lives. Consecutive hits build a **combo multiplier** (×2 at 3 hits, ×3 at 6, ×4 at 10+; an enemy reaching the centre resets it) and the screen shakes from a 3-hit streak. Enemies move at the same real-time speed on any display refresh rate and scale with screen height; the Cursed Skull leaves after 4 s. A stage-clear screen rates you with stars, and your high score is saved locally.

Hit detection uses **frame differencing**: fast motion inside an enemy's hitbox registers as a hit — the same technique as the original EyeToy, no ML required.

### Controls

| Input | Action |
|---|---|
| Wave over a glowing button | Start / Next / Retry / Menu (hands-only play) |
| `Space` | Start from the title screen |
| `M` or the 🔊 button (top-right) | Mute / unmute |
| `D` | Toggle the hitbox + motion-mask debug overlay |

### Testing hit detection without a webcam

`tools/motion-harness/run.sh sweep` feeds a synthetic 30 fps camera feed to headless Chrome and counts real hits; `run.sh wave` checks that waving over the START button starts the game with no keypress. See `tools/motion-harness/README.md`.

## How we used Kiro

This project was built spec-first with [Kiro](https://kiro.dev), an AI coding assistant for the terminal.

### Steering docs (`.kiro/steering/`)
Before writing a line of code we used Kiro to generate three steering documents:
- **product.md** — game rules, enemies, lives, scoring
- **tech.md** — stack (Vite + TypeScript), frame-differencing algorithm, tuning parameters, MediaPipe upgrade path
- **design.md** — colour palette, enemy visuals, particle system, audio rules

These files are read automatically by Kiro on every agent turn, so it always has the full product context without needing to be re-briefed.

### Specs (`.kiro/specs/`)
Every feature was planned as a Kiro spec before implementation:

| Spec | What it covers |
|---|---|
| `mvp/` | Webcam, hit detection, enemies, lives, HUD, game-over (12 tasks) |
| `deploy/` | GitHub Actions CI/CD, Vite base path, GitHub Pages |
| `hit-detection-fix/` | Mirror bug, 2-frame gate, spawn grace, auto-calibration, debug overlay |
| `boss-combo/` | Boss ghost (3 hits), combo multiplier, audio |
| `stages/` | 5 stages, motion buttons, lunging enemies, high score |
| `audio/` | Procedural Web Audio SFX and background music |
| `spooky-skin/` | Webcam tint, fog, candle glow, screen shake, score pops |
| `feel-fix/` | px/s movement scaled to screen height, skull exits, combo tiers |

Each spec has `requirements.md`, `design.md`, and `tasks.md`. Writing requirements and design before tasks surfaced design gaps (e.g. skull penalty rules, hitbox coordinate system, mirror parity bug) that would have been painful to fix mid-implementation.

All eight specs are implemented. Every task in `tasks.md` is ticked except the manual smoke tests (a webcam playthrough, enabling GitHub Pages in the repo settings), and `boss-combo/` carries a status note explaining it was superseded by `stages/`.

### Agent hook (`.kiro/hooks/test-on-save.json`)
A Kiro agent hook runs `npm test` automatically whenever a file under `src/` is saved, so test failures surface immediately rather than at commit time.

### What worked well
- Steering docs meant zero "what stack are we using?" back-and-forth — Kiro knew the constraints from turn one.
- The frame-differencing spec (R2, with the tuning-constants table) was detailed enough that Kiro produced a correct, testable implementation on the first attempt.
- The spec for hit-detection-fix identified a mirror-parity bug (display canvas mirrored, motion canvas not) before a single line was written, and the fix came with a unit test proving left/right correctness.
- Pure reducer functions for game state (`src/game/state.ts`) made unit tests trivial to write and fast to run.
- One commit per spec task gives a history that directly traces back to the spec.
- The spooky-skin design notes were concrete enough (`rgba(40,0,60,0.22)` tint, `sin(t/4000)` fog drift, `clamp(W/20, 24, 48)` HUD font) that even the visual-polish spec got unit tests against a recording mock canvas context.
- Reconciling each `tasks.md` against `git log` at the end caught two sub-tasks the commits had skipped — the "Calibrating…" banner and the localStorage high-score test — plus a start screen that said "Press Space" with no Space handler.
- The manual smoke tests were the only check on frame differencing, and they hid two bugs: a 30 fps webcam under the 60 fps loop made the 2-frame hit gate impossible to pass, and the motion buttons never received motion pixels at all. A synthetic-webcam harness (`tools/motion-harness`) reproduced both (0 hits in 45 s) and now proves the fix (12 hits, START triggered by waving).

## Project structure

```
src/
  main.ts               Entry point — webcam init, loop start, D / M / Space keys,
                        mute-button tap target
  webcam/
    capture.ts          getUserMedia, mirrored canvas draw
    diff.ts             Frame differencing — mirrored capture, MOTION_W/H,
                        scaleHitbox, calibrateDiffThreshold
  game/
    loop.ts             requestAnimationFrame loop — 320×180 motion canvas,
                        "Calibrating…" banner, all phases, shake + score-label ticks
    state.ts            GameState types + pure reducers (lives, score, combo,
                        shake, score labels, high score)
    round.ts            Phase machine: start → stageTitle → playing → summary
    stages.ts           5 StageConfig entries (enemy mix, spawn rates, music)
    collision.ts        Per-enemy hit resolution — 2-frame gate, spawn grace,
                        combo scoring, shake, hit flash, score pops
    particles.ts        Puff spawn + tick, score-pop labels
    atmosphere.ts       Webcam tint, drifting fog, candle glow
    render.ts           Procedural canvas art (ghost wisps, bat flap, cracked
                        skull, lunger, pumpkin, boss), shake, white hit flash,
                        boss health bar, debug overlay (D key)
    enemies/
      ghost.ts / bat.ts / skull.ts / lunger.ts / pumpkin.ts / boss.ts
      movement.ts       Per-type movement + lunge phase machine; hitboxes +20%
      spawn.ts          Stage-aware spawn timers
  ui/
    hud.ts              Hearts, timer, stage, score, combo (pulse), mute button —
                        outlined glow text, clamp(W/20, 24, 48) font
    motionButton.ts     Wave-to-press buttons driven by frame differencing
    screens.ts          Start, stage title, summary (stars), game over, webcam error
  audio/
    context.ts          AudioContext singleton, master gain, mute / volume
    sfx.ts              8 procedural Web Audio sound effects
    music.ts            Procedural background music sequencer, 5 patterns
.kiro/
  steering/             product.md, tech.md, design.md
  specs/
    mvp/                requirements.md, design.md, tasks.md
    deploy/             GitHub Pages CI/CD spec
    hit-detection-fix/  P0 swatting fix spec
    boss-combo/         Boss ghost + combo spec (superseded by stages/)
    stages/             5-stage Kung Foo-style progression spec
    audio/              Procedural music + SFX spec
    spooky-skin/        Visual polish spec
  hooks/                test-on-save.json
```

## License

MIT — see [LICENSE](LICENSE).
