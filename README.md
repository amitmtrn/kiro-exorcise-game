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
| `npm test` | Run all 1178 unit tests (Vitest) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build locally |

## Gameplay

On your first visit a short onboarding shows a head-and-hands silhouette over your live camera (with a quick framing check), three how-to-play cards and a privacy note. It is skippable (Skip / `Esc`) and remembered in `localStorage`. **Your video stays on your device. Nothing is uploaded.** If the camera is blocked you get step-by-step instructions to allow it.

Five Kung Foo-style stages, each 60 seconds, each with its own enemy mix and music.

- **Ghosts** float toward the center of the screen. Swat them before they arrive — each one that gets through costs a life.
- **Bats** zigzag in fast. Quick swipe to send them packing.
- **Lungers** stop, wind up, then lunge at you — they can only be hit once the wind-up starts (they look faded until then).
- **Pumpkins** take two hits.
- **Cursed Skull** ☠️ — glows red on purpose. **Don't hit it.** Costs a life if you do.
- **Stage 5 boss** — a hat-wearing giant ghost with a 10-hit health bar and three phases. It summons ghosts while swaying along the top; below 66 % health it hides behind a shield and lunges at you after a glowing, shaking 0.6 s wind-up (hit it then!); below 33 % it enrages with faster lunges and more minions. Beat it to win the game and see your total score; if the timer runs out first, it's game over.
- 3 lives. Consecutive hits build a **combo multiplier** (×2 at 3 hits, ×3 at 6, ×4 at 10+; an enemy reaching the centre resets it) and the screen shakes from a 3-hit streak. Enemies move at the same real-time speed on any display refresh rate and scale with screen height; the Cursed Skull leaves after 4 s. A stage-clear screen rates you with stars, and your high score is saved locally.

**Exorcist Card.** On the game-over and victory screens you can choose "📸 EXORCIST CARD" (wave, click or `C`) to make a trading card with a snapshot from your best moment (best combo or the boss defeat), a rank title from *Apprentice Exorcist* to *Grand Exorcist*, your score, best combo, stage and banish count. It is only made when you ask for it, drawn on a canvas on your device and saved with a normal download. The snapshot is kept in memory only, never stored or uploaded (no network request is made), and is dropped when you leave the screen or retry. A *no photo* silhouette variant is one button away.

Hit detection uses **frame differencing**: fast motion inside an enemy's hitbox registers as a hit — the same technique as the original EyeToy, no ML required.

### Two players (split screen)

Pick **1 PLAYER** or **2 PLAYERS** on the title screen (wave over a button, or press `1` / `2`; `Space` starts in the last mode, remembered for the session only). In 2 PLAYERS the mirrored camera view is split down the middle by an orange divider: the player standing on the **left** of the room sees themselves on the left and plays the left half, the other plays the right half. Each half is its own game: enemies, waves, score, lives, combo, hit-stop and HUD. Motion in one half never hits enemies in the other. Both play the same stage on one shared timer; a player who loses all lives shows **OUT** and the other keeps going; on stage 5 each half has its own boss. The end screen shows both scores and the winner (or a tie), and each player can make their **own** Exorcist Card from their own half: their own snapshot (cropped to their half, mirrored like the game), stats, rank title, a P1 / P2 label and a WINNER (or TIE) badge. Each half has its own offer and SAVE / NO PHOTO / CLOSE buttons, operated by a wave or click in that half only; files are `exorcist-card-p1.png` / `-p2.png`. Same single webcam, no network, no video stored. Spec: `.kiro/specs/two-player/`.

### Controls

| Input | Action |
|---|---|
| Wave a hand over a glowing circle for about half a second (keep it moving; a still hand does not press) | Start / Next / Retry / Menu / card buttons (hands-only play). Buttons sit about an arm's length to the left and right of your body (30 % / 70 % of the width in 1 PLAYER), at shoulder-to-overhead height, never at your body or legs, and are reachable with a raised hand from 2.5 m without walking (reach model in the `motion-ui-ergonomics` spec, R9). A ring fills while your hand keeps moving over the circle; MENU and SAVE take about a second. In 2 PLAYERS each player has their own buttons in their half, and either player can press NEXT / PLAY AGAIN / MAIN MENU |
| `Space` | Start from the title screen (in the last chosen mode) |
| `1` / `2` | Start a 1 PLAYER / 2 PLAYERS game from the title screen |
| `M` or the 🔊 button (top-right; top centre in 2 PLAYERS) | Mute / unmute |
| Click / tap a circle | Same as the hand press for the exorcist card buttons (unchanged) |
| `D` | Toggle the hitbox + motion-mask debug overlay |
| `C` (game over / victory, 1 PLAYER only) | Open the Exorcist Card preview; then `S` / `Enter` save, `N` photo ↔ silhouette, `Esc` close |

