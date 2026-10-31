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
| `npm test` | Run all 58 unit tests (Vitest) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build locally |

## Gameplay

- **Ghosts** float toward the center of the screen. Swat them before they arrive — each one that gets through costs a life.
- **Bats** zigzag in fast. Quick swipe to send them packing.
- **Cursed Skull** ☠️ — glows red on purpose. **Don't hit it.** Costs a life if you do.
- 3 lives, 60-second rounds. Game over when lives run out or time expires.

Hit detection uses **frame differencing**: fast motion inside an enemy's hitbox registers as a hit — the same technique as the original EyeToy, no ML required.

**Debug tip:** Press `D` in-game to toggle the hitbox and motion-mask overlay.

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

Each spec has `requirements.md`, `design.md`, and `tasks.md`. Writing requirements and design before tasks surfaced design gaps (e.g. skull penalty rules, hitbox coordinate system, mirror parity bug) that would have been painful to fix mid-implementation.

### Agent hook (`.kiro/hooks/test-on-save.json`)
A Kiro agent hook runs `npm test` automatically whenever a file under `src/` is saved, so test failures surface immediately rather than at commit time.

### What worked well
- Steering docs meant zero "what stack are we using?" back-and-forth — Kiro knew the constraints from turn one.
- The frame-differencing spec (R2, with the tuning-constants table) was detailed enough that Kiro produced a correct, testable implementation on the first attempt.
- The spec for hit-detection-fix identified a mirror-parity bug (display canvas mirrored, motion canvas not) before a single line was written, and the fix came with a unit test proving left/right correctness.
- Pure reducer functions for game state (`src/game/state.ts`) made unit tests trivial to write and fast to run.
- One commit per spec task gives a history that directly traces back to the spec.

## Project structure

```
src/
  main.ts               Entry point — webcam init, loop start, D-key debug toggle
  webcam/
    capture.ts          getUserMedia, mirrored canvas draw
    diff.ts             Frame differencing — mirrored capture, MOTION_W/H,
                        scaleHitbox, calibrateDiffThreshold
  game/
    loop.ts             requestAnimationFrame loop — 320×180 motion canvas,
                        auto-calibrates threshold on start
    state.ts            GameState types + pure reducers
    collision.ts        Per-enemy hit resolution — 2-frame gate, spawn grace,
                        motion pixel export for debug overlay
    particles.ts        Puff spawn + tick
    render.ts           Procedural canvas drawing + debug overlay (D key)
    enemies/
      ghost.ts / bat.ts / skull.ts   Enemy factories
      movement.ts       Per-type movement; hitboxes enlarged 20%
      spawn.ts          Spawn timer ticker
  ui/
    hud.ts              Hearts, timer, score overlay
    screens.ts          Game-over + webcam-error HTML screens
.kiro/
  steering/             product.md, tech.md, design.md
  specs/
    mvp/                requirements.md, design.md, tasks.md
    deploy/             GitHub Pages CI/CD spec
    hit-detection-fix/  P0 swatting fix spec
    boss-combo/         Boss ghost + combo spec
    stages/             5-stage Kung Foo-style progression spec
    audio/              Procedural music + SFX spec
    spooky-skin/        Visual polish spec
  hooks/                test-on-save.json
```

## License

MIT — see [LICENSE](LICENSE).
