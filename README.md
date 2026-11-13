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
| `npm test` | Run all 427 unit tests (Vitest) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build locally |

## Gameplay

Five Kung Foo-style stages, each 60 seconds, each with its own enemy mix and music.

- **Ghosts** float toward the center of the screen. Swat them before they arrive — each one that gets through costs a life.
- **Bats** zigzag in fast. Quick swipe to send them packing.
- **Lungers** stop, wind up, then lunge at you — they can only be hit once the wind-up starts (they look faded until then).
- **Pumpkins** take two hits.
- **Cursed Skull** ☠️ — glows red on purpose. **Don't hit it.** Costs a life if you do.
- **Stage 5 boss** — a hat-wearing giant ghost with a 10-hit health bar and three phases. It summons ghosts while swaying along the top; below 66 % health it hides behind a shield and lunges at you after a glowing, shaking 0.6 s wind-up (hit it then!); below 33 % it enrages with faster lunges and more minions. Beat it to win the game and see your total score; if the timer runs out first, it's game over.
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
| `boss-phases/` | 3-phase boss, lunger wind-up vulnerability, victory screen, boss timeout game over |
| `audio/` | Procedural Web Audio SFX and background music |
| `spooky-skin/` | Webcam tint, fog, candle glow, screen shake, score pops |
| `feel-fix/` | px/s movement scaled to screen height, skull exits, combo tiers |
| `hooks/` | Kiro hooks: test on save, spec/code drift report, README test-count sync |
| `pbt/` | Property-based tests (fast-check): lives, score, spawner cap, mirror parity, combo tiers, frame-rate independence |
| `waves/` | Data-driven wave scripts (line / arc / flyby / drop / swarm paths), per-stage intensity curves, harmless candy bonus round |

Each spec has `requirements.md`, `design.md`, and `tasks.md`. Writing requirements and design before tasks surfaced design gaps (e.g. skull penalty rules, hitbox coordinate system, mirror parity bug) that would have been painful to fix mid-implementation.

All twelve specs are implemented. Every task in `tasks.md` is ticked except the manual smoke tests (a webcam playthrough, enabling GitHub Pages in the repo settings), and `boss-combo/` carries a status note explaining it was superseded by `stages/`.

### Kiro hooks (`.kiro/hooks/`)
Standalone `v1` hook files, loaded by Kiro IDE and Kiro CLI V3. Spec: `.kiro/specs/hooks/`.

| Hook file | Fires on | What it does |
|---|---|---|
| `test-on-save.json` | save of any non-test file under `src/` | Runs `npm test` (test-file saves are handled by `readme-test-count.json`, so the suite runs once) |
| `spec-drift-check.json` | save of `.kiro/specs/*/tasks.md` | Agent checks every ticked task against the code, tests and git log, and reports drift (report only, no edits) |
| `readme-test-count.json` | save, creation or deletion of a `*.test.ts` / `*.test.mjs` file (hooks `readme-test-count`, `readme-test-count-on-create`, `readme-test-count-on-delete`) | Runs `node tools/sync-readme-tests.mjs`: runs the tests and rewrites the test count in this README (`--check` only reports) |

Matchers are not anchored to the repo root. If Kiro passes absolute paths and the checkout itself lives under a `src/` directory, every save would run `npm test`; under a `node_modules/` directory all three hooks would be skipped. Keep the checkout out of such paths.

The original `test-on-save.json` never fired (no `version`, camelCase `postToolUse` trigger); it was rewritten in the current format.

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
    round.ts            Phase machine: start → stageTitle → playing → summary → (victory after stage 5)
    stages.ts           5 StageConfig entries (enemy mix, spawn rates, music, wave script, bonus round)
    paths.ts            Closed-form enemy paths (line, arc, flyby, drop, swarm) — frame-rate and canvas-size independent
    waves.ts            Wave scripts, intensity curves and the bonus round (plain data)
    collision.ts        Per-enemy hit resolution — 2-frame gate, spawn grace,
                        combo scoring, shake, hit flash, score pops
    particles.ts        Puff spawn + tick, score-pop labels
    atmosphere.ts       Webcam tint, drifting fog, candle glow
    render.ts           Procedural canvas art (ghost wisps, bat flap, cracked
                        skull, lunger, pumpkin, boss), shake, white hit flash,
                        boss health bar, debug overlay (D key)
    enemies/
      ghost.ts / bat.ts / skull.ts / lunger.ts / pumpkin.ts / boss.ts
      bossPhases.ts     3-phase boss behaviour
      vulnerability.ts  Per-enemy vulnerability windows
      movement.ts       Per-type movement + lunge phase machine; hitboxes +20%
      spawn.ts          Stage-aware, intensity-scaled spawn timers + scripted wave events
      waveSpawn.ts      Builds path-following enemies (ghost, bat, pumpkin, candy)
      reach.ts          "Reached its target" rule (never for flybys or in the bonus round)
      candy.ts          Harmless bonus-round target
  ui/
    hud.ts              Hearts, timer, stage, score, combo (pulse), mute button —
                        outlined glow text, clamp(W/20, 24, 48) font
    motionButton.ts     Wave-to-press buttons driven by frame differencing
    screens.ts          Start, stage title, summary (stars), victory, game over, webcam error
  test/
    prng.ts             Seeded PRNG for deterministic tests
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
    feel-fix/           Game-feel fixes spec
    boss-combo/         Boss ghost + combo spec (superseded by stages/)
    stages/             5-stage Kung Foo-style progression spec
    audio/              Procedural music + SFX spec
    spooky-skin/        Visual polish spec
    hooks/              Kiro hooks spec
    boss-phases/        3-phase boss + victory spec
    pbt/                Property-based tests spec (`*.property.test.ts`, fast-check)
    waves/              Wave scripts, intensity curves, bonus round spec
  hooks/                test-on-save.json, spec-drift-check.json, readme-test-count.json (save/create/delete)
tools/
  sync-readme-tests.mjs Run tests and sync the README test count (used by a hook)
  sync-readme-tests.test.mjs Unit tests for the sync script's pure functions
  hooks.test.mjs        Structural + matcher tests for .kiro/hooks/*.json
```

## License

MIT — see [LICENSE](LICENSE).
