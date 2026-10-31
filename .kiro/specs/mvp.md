# Exorcise MVP Spec

## Scope

The MVP delivers a single playable 60-second round: webcam on, enemies fly in, player swats them with their hands, a skull punishes careless hits, lives count down, the round ends with a game-over screen. The boss ghost, combo multiplier, round-clear flow, audio, and background atmosphere are **post-MVP** and explicitly excluded here.

---

## Requirements

### R1 — Webcam permission and mirrored video

**R1.1** On load the game requests webcam access via `navigator.mediaDevices.getUserMedia({ video: true })`.

**R1.2** If permission is granted, the webcam stream is drawn to the main canvas each frame, horizontally flipped (`scaleX(-1)`) so the image is mirrored.

**R1.3** If permission is denied or the API is unavailable, a full-screen error message explains that the webcam is required, with a "Try again" button that re-requests permission.

**R1.4** The webcam feed is the bottom-most layer; all game elements render on top of it.

---

### R2 — Motion detection (frame differencing)

**R2.1** Each frame, the current webcam image is captured to an off-screen canvas (`currentFrame`). The previous frame is stored in a second off-screen canvas (`prevFrame`).

**R2.2** For each active enemy, the pixel region corresponding to its axis-aligned bounding box is sampled from both canvases using `getImageData`.

**R2.3** For every sampled pixel (stride = `sampleStride`, default **4**), the luminance difference `|L_current − L_prev|` is computed. If the difference exceeds `diffThreshold` (default **30**), the pixel is counted as "moved".

**R2.4** If the ratio of moved pixels to total sampled pixels inside the hitbox exceeds `hitRatio` (default **0.15**), a hit is registered on that enemy.

**R2.5** A hit can only be registered once per enemy per frame (no double-counting).

**R2.6** After all enemies are checked, `currentFrame` is copied to `prevFrame`.

**R2.7** The three detection parameters (`diffThreshold`, `hitRatio`, `sampleStride`) are exported as named constants so they can be changed without touching game logic.

---

### R3 — Enemy spawning

**R3.1** Enemies spawn from randomly chosen points along the four screen edges (outside the visible area by one enemy-width).

**R3.2** Each enemy is assigned a target point near the screen center (within a 120 px radius of center) and moves toward it at a constant speed. Ghosts wobble on a sine curve perpendicular to their direction of travel.

**R3.3** **Ghost** spawn rate: one ghost every **2–4 s** (random uniform), starting at t = 0.

**R3.4** **Bat** spawn rate: one bat every **1–2 s** (random uniform), starting at t = 0. Bats move faster than ghosts and follow a zigzag path.

**R3.5** **Cursed Skull** spawn rate: one skull every **8–12 s** (random uniform), starting at t = 5 s. At most one skull is on screen at a time.

**R3.6** Enemies that have not been hit and reach within **40 px** of their target are considered to have "reached the center". A ghost or bat reaching center costs a life. The enemy is then removed.

**R3.7** No more than **6** enemies (ghosts + bats + skulls combined) are active at the same time. New spawns are suppressed when the cap is reached.

---

### R4 — Swat to banish (hit response)

**R4.1** When a ghost is hit, it is immediately removed from the active enemy list.

**R4.2** A particle puff is spawned at the ghost's last position: **20 particles**, ghost-white (`#e8e8f0`) to light blue, each with a random outward velocity, gravity of **0.15 px/frame²**, and alpha fade over **400 ms**.

**R4.3** When a bat is hit, it is immediately removed. A smaller puff of **10 particles** in orange (`#ff6b1a`) plays.

**R4.4** Hitting a ghost scores **100 points**. Hitting a bat scores **50 points**.

**R4.5** Score is accumulated in game state and displayed in the HUD immediately.

---

### R5 — Skull penalty

**R5.1** The cursed skull cannot be "banished". Hitting it costs **1 life** instead of scoring.

**R5.2** On skull hit: the skull is removed, the screen overlays a red flash (`rgba(192, 57, 43, 0.4)`) for **300 ms**, and the life counter decrements.

**R5.3** If the skull reaches center without being hit, it despawns silently (no life penalty — only hitting it is punished).

**R5.4** The skull is visually distinct: it renders with a pulsing red glow (`shadowColor: #c0392b`, animated `shadowBlur` 10–20 px).

---

### R6 — Lives

**R6.1** The player starts with **3 lives**.

