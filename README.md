# 👻 Exorcise

A Halloween browser game inspired by the PS2 EyeToy title **Kung Foo**.
Ghosts and bats fly in from the dark edges of the screen toward your webcam image.
**Swat them away with your hands.** Hit a cursed skull and lose a life. Zero install — just open the URL and play.

![Exorcise gameplay](docs/screenshot.png)

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
| `npm test` | Run all 49 unit tests (Vitest) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build locally |

## Gameplay

- **Ghosts** float toward the center of the screen. Swat them before they arrive — each one that gets through costs a life.
- **Bats** zigzag in fast. Quick swipe to send them packing.
- **Cursed Skull** ☠️ — glows red on purpose. **Don't hit it.** Costs a life if you do.
- 3 lives, 60-second rounds. Game over when lives run out or time expires.

Hit detection uses **frame differencing**: fast motion inside an enemy's hitbox registers as a hit — the same technique as the original EyeToy, no ML required.

## How we used Kiro

This project was built spec-first with [Kiro](https://kiro.dev), an AI coding assistant for the terminal.

### Steering docs (`.kiro/steering/`)
Before writing a line of code we used Kiro to generate three steering documents:
- **product.md** — game rules, enemies, lives, scoring
- **tech.md** — stack (Vite + TypeScript), frame-differencing algorithm, tuning parameters, MediaPipe upgrade path
- **design.md** — colour palette, enemy visuals, particle system, audio rules

These files are read automatically by Kiro on every agent turn, so it always has the full product context without needing to be re-briefed.

### Specs (`.kiro/specs/mvp/`)
The MVP was planned as a Kiro spec before implementation began:
- **requirements.md** — 10 requirement groups (R1–R10) covering webcam, hit detection, enemies, lives, score, HUD, and game-over
- **design.md** — canvas layout, TypeScript interfaces (`Enemy`, `Particle`, `GameState`), rendering pipeline order, procedural drawing notes
- **tasks.md** — 12 implementation tasks (T1–T12), each mapping to a source file, with test expectations called out explicitly

Having the spec let us review and adjust the plan *before* any code was written, and gave Kiro a precise checklist to work from.

### Agent hook (`.kiro/hooks/test-on-save.json`)
A Kiro agent hook runs `npm test` automatically whenever a file under `src/` is saved, so test failures surface immediately rather than at commit time.

### What worked well
- Steering docs meant zero "what stack are we using?" back-and-forth — Kiro knew the constraints from turn one.
- Writing requirements and design before tasks surfaced a few design gaps (e.g. skull penalty rules, hitbox coordinate system) that would have been awkward mid-implementation.
- The frame-differencing spec (R2, with the tuning-constants table) was detailed enough that Kiro produced a correct, testable implementation on the first attempt.
- Pure reducer functions for game state (`src/game/state.ts`) made unit tests trivial to write and fast to run.

## Project structure

```
src/
  main.ts               Entry point — webcam init, loop start
  webcam/
    capture.ts          getUserMedia, mirrored canvas draw
    diff.ts             Frame differencing, DIFF_THRESHOLD / HIT_RATIO / SAMPLE_STRIDE
  game/
    loop.ts             requestAnimationFrame game loop
    state.ts            GameState types + pure reducers
    collision.ts        Per-enemy hit resolution
    particles.ts        Puff spawn + tick
    render.ts           Procedural canvas drawing (enemies, particles, flash)
    enemies/
      ghost.ts / bat.ts / skull.ts   Enemy factories
      movement.ts       Per-type movement (wobble, zigzag, straight)
      spawn.ts          Spawn timer ticker
  ui/
    hud.ts              Hearts, timer, score overlay
    screens.ts          Game-over + webcam-error HTML screens
.kiro/
  steering/             product.md, tech.md, design.md
  specs/mvp/            requirements.md, design.md, tasks.md
  hooks/                test-on-save agent hook
```

## License

MIT — see [LICENSE](LICENSE).