### Testing hit detection without a webcam

`tools/motion-harness/run.sh sweep` feeds a synthetic 30 fps camera feed to headless Chrome and counts real hits; `run.sh wave` checks that waving over the 1 PLAYER button starts the game with no keypress. See `tools/motion-harness/README.md`.

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
| `juice/` | Swipe-direction estimate from the motion mask, knock-back with spin and fade, 60 ms hit-stop, combo call-outs, stage intro / outro animations |
| `music-v2/` | 3-voice procedural sequencer (bass, noise drums, lead) on a look-ahead scheduler, combo-tier layers, title and boss themes, real 0.5 s crossfade |
| `onboarding/` | First-run silhouette guide with framing check, 3-step how-to, privacy line, camera-denied help, self-hosted Creepster font |
| `two-player/` | Local split-screen mode on one webcam: left / right halves with mirror-correct ownership, per-player state, shared stage clock, OUT / CLEARED, winner or tie |
| `balancer/` | Local stdio MCP server for the motion harness and a report-only `balancer` playtest-tuner agent |
| `exorcist-card/` | Optional shareable trading card (mirrored snapshot, spooky frame, rank title, stats) composed and downloaded locally on game over / victory |
| `motion-ui-ergonomics/` | Raised-hand button zones (an arm's length from the body, within reach at 2.5 m, never torso or legs) from one pure layout module, coverage + dwell + decay activation with a progress ring, entry lockout and release latch on every screen, one action per frame, per-half 2P copies, sound hint moved to the top, onboarding hand targets from the layout |
| `two-player-card/` | Per-player Exorcist Card on the 2P end screen: own half of the camera, own highlight moment and stats, P1 / P2 label, WINNER / TIE badge, per-half wave / click controls |

Each spec has `requirements.md`, `design.md`, and `tasks.md`. Writing requirements and design before tasks surfaced design gaps (e.g. skull penalty rules, hitbox coordinate system, mirror parity bug) that would have been painful to fix mid-implementation.

All twenty specs are implemented. Every task in `tasks.md` is ticked except the manual smoke tests (a webcam playthrough, a two-person split-screen playthrough, the music-v2 listening test, enabling GitHub Pages in the repo settings), and `boss-combo/` carries a status note explaining it was superseded by `stages/`.

### Kiro hooks (`.kiro/hooks/`)
Standalone `v1` hook files, loaded by Kiro IDE and Kiro CLI V3. Spec: `.kiro/specs/hooks/`.

| Hook file | Fires on | What it does |
|---|---|---|
| `test-on-save.json` | save of any non-test file under `src/` | Runs `npm test` (test-file saves are handled by `readme-test-count.json`, so the suite runs once) |
| `spec-drift-check.json` | save of `.kiro/specs/*/tasks.md` | Agent checks every ticked task against the code, tests and git log, and reports drift (report only, no edits) |
| `readme-test-count.json` | save, creation or deletion of a `*.test.ts` / `*.test.mjs` file (hooks `readme-test-count`, `readme-test-count-on-create`, `readme-test-count-on-delete`) | Runs `node tools/sync-readme-tests.mjs`: runs the tests and rewrites the test count in this README (`--check` only reports) |

Matchers are not anchored to the repo root. If Kiro passes absolute paths and the checkout itself lives under a `src/` directory, every save would run `npm test`; under a `node_modules/` directory all three hooks would be skipped. Keep the checkout out of such paths.

The original `test-on-save.json` never fired (no `version`, camelCase `postToolUse` trigger); it was rewritten in the current format.

### Balancer agent and motion-harness MCP server
Spec: `.kiro/specs/balancer/`. The [motion harness](tools/motion-harness/README.md) is exposed to Kiro as a **local stdio MCP server** (`tools/motion-harness/mcp-server.mjs`, plain Node ≥ 22, no dependencies, no network listener), registered in `.kiro/settings/mcp.json` with a relative path and no env or secrets.

| Tool | What it does |
|---|---|
| `run_harness { mode: "sweep" \| "wave", seconds: 5–120 }` | Runs `tools/motion-harness/run.sh` (headless Chrome, synthetic webcam, loopback only) and returns `frames`, `hits`, `motionFrames`, `maxMotion`, `playFrames`, `firstPlayAtMs`, `threshold`, `highScoreSaved`. One run at a time; killed after `seconds + 60 s`. |
| `read_stage_config {}` | Returns the live `STAGES` / wave scripts / bonus round, read from `src/game/stages.ts` and `waves.ts` at call time. |

The **`balancer`** agent (`.kiro/agents/balancer.json`, validated with `kiro-cli agent validate`) uses those tools to run the harness and writes a *proposal report* of `stages.ts` / `waves.ts` value changes to `tools/motion-harness/out/balancer-report.md` (git-ignored). It has `read`, `write` and `@motion-harness` only: no shell, so it cannot commit or push, and writes to `src/`, `.kiro/`, `package*.json` and `.gitignore` are denied. The synthetic hand is not a player, so every proposal is a hypothesis for a real webcam playtest.

```bash
kiro-cli chat --agent balancer
```

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
    framing.ts          Onboarding framing check (too dark / too close / low detail)
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
    halves.ts           Two-player half geometry, mirror mapping, motion crop, winner pick
    twoPlayer.ts        Two-player session: two seats, shared stage clock, OUT / CLEARED, final
    step.ts             One game-time simulation step shared by 1P and each 2P seat
    playerMode.ts       1 / 2 player choice, remembered for the session only
    swipe.ts            Swipe direction from the motion-centroid shift (mirror-correct)
    knock.ts            Banished enemies fly off along the swipe (closed-form drag, spin, fade)
    hitstop.ts          60 ms game-time freeze budget (deltaMs-based)
    callouts.ts         NICE! / GREAT! / PERFECT! and x2-x4 COMBO! call-outs
    transitions.ts      Easing + stage intro / outro poses
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
  card/
    layout.ts           Pure card layout, fitText, coverRect (property-tested to stay inside the card)
    snapshotStore.ts    One in-memory snapshot slot (strictly-better replacement, discard)
    session.ts          Run stats + snapshot + preview lifecycle (discarded on retry / menu)
    snapshot.ts         Mirrored snapshot grab; draw.ts card art; download.ts local PNG download
    halfSnapshot.ts     2P: snapshot of one half only (mirror-correct crop); twoPlayerCard.ts badge / file names
  ui/
    hud.ts              Hearts, timer, stage, score, combo (pulse), mute button —
                        outlined glow text, clamp(W/20, 24, 48) font
    layout.ts           Pure raised-hand button layout for every screen / mode (also used by onboarding and tests)
    buttonSet.ts        Persistent motion buttons keyed by layout id
    motionButton.ts     Wave-to-press buttons: coverage + dwell + decay, release latch, entry lockout, exclusive groups
    muteRect.ts         Mute button rectangle shared by the HUD and the layout
    seatCard.ts         2P per-half card offer / preview with half-only input routing
    screens.ts          Start (1 / 2 player buttons), stage title, summary (stars), victory, game over
    splitscreen.ts      Two-player divider, OUT / CLEARED overlays, shared summary, winner screen
    onboarding.ts       First-run guide, how-to cards, camera-denied screen
    fonts.ts            TITLE_FONT_FAMILY + local font preload (Creepster)
  test/
    prng.ts             Seeded PRNG for deterministic tests
  audio/
    context.ts          AudioContext singleton, master gain, mute / volume
    sfx.ts              8 procedural Web Audio sound effects
    music.ts            Music API (startMusic, startTitleMusic, stopMusic, setMusicCombo)
    music/              patterns, look-ahead scheduler, combo layers, voices, engine + crossfade
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
    juice/              Swipe knock-back, hit-stop, combo call-outs, stage intro / outro spec
    music-v2/           3-voice look-ahead music sequencer spec
    two-player/         Local split-screen two-player mode spec
    balancer/           Harness MCP server + balancer agent spec
    exorcist-card/      Shareable local-only Exorcist Card spec
  settings/mcp.json     Workspace MCP registration (motion-harness, stdio, relative path)
  agents/balancer.json  Report-only playtest-tuner agent
  hooks/                test-on-save.json, spec-drift-check.json, readme-test-count.json (save/create/delete)
tools/
  sync-readme-tests.mjs Run tests and sync the README test count (used by a hook)
  sync-readme-tests.test.mjs Unit tests for the sync script's pure functions
  hooks.test.mjs        Structural + matcher tests for .kiro/hooks/*.json
  balancer-config.test.mjs  MCP / agent config checks (no secrets, local only, restricted tools)
  motion-harness/
    mcp-server.mjs      stdio MCP server: run_harness, read_stage_config (+ unit and property tests)
```

## Credits

- **Creepster** display font — designed by Font Diner, Inc, licensed under the SIL Open Font License 1.1. Self-hosted from `src/assets/fonts/Creepster-Regular.ttf`; no CDN. Licence text: [`src/assets/fonts/OFL.txt`](src/assets/fonts/OFL.txt). Source: the `ofl/creepster` directory of the [google/fonts](https://github.com/google/fonts) repository.

## License

MIT — see [LICENSE](LICENSE).