**R6.2** A life is lost when: (a) a ghost or bat reaches the center, or (b) the player hits the cursed skull.

**R6.3** Lives are displayed as heart icons (♥) in the top-left of the HUD. A lost life icon is rendered dim/hollow.

**R6.4** When lives reach 0, the round ends immediately and transitions to the Game Over screen (R8).

---

### R7 — 60-second round timer

**R7.1** The round timer starts at **60 s** when the game begins and counts down in real time using `performance.now()` (not frame count, to be accurate across frame rate variations).

**R7.2** The timer is displayed in `MM:SS` format in the top-right of the HUD.

**R7.3** When the timer reaches 0 s, all active enemies are cleared and the game transitions to the Game Over screen (R8).

**R7.4** When the timer is ≤ 10 s, the timer text flashes red at 1 Hz.

---

### R8 — Game Over screen

**R8.1** The game over screen overlays the final frozen webcam frame with a dark semi-transparent layer (`rgba(13, 0, 20, 0.85)`).

**R8.2** The text "GAME OVER" is displayed centered, large, in pumpkin orange (`#ff6b1a`).

**R8.3** The player's final score is shown below the title.

**R8.4** A "Play Again" button resets all state (lives → 3, score → 0, timer → 60 s, enemies cleared) and restarts the round without reloading the page or re-requesting webcam permission.

**R8.5** The game over screen is triggered by either lives reaching 0 (R6.4) or the timer reaching 0 (R7.3).

---

### R9 — HUD

**R9.1** The HUD is rendered on a dedicated overlay canvas (or HTML layer) above the game canvas and is always visible during play.

**R9.2** Layout:
- Top-left: heart icons for lives.
- Top-right: round timer.
- Bottom-left: "Score: NNNN" label.

**R9.3** All HUD text uses a glow effect (`text-shadow` or canvas `shadowBlur`) in the element's accent color.

---

### R10 — Project scaffold and tooling

**R10.1** The project is initialised with **Vite** (`npm create vite`) using the vanilla TypeScript template.

**R10.2** **Vitest** is added as a dev dependency and configured to run with `npm test`.

**R10.3** The source follows the directory layout from `tech.md`: `src/webcam/`, `src/game/`, `src/game/enemies/`, `src/ui/`.

**R10.4** Unit tests cover: `computeFrameDiff` (returns correct hit/no-hit for synthetic pixel data), `GameState` transitions (life decrement, score increment, timer expiry), and enemy spawn/despawn logic.

---

## Design Notes

### Canvas layout
Two stacked full-viewport canvases, absolutely positioned:
1. `#webcam-canvas` — webcam feed, mirrored.
2. `#game-canvas` — enemies, particles, HUD overlay.

Both are sized to `window.innerWidth × window.innerHeight`. On resize, both canvases update and enemy positions are rescaled proportionally.

### Enemy data model
Each enemy is a plain object:

```ts
interface Enemy {
  id: string;           // unique, e.g. crypto.randomUUID()
  type: 'ghost' | 'bat' | 'skull';
  x: number;            // center x, canvas coords
  y: number;            // center y, canvas coords
  targetX: number;
  targetY: number;
  speed: number;        // px per frame at 60 fps
  sineOffset: number;   // phase for ghost wobble
  hitbox: { x: number; y: number; w: number; h: number }; // axis-aligned
}
```

Enemy sizes (hitbox):
- Ghost: 80 × 80 px
- Bat: 48 × 32 px
- Skull: 56 × 56 px

### Particle data model

```ts
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;        // 0–1
  decay: number;        // alpha reduction per frame
  color: string;
  radius: number;
}
```

### Game state model

```ts
interface GameState {
  phase: 'title' | 'playing' | 'gameover';
  lives: number;        // 0–3
  score: number;
  roundTimeMs: number;  // milliseconds remaining
  enemies: Enemy[];
  particles: Particle[];
  spawnTimers: { ghost: number; bat: number; skull: number }; // ms until next spawn
}
```

### Rendering pipeline (each frame)
1. Draw mirrored webcam frame onto `#webcam-canvas`.
2. Clear `#game-canvas`.
3. Update game state (move enemies, tick spawn timers, decrement round timer).
4. Check frame diff for each enemy → register hits.
5. Update particles (move, fade).
6. Draw enemies.
7. Draw particles.
8. Draw HUD.
9. Copy `currentFrame` → `prevFrame`.

