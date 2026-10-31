# MVP Requirements

## Scope

The MVP delivers a single playable 60-second round: webcam on, enemies fly in, player swats them with their hands, a skull punishes careless hits, lives count down, the round ends with a game-over screen. The boss ghost, combo multiplier, round-clear flow, audio, and background atmosphere are **post-MVP** and explicitly excluded here.

---

## R1 — Webcam permission and mirrored video

**R1.1** On load the game requests webcam access via `navigator.mediaDevices.getUserMedia({ video: true })`.

**R1.2** If permission is granted, the webcam stream is drawn to the main canvas each frame, horizontally flipped (`scaleX(-1)`) so the image is mirrored.

**R1.3** If permission is denied or the API is unavailable, a full-screen error message explains that the webcam is required, with a "Try again" button that re-requests permission.

**R1.4** The webcam feed is the bottom-most layer; all game elements render on top of it.

---

## R2 — Motion detection (frame differencing)

**R2.1** Each frame, the current webcam image is captured to an off-screen canvas (`currentFrame`). The previous frame is stored in a second off-screen canvas (`prevFrame`).

**R2.2** For each active enemy, the pixel region corresponding to its axis-aligned bounding box is sampled from both canvases using `getImageData`.

**R2.3** For every sampled pixel (stride = `sampleStride`, default **4**), the luminance difference `|L_current − L_prev|` is computed. If the difference exceeds `diffThreshold` (default **30**), the pixel is counted as "moved".

**R2.4** If the ratio of moved pixels to total sampled pixels inside the hitbox exceeds `hitRatio` (default **0.15**), a hit is registered on that enemy.

**R2.5** A hit can only be registered once per enemy per frame (no double-counting).

**R2.6** After all enemies are checked, `currentFrame` is copied to `prevFrame`.

**R2.7** The three detection parameters (`diffThreshold`, `hitRatio`, `sampleStride`) are exported as named constants so they can be changed without touching game logic.

---

## R3 — Enemy spawning

**R3.1** Enemies spawn from randomly chosen points along the four screen edges (outside the visible area by one enemy-width).

**R3.2** Each enemy is assigned a target point near the screen center (within a 120 px radius of center) and moves toward it at a constant speed. Ghosts wobble on a sine curve perpendicular to their direction of travel.

**R3.3** **Ghost** spawn rate: one ghost every **2–4 s** (random uniform), starting at t = 0.

**R3.4** **Bat** spawn rate: one bat every **1–2 s** (random uniform), starting at t = 0. Bats move faster than ghosts and follow a zigzag path.

**R3.5** **Cursed Skull** spawn rate: one skull every **8–12 s** (random uniform), starting at t = 5 s. At most one skull is on screen at a time.

**R3.6** Enemies that have not been hit and reach within **40 px** of their target are considered to have "reached the center". A ghost or bat reaching center costs a life. The enemy is then removed.

**R3.7** No more than **6** enemies (ghosts + bats + skulls combined) are active at the same time. New spawns are suppressed when the cap is reached.

---

## R4 — Swat to banish (hit response)

**R4.1** When a ghost is hit, it is immediately removed from the active enemy list.

**R4.2** A particle puff is spawned at the ghost's last position: **20 particles**, ghost-white (`#e8e8f0`) to light blue, each with a random outward velocity, gravity of **0.15 px/frame²**, and alpha fade over **400 ms**.

**R4.3** When a bat is hit, it is immediately removed. A smaller puff of **10 particles** in orange (`#ff6b1a`) plays.

**R4.4** Hitting a ghost scores **100 points**. Hitting a bat scores **50 points**.

**R4.5** Score is accumulated in game state and displayed in the HUD immediately.

---

## R5 — Skull penalty

**R5.1** The cursed skull cannot be "banished". Hitting it costs **1 life** instead of scoring.

**R5.2** On skull hit: the skull is removed, the screen overlays a red flash (`rgba(192, 57, 43, 0.4)`) for **300 ms**, and the life counter decrements.

**R5.3** If the skull reaches center without being hit, it despawns silently (no life penalty — only hitting it is punished).

**R5.4** The skull is visually distinct: it renders with a pulsing red glow (`shadowColor: #c0392b`, animated `shadowBlur` 10–20 px).

---

## R6 — Lives

**R6.1** The player starts with **3 lives**.

**R6.2** A life is lost when: (a) a ghost or bat reaches the center, or (b) the player hits the cursed skull.

**R6.3** Lives are displayed as heart icons (♥) in the top-left of the HUD. A lost life icon is rendered dim/hollow.

**R6.4** When lives reach 0, the round ends immediately and transitions to the Game Over screen (R8).

---

## R7 — 60-second round timer

**R7.1** The round timer starts at **60 s** when the game begins and counts down in real time using `performance.now()` (not frame count, to be accurate across frame rate variations).

**R7.2** The timer is displayed in `MM:SS` format in the top-right of the HUD.

**R7.3** When the timer reaches 0 s, all active enemies are cleared and the game transitions to the Game Over screen (R8).

**R7.4** When the timer is ≤ 10 s, the timer text flashes red at 1 Hz.

---

## R8 — Game Over screen

**R8.1** The game over screen overlays the final frozen webcam frame with a dark semi-transparent layer (`rgba(13, 0, 20, 0.85)`).

**R8.2** The text "GAME OVER" is displayed centered, large, in pumpkin orange (`#ff6b1a`).

**R8.3** The player's final score is shown below the title.

**R8.4** A "Play Again" button resets all state (lives → 3, score → 0, timer → 60 s, enemies cleared) and restarts the round without reloading the page or re-requesting webcam permission.

**R8.5** The game over screen is triggered by either lives reaching 0 (R6.4) or the timer reaching 0 (R7.3).

---

## R9 — HUD

**R9.1** The HUD is rendered on a dedicated overlay canvas (or HTML layer) above the game canvas and is always visible during play.

**R9.2** Layout:
- Top-left: heart icons for lives.
- Top-right: round timer.
- Bottom-left: "Score: NNNN" label.

**R9.3** All HUD text uses a glow effect (`text-shadow` or canvas `shadowBlur`) in the element's accent color.

---

## R10 — Project scaffold and tooling

**R10.1** The project is initialised with **Vite** using the vanilla TypeScript template.

**R10.2** **Vitest** is added as a dev dependency and configured to run with `npm test`.

**R10.3** The source follows the directory layout from `tech.md`: `src/webcam/`, `src/game/`, `src/game/enemies/`, `src/ui/`.

**R10.4** Unit tests cover: `computeFrameDiff` (returns correct hit/no-hit for synthetic pixel data), `GameState` transitions (life decrement, score increment, timer expiry), and enemy spawn/despawn logic.
