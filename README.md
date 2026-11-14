# 👻 Exorcise

A camera-motion Halloween brawler that runs in the browser.
Ghosts and bats fly in from the dark edges of the screen toward your webcam image.
**Swat them away with your hands.** Hit a cursed skull and lose a life. Zero install — just open the URL and play.

## Play now

🎃 **[Live demo →](https://amitmtrn.github.io/kiro-exorcise-game/)**

## Built with Kiro (for judges)

- **Kiro CLI 3.3.0 only**, run non-interactively: spec, implement, independent read-only review, Kiro fixes.
- **20 specs** at PR #5 in [`.kiro/specs`](.kiro/specs) (requirements, design, tasks): 805 ticked task checkboxes, 89 commits named after a task (`<type>(<spec>-T<n>)`).
- **3 steering files** in [`.kiro/steering`](.kiro/steering), **5 hooks** in [`.kiro/hooks`](.kiro/hooks), **1 custom agent** (`balancer`) and **1 local MCP server** (`motion-harness`, stdio only, no network).
- **1120 tests** at PR #5, 0 failed, 0 skipped; **119 property tests** (`fc.assert`) in 31 files, both at PR #5 (df26f4d). A property found a spawner-cap bug that unit tests had missed (BUG-1), and four more bugs got regression properties.
- **One PR per feature from #2 on** (#1 bundled the P0/P1 specs): #1 to #7 merged (#6 is demo mode, merge commit 46d9551; #7 is the judge write-up, merge commit 7575a07). Test count by PR: 806, 912, 994, 1045, 1120, 1254, 1291; #8 playtest-polish: 1515; more-content (this branch): 1719.
- **777.68 Kiro credits** used after the more-content spec and its review fixes (bonus pool of 4000).
- **Read the full write-up: [docs/KIRO.md](docs/KIRO.md).** Local power: [`.kiro/powers/exorcise-motion-harness`](.kiro/powers/exorcise-motion-harness).
- **Live demo:** <https://amitmtrn.github.io/kiro-exorcise-game/>

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
| `npm test` | Run all 1719 unit tests (Vitest) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build locally |

## Gameplay

On your first visit a short onboarding shows a head-and-hands silhouette over your live camera (with a quick framing check), three how-to-play cards and a privacy note. It is skippable (Skip / `Esc`) and remembered in `localStorage`. **Your video stays on your device. Nothing is uploaded.** If the camera is blocked you get step-by-step instructions to allow it.

Six stages of 45 to 60 seconds, each with its own enemy mix and music. Stage 5 is a boss fight; stage 6, **The Midnight Finale**, brings three new ghosts and the final boss.

- **Ghosts** float toward the center of the screen. Swat them before they arrive — each one that gets through costs a life.
- **Bats** zigzag in fast. Quick swipe to send them packing.
- **Lungers** stop, wind up, then lunge at you — they can only be hit once the wind-up starts (they look faded until then).
- **Pumpkins** take two hits.
- **Cursed Skull** ☠️ — glows red on purpose. **Don't hit it.** Costs a life if you do.
- **Stage 5 boss** — a hat-wearing giant ghost with a 10-hit health bar and three phases. It summons ghosts while swaying along the top; below 66 % health it hides behind a shield and lunges at you after a glowing, shaking 0.6 s wind-up (hit it then!); below 33 % it enrages with faster lunges and more minions. Beat it to clear the stage; if the timer runs out first, it's game over.
- **Twin Wisps** ∞ (stage 6) — a small pair joined by a line. The first swat lights one up with a shrinking ring; swat the other within 2 s to banish both. If the ring runs out (it blinks slowly for the last 0.5 s) the wisp goes back to normal. A pair that reaches the centre costs one life.
- **Mirror Ghost** ▮ (stage 6) — spawns behind a hexagonal shield that absorbs swats with a clink (no score, no penalty). Two waves, or 1.5 s, crack it; 0.5 s of cracks later it is open (▯) for 1.8 s, then the shield fades back in.
- **Blink Ghost** ◆ (stage 6) — solid for 2.1 s (◆, solid outline), then ethereal for 1.9 s (◇, dashed outline, see-through), on a steady 4 s rhythm with a 0.5 s fade before each change. Swats only count while it is solid.
- **The Hollow King** (stage 6 finale) — a crowned giant ghost that enters 22 s into the stage after a "THE HOLLOW KING!" warning. It uses the stage-5 boss rules (10 hits, three phases, shielded between attacks) with longer wind-ups (0.7 s / 0.45 s), slower lunges, and the new ghosts as minions. Beat it to win the game (+2000 bonus) and see your total score.
- Every new ghost changes state only after a visible telegraph of at least 0.4 s, has its own icon and outline in both palettes (not just a colour), never spawns next to a Cursed Skull, and follows the reduced-flashing setting. The stage-6 title card shows a hint line for each.
- 3 lives. Consecutive hits build a **combo multiplier** (×2 at 3 hits, ×3 at 6, ×4 at 10+; an enemy reaching the centre resets it) and the screen shakes from a 3-hit streak. Enemies move at the same real-time speed on any display refresh rate and scale with screen height; the Cursed Skull leaves after 4 s. A stage-clear screen rates you with stars, and your high score is saved locally.

**Exorcist Card.** On the game-over and victory screens you can choose "📸 EXORCIST CARD" (wave, click or `C`) to make a trading card with a snapshot from your best moment (best combo or the boss defeat), a rank title from *Apprentice Exorcist* to *Grand Exorcist*, your score, best combo, stage and banish count. It is only made when you ask for it, drawn on a canvas on your device and saved with a normal download. The snapshot is kept in memory only, never stored or uploaded (no network request is made), and is dropped when you leave the screen or retry. A *no photo* silhouette variant is one button away.

Hit detection uses **frame differencing**: fast motion inside an enemy's hitbox registers as a hit — the same technique as classic webcam motion games, no ML required.

### Two players (split screen)

Pick **1 PLAYER** or **2 PLAYERS** on the title screen (wave over a button, or press `1` / `2`; `Space` starts in the last mode, remembered for the session only). In 2 PLAYERS the mirrored camera view is split down the middle by an orange divider: the player standing on the **left** of the room sees themselves on the left and plays the left half, the other plays the right half. Each half is its own game: enemies, waves, score, lives, combo, hit-stop and HUD. Motion in one half never hits enemies in the other. Both play the same stage on one shared timer; a player who loses all lives shows **OUT** and the other keeps going; on stages 5 and 6 each half has its own boss. The end screen shows both scores and the winner (or a tie), and each player can make their **own** Exorcist Card from their own half: their own snapshot (cropped to their half, mirrored like the game), stats, rank title, a P1 / P2 label and a WINNER (or TIE) badge. Each half has its own offer and SAVE / NO PHOTO / CLOSE buttons, operated by a wave or click in that half only; files are `exorcist-card-p1.png` / `-p2.png`. Same single webcam, no network, no video stored. Spec: `.kiro/specs/two-player/`.

### Controls

| Input | Action |
|---|---|
| Wave a hand over a glowing circle for about half a second (keep it moving; a still hand does not press) | Start / Next / Retry / Menu / card buttons (hands-only play). Buttons sit about an arm's length to the left and right of your body (30 % / 70 % of the width in 1 PLAYER), at shoulder-to-overhead height, never at your body or legs, and are reachable with a raised hand from 2.5 m without walking (reach model in the `motion-ui-ergonomics` spec, R9). A ring fills while your hand keeps moving over the circle; MENU and SAVE take about a second. In 2 PLAYERS each player has their own buttons in their half, and either player can press NEXT / PLAY AGAIN / MAIN MENU |
| `Space` | Start from the title screen (in the last chosen mode) |
| `1` / `2` | Start a 1 PLAYER / 2 PLAYERS game from the title screen |
| `M` or the 🔊 button (top-right; top centre in 2 PLAYERS) | Mute / unmute |
| Click / tap a circle | Same as the hand press for the exorcist card buttons (unchanged) |
| `D` | Toggle the hitbox + motion-mask debug overlay (also shows the quality level, frame time and diff resolution) |
| `O` or the ⚙ button (bottom-left, title screen) | Open the settings panel: `↑` / `↓` select, `Enter` / `Space` / click change, `Esc` or `O` close. Keyboard and mouse / touch only (no wave button: the title's raised-hand zones are taken by 1 PLAYER and 2 PLAYERS) |
| `G` (title screen) | Start the camera-free demo / attract mode; in demo mode any key (except `M`) or click returns to the normal game |
| `C` (game over / victory, 1 PLAYER only) | Open the Exorcist Card preview; then `S` / `Enter` save, `N` photo ↔ silhouette, `Esc` close |
| Wave over ◀ / ▶ / OK (name screen after a high score; each half has its own in 2 PLAYERS) | ◀ / ▶ pick a letter (the first press starts a new name at `A`), OK moves to the next of 3 letters and saves on the last. Doing nothing keeps the generated name (saved after 10 s) |
| Type `A`–`Z`, `0`–`9`, `-`, `Backspace`, `Enter` (name screen; P1 in 2 PLAYERS) | Type a name of up to 8 characters, `Enter` saves. While the name screen is open these keys type (so `M`, `D`, `C` do not mute, debug or open the card; the 🔊 button still works) |

### Demo / attract mode (no camera)

Open the game with `?demo=1` (for example `http://localhost:5173/kiro-exorcise-game/?demo=1&seed=5`) or press `G` on the title screen. The webcam is never requested (no permission prompt) and onboarding is skipped. A scripted, translucent **ghost hand** plays a full run through the real game code: its motion is fed into the same frame-differencing hit detection as a camera, so combos up to x4, hit-stop, knock-back, call-outs, the waves, the bonus round and the three boss phases all happen as they would for a player. It presses the motion buttons with the normal dwell, never touches the Cursed Skull, wins, opens the Exorcist Card (a drawn placeholder portrait and a **DEMO** chip, never downloaded), returns to the title and plays again. A **DEMO** badge is on screen the whole time, and demo scores are never written to your saved high score. Any key (except `M`) or click returns to the normal game.

| Parameter | Meaning |
|---|---|
| `demo=1` | Start in demo mode (`demo=0` or no parameter: normal game) |
| `seed=N` | Run to play (default `6`). Same seed + same window size = the identical run every time |
| `stage=N` | Start at stage N (1–6) |
| `speed=N` | Game speed, 1–3 (default 2: a full run takes about 2.5 minutes; other values use the default) |

**Recording the submission video.** Set the browser window to the size you will record (the run depends on the canvas size; `seed=5` plays a clean run without a game over at 960×540, 1280×720, 1366×768, 1440×900 and 1920×1080), open `?demo=1&seed=5`, press `M` twice (mute, unmute: this key press also unlocks audio) and start the screen recorder. Reload the page for a re-take (F5 / Ctrl+R / Cmd+R and F11 for full screen do not leave demo mode): it plays the same run again. Use `speed=1` for real-time gameplay; the pace is the same on any display of 60 Hz or more. See `tools/motion-harness/README.md` for a headless check. Spec: `.kiro/specs/demo-mode/`.

### High scores

The game keeps a **top-10 table** in `localStorage` (key `exorcise-highscores`): name, score, stage reached, date and 1P / 2P, nothing else (never video or images). A finished run that makes the table is saved at once under a generated spooky name such as `GHOST-7F`, then a name screen lets you change it with the ◀ / OK / ▶ motion buttons (raised-hand zones, like every other button) or the keyboard. In 2 PLAYERS each player gets their own name screen in their own half, at the same time, and both entries are marked 2P. The title screen shows the table (two pages of 5, switching every 4 s) and the game-over and victory screens show the top 5 with your entry highlighted. An older saved single high score is moved into the table once as `OLD-BEST`. Demo mode reads and writes nothing. Spec: `.kiro/specs/more-content/`.

### Settings, URL parameters and quality

Open the settings panel on the title screen with `O` or the ⚙ button. Settings are stored in `localStorage` under one key (`exorcise-settings`) and hold only these values, never video or images.

| Setting | URL parameter (this visit only, not saved) | Effect |
|---|---|---|
| Colourblind-safe colours | `?cb=1` (`0` = off) | Okabe-Ito palette for the enemies, P1 / P2, lives, score, combo and button rings. Colour is never the only cue: the Cursed Skull keeps its shape and gets a dashed pulsing ring and a "!" , P1 / P2 get ● / ■ marks, button rings differ in pattern (dotted idle, solid filling, dashed for MENU / SAVE) |
| Text size 100 / 125 / 150 % | `?bigtext=1` (125 %), `?bigtext=2` (150 %), `0` = 100 % | HUD, call-outs, score pops, menus, onboarding text. Menu text still fits its band, the stage label shrinks to stay between the hearts and the timer. The two-player end screens keep their size |
| Reduced flashing | `?reducedflash=1` (`0` = off) | Full-screen flash capped at alpha 0.15 (from 0.4) with soft fades and at most 3 flashes per second (WCAG 2.3.1), screen shake at 25 %, no white hit silhouette. On by default when the browser asks for `prefers-reduced-motion` |

URL parameters win over stored values for that visit; a change in the panel replaces the parameter for that setting. The privacy line is unchanged: **Your video stays on your device. Nothing is uploaded.**

**Quality (`?quality=low|med|high|auto`, default `auto`).** The game watches the frame time (rolling average, time constant 1 s) and steps down one level when it stays above 20 ms for 2 s, back up when it stays below 14 ms for 6 s (both limits scale with the display's refresh rate, so a 60 Hz screen or a 30 fps-capped browser can step back up; a display that has run faster and then drops to a steady 30 fps counts as a slow machine and steps down), with a 3 s settle time and a longer wait after a quick down-up-down so it never flip-flops. `high` pins level 0, `med` level 2, `low` level 3. Demo mode always runs at level 0.

| Level | What changes |
|---|---|
| 0 | Full quality: 320 × 180 motion grid |
| 1 | Every 2nd particle, one combo call-out at a time |
| 2 | Motion grid 160 × 90 (hitboxes map through normalised space, the 2-frame gate and published motion are reset on the change, the noise calibration is kept) |
| 3 | Motion grid 96 × 54, no fog, steady candle glow |

Analysis cost per frame (motion mask + 6 hitbox diffs on a 1280 × 720 display, one development machine, `npx vitest run src/webcam/grid.bench --disableConsoleIntercept`; timings vary by machine):

| Grid | Mask samples | ImageData read per frame | JS analysis |
|---|---|---|---|
| 320 × 180 | 3600 | 450 KB | 26.5 µs |
| 160 × 90 | 3600 | 113 KB | 26.7 µs |
| 128 × 72 | 2304 | 72 KB | 17.9 µs |
| 96 × 54 | 5184 | 41 KB | 44.1 µs |

The JS analysis is small at every size (under 50 µs of a 16.7 ms frame). At level 3 it is the most expensive step, about 1.6× level 0, because the 96 × 54 grid samples every pixel (stride 1) so small enemies keep their sample count. Only the smaller `drawImage` / `getImageData` copy before it shrinks (11× fewer bytes at 96 × 54), which Node cannot time. Spec: `.kiro/specs/playtest-polish/`.

**Audio levels.** All sound goes through one master gain (volume and mute), a bus compressor (−18 dB, 3:1) and a limiter (−3 dB, 20:1, 1 ms attack), then the speakers. Every sound effect has a loudness-table gain so its RMS is about −22 dBFS with a peak under −3 dBFS before the limiter; the music is about 6 dB quieter (estimated analytically from its voices). Boss hit + combo chime + ghost hit + music stay under 0 dBFS in the mixing test. Still no audio files.

### Testing hit detection without a webcam

`tools/motion-harness/run.sh sweep` feeds a synthetic 30 fps camera feed to headless Chrome and counts real hits; `run.sh wave` checks that waving over the 1 PLAYER button starts the game with no keypress; `run.sh demo` runs the demo mode in headless Chrome and reports camera / network calls and when the card opened. See `tools/motion-harness/README.md`.

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
| `playtest-polish/` | Adaptive quality (frame-budget monitor, 320 → 160 → 96 wide motion grid, `?quality=`), master compressor / limiter and per-sound loudness table, settings panel (`O`), colourblind palette with shape cues and CIEDE2000 tests, bigger text, reduced flashing (≤ 3 per second) |
| `demo-mode/` | Camera-free attract mode for filming: `?demo=1&seed=N` or `G`, a deterministic scripted ghost hand that feeds synthetic motion frames into the real hit detection, fixed time step and seeded run, DEMO badge, placeholder card portrait, scores never saved |
| `judge-docs/` | Judge-facing Kiro write-up (`docs/KIRO.md`), README section, local `exorcise-motion-harness` power, facts-check test |
| `more-content/` | Three new ghosts (twin wisps, mirror ghost, blink ghost) with telegraphed state machines and fairness property tests, stage 6 "The Midnight Finale" with the Hollow King and its own music, local top-10 high scores with motion-button name entry (1P and per half in 2P) |

Each spec has `requirements.md`, `design.md`, and `tasks.md`. Writing requirements and design before tasks surfaced design gaps (e.g. skull penalty rules, hitbox coordinate system, mirror parity bug) that would have been painful to fix mid-implementation.

All twenty-four specs are implemented. Every task in `tasks.md` is ticked except the manual smoke tests (a webcam playthrough, a two-person split-screen playthrough, the music-v2 listening test, a demo-mode browser check, the more-content webcam check, enabling GitHub Pages in the repo settings), and `boss-combo/` carries a status note explaining it was superseded by `stages/`.

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
    grid.ts             Adaptive motion grid (320×180 → 160×90 → 128×72 → 96×54)
  game/
    loop.ts             requestAnimationFrame loop — 320×180 motion canvas,
                        "Calibrating…" banner, all phases, shake + score-label ticks
    state.ts            GameState types + pure reducers (lives, score, combo,
                        shake, score labels, high score)
    round.ts            Phase machine: start → stageTitle → playing → summary → (victory after stage 6)
    stages.ts           6 StageConfig entries (enemy mix, spawn rates, music, wave script, bonus round, new-ghost events, finale)
    finale.ts           Stage 6: boss entrance time, tip call-outs, the Hollow King banner
    highScores.ts       Top-10 table: validation, ordering, migration, localStorage (scores only)
    persistence.ts      High-score persistence switch (off in demo mode)
    nameEntry.ts        Name picker / keyboard state and timeouts (pure)
    renderVariants.ts   Art of the new ghosts (state icons, outlines, link line, ring timer)
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
    quality.ts          Frame-budget monitor, quality levels, ?quality= parsing
    hitGate.ts          Hit-gate reset on a grid change
    flash.ts            Reduced-flashing scheduler (≤ 3 flashes per second, capped alpha, slew-limited)
    render.ts           Procedural canvas art (ghost wisps, bat flap, cracked
                        skull, lunger, pumpkin, boss), shake, white hit flash,
                        boss health bar, debug overlay (D key)
    enemies/
      ghost.ts / bat.ts / skull.ts / lunger.ts / pumpkin.ts / boss.ts
      bossPhases.ts     3-phase boss behaviour (stage 5 boss and the Hollow King)
      variants.ts       Twin wisp, mirror and blink ghost state machines (deltaMs, telegraphs)
      variantSpawn.ts   New-ghost spawning: skull clearance, pairs inside one half
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
    cvd.ts              Lab, CIEDE2000, colour-vision-deficiency simulation (Machado 2009)
    palette.ts          Default and Okabe-Ito palettes
    textScale.ts        Text scale helper, pure HUD layout, call-out size
    settingsPanel.ts    Settings panel and ⚙ button
    seatCard.ts         2P per-half card offer / preview with half-only input routing
    screens.ts          Start (1 / 2 player buttons, high scores), stage title, summary (stars), victory, game over
    nameScreen.ts       Name screen with ◀ / OK / ▶ motion buttons (1P and per half)
    scoreTable.ts       High-score rows, pages and drawing
    splitscreen.ts      Two-player divider, OUT / CLEARED overlays, shared summary, winner screen
    onboarding.ts       First-run guide, how-to cards, camera-denied screen
    fonts.ts            TITLE_FONT_FAMILY + local font preload (Creepster)
  test/
    prng.ts             Seeded PRNG for deterministic tests
  settings/
    settings.ts         Setting types, URL parameters, storage (one key), precedence
    runtime.ts          Live settings, change notifications
  audio/
    context.ts          AudioContext singleton, master gain, mute / volume
    bus.ts              Master bus: gain → compressor → limiter → destination
    recipes.ts          SFX as data, offline renderer, loudness table, music level estimate
    sfx.ts              10 procedural Web Audio sound effects
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
    stages/             5-stage progression spec
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
    demo-mode/          Camera-free scripted attract mode for filming spec
    playtest-polish/    Adaptive quality, audio levels, accessibility options spec
    judge-docs/         Judge-facing write-up and README spec
    more-content/       New ghosts, stage 6 finale, local high scores spec
  powers/               exorcise-motion-harness Kiro power
  settings/mcp.json     Workspace MCP registration (motion-harness, stdio, relative path)
  agents/balancer.json  Report-only playtest-tuner agent
  hooks/                test-on-save.json, spec-drift-check.json, readme-test-count.json (save/create/delete)
docs/
  KIRO.md               Judge-facing write-up of how Kiro was used
tools/
  sync-readme-tests.mjs Run tests and sync the README test count (used by a hook)
  sync-readme-tests.test.mjs Unit tests for the sync script's pure functions
  hooks.test.mjs        Structural + matcher tests for .kiro/hooks/*.json
  judge-docs.test.mjs   Checks docs/KIRO.md and the README judge section
  power-manifest.test.mjs  Kiro power manifest checks
  balancer-config.test.mjs  MCP / agent config checks (no secrets, local only, restricted tools)
  motion-harness/
    mcp-server.mjs      stdio MCP server: run_harness, read_stage_config (+ unit and property tests)
```

## Credits

- **Creepster** display font — designed by Font Diner, Inc, licensed under the SIL Open Font License 1.1. Self-hosted from `src/assets/fonts/Creepster-Regular.ttf`; no CDN. Licence text: [`src/assets/fonts/OFL.txt`](src/assets/fonts/OFL.txt). Source: the `ofl/creepster` directory of the [google/fonts](https://github.com/google/fonts) repository.

## License

MIT — see [LICENSE](LICENSE).