### Enemy visuals (canvas 2D, no external images in MVP)
Drawn procedurally with Canvas 2D API:

- **Ghost:** white filled ellipse (body) + two smaller circles (eyes, dark fill) + wavy bottom edge drawn with bezier curves.
- **Bat:** two filled arcs for wings meeting at a center circle for the body.
- **Skull:** rounded rectangle face, two eye holes (ellipses), a nasal cavity, cracked lines drawn with `lineTo`.

All enemies render with `ctx.shadowBlur` / `ctx.shadowColor` for glow.

### Skull pulsing glow
`shadowBlur` oscillates between 10 and 20 using `Math.sin(performance.now() / 300)` so it pulses ~3× per second without needing extra state.

### Red flash on skull hit
A full-canvas `fillRect` with `rgba(192,57,43,0.4)` drawn on `#game-canvas` for the duration of the flash. Tracked with a `flashEndTime` timestamp in game state.

---

## Tasks

### T1 — Project scaffold
- [ ] `npm create vite@latest . -- --template vanilla-ts` in the project root.
- [ ] Install Vitest: `npm install -D vitest`.
- [ ] Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `package.json`.
- [ ] Create the directory tree: `src/webcam/`, `src/game/`, `src/game/enemies/`, `src/ui/`.
- [ ] Replace Vite's default `index.html` with the two-canvas layout (`#webcam-canvas`, `#game-canvas`) and a `<div id="ui">` overlay for the HUD.
- [ ] Add base CSS: full-viewport canvases stacked with `position: absolute`, dark `#0d0014` body background.

### T2 — Webcam capture (`src/webcam/capture.ts`)
- [ ] Export `initWebcam(): Promise<HTMLVideoElement>` — calls `getUserMedia`, attaches the stream to a hidden `<video>` element, resolves when `loadedmetadata` fires.
- [ ] Export `drawWebcamFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement)` — clears and redraws the mirrored video frame each call.
- [ ] Handle permission denial: show the error screen from `src/ui/screens.ts` (can be a stub `div` in T2, styled in T6).
- [ ] Write unit test: `initWebcam` rejects cleanly when `getUserMedia` throws (mock `navigator.mediaDevices`).

### T3 — Frame differencing (`src/webcam/diff.ts`)
- [ ] Export constants `DIFF_THRESHOLD`, `HIT_RATIO`, `SAMPLE_STRIDE`.
- [ ] Export `captureFrame(offscreenCtx, video)` — draws the current video frame to an off-screen canvas.
- [ ] Export `computeFrameDiff(currentData: ImageData, prevData: ImageData, hitbox: Hitbox): boolean` — pure function implementing R2.3–R2.4.
- [ ] Write unit tests:
  - All pixels identical → returns `false`.
  - All pixels maximally different → returns `true`.
  - Exactly `hitRatio` fraction changed → returns `true` (boundary).
  - One pixel below threshold → returns `false`.

### T4 — Game state (`src/game/state.ts`)
- [ ] Define and export `GameState` interface and `Enemy`, `Particle`, `Hitbox` types.
- [ ] Export `createInitialState(): GameState`.
- [ ] Export pure reducer functions:
  - `decrementLife(state): GameState`
  - `addScore(state, points): GameState`
  - `tickTimer(state, deltaMs): GameState` — returns state with `roundTimeMs` decremented; sets `phase: 'gameover'` when it reaches 0.
  - `removeEnemy(state, id): GameState`
  - `addParticles(state, particles): GameState`
- [ ] Write unit tests for each reducer.

### T5 — Enemy logic (`src/game/enemies/`)
- [ ] `ghost.ts` — export `createGhost(canvasW, canvasH): Enemy`. Random edge spawn, center target, speed 1.2 px/frame, hitbox 80×80.
- [ ] `bat.ts` — export `createBat(canvasW, canvasH): Enemy`. Faster (speed 2.0), zigzag handled in movement update, hitbox 48×32.
- [ ] `skull.ts` — export `createSkull(canvasW, canvasH): Enemy`. Speed 0.8, hitbox 56×56.
- [ ] `movement.ts` — export `moveEnemies(enemies: Enemy[], deltaMs: number): Enemy[]`. Updates `x`/`y` per enemy type (sine wobble for ghosts, zigzag for bats). Returns new array.
- [ ] `spawn.ts` — export `tickSpawners(state: GameState, deltaMs: number, canvasW: number, canvasH: number): GameState`. Decrements spawn timers, creates enemies when timers fire, respects the 6-enemy cap and skull-only-one rule.
- [ ] Write unit tests: edge spawn positions are outside canvas bounds; reached-center detection triggers correct state change.

### T6 — Rendering (`src/game/render.ts` + `src/ui/hud.ts`)
- [ ] `render.ts` — export `renderFrame(ctx, state, flashEndTime)`:
  - Clears the game canvas.
  - Draws each enemy by type using procedural canvas shapes (R9 design notes).
  - Applies skull pulsing glow.
  - Draws the red flash overlay when `performance.now() < flashEndTime`.
  - Draws particles.
- [ ] `hud.ts` — export `renderHUD(ctx, state)`:
  - Heart icons (top-left).
  - Timer in `MM:SS`, flashing red below 10 s (top-right).
  - Score label (bottom-left).
- [ ] No unit tests for rendering; visual correctness checked manually.

### T7 — Hit resolution (`src/game/collision.ts`)
- [ ] Export `resolveHits(state: GameState, currentFrame: ImageData[], prevFrame: ImageData[], enemies: Enemy[]): { state: GameState, flashEndTime: number }`.
  - For each enemy, call `computeFrameDiff`.
  - On ghost hit: `removeEnemy` + `addScore(100)` + spawn ghost particles.
  - On bat hit: `removeEnemy` + `addScore(50)` + spawn bat particles.
  - On skull hit: `removeEnemy` + `decrementLife` + set `flashEndTime = now + 300`.
- [ ] Write unit tests with mocked `computeFrameDiff` (always true / always false).

### T8 — Particle system (`src/game/particles.ts`)
- [ ] Export `spawnGhostPuff(x, y): Particle[]` — 20 particles, ghost-white to light blue, random outward velocity, decay over 400 ms.
- [ ] Export `spawnBatPuff(x, y): Particle[]` — 10 particles, orange.
- [ ] Export `tickParticles(particles: Particle[]): Particle[]` — moves each particle, applies gravity (0.15), decrements alpha by decay. Filters out particles with `alpha <= 0`.
- [ ] Write unit tests: particle count decreases over time; all particles eventually removed.

### T9 — Game loop (`src/game/loop.ts`)
- [ ] Export `startLoop(video, webcamCtx, gameCtx)` — starts a `requestAnimationFrame` loop.
- [ ] Each tick:
  1. `drawWebcamFrame` on webcam canvas.
  2. `captureFrame` into `currentFrame` off-screen canvas.
  3. `tickSpawners` → new state.
  4. `moveEnemies` → updated enemy positions.
  5. Check each enemy for reaching center → `decrementLife` / remove.
  6. `resolveHits` using `currentFrame` and `prevFrame`.
  7. `tickTimer(deltaMs)` → may set phase to gameover.
  8. `tickParticles`.
  9. `renderFrame` + `renderHUD`.
  10. Copy `currentFrame` → `prevFrame`.
  11. If `state.phase === 'gameover'`, call `showGameOver` and stop loop.

### T10 — UI screens (`src/ui/screens.ts`)
- [ ] Export `showGameOver(score: number, onRestart: () => void)` — renders the game-over overlay (R8) as an HTML `<div>` over the canvases.
- [ ] Export `hideGameOver()` — removes the overlay.
- [ ] Export `showWebcamError(onRetry: () => void)` — renders the permission-denied message with a "Try again" button.
- [ ] The "Play Again" button calls `onRestart`, which resets state and calls `startLoop` again.

### T11 — Wiring (`src/main.ts`)
- [ ] Call `initWebcam()`.
- [ ] On success: call `startLoop`.
- [ ] On failure: call `showWebcamError` with a retry callback.
- [ ] Export nothing; this is the entry point only.

### T12 — Integration smoke test (manual)
- [ ] Open in browser via `npm run dev`.
- [ ] Confirm webcam feed is mirrored.
- [ ] Confirm ghosts and bats spawn from edges and move toward center.
- [ ] Confirm swatting a ghost (move hand quickly through it) removes it and shows a particle puff.
- [ ] Confirm hitting the skull flashes red and loses a life.
- [ ] Confirm a ghost reaching center loses a life.
- [ ] Confirm 60-second timer counts down; game-over screen appears at 0.
- [ ] Confirm "Play Again" resets and restarts correctly.
- [ ] Confirm the game runs smoothly on a laptop (no visible frame drops).
