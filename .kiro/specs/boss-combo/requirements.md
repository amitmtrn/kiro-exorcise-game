# Boss Ghost + Combo — Requirements

## Scope

This spec adds two features on top of the MVP:

1. **Combo multiplier** — consecutive hits within a time window multiply the score.
2. **Boss ghost** — a 3-hit, oversized ghost that appears at the end of each 60-second round. Defeating it triggers a round-clear flow; failing to defeat it ends the game.

Audio and full visual polish (particle explosion, screen flash) are in scope here.

---

## R1 — Combo multiplier

**R1.1** A combo counter starts at 1 and increments by 1 each time the player hits a ghost or bat without missing.

**R1.2** A "miss" is defined as a ghost or bat reaching the center (R3.6 in the MVP spec). Hitting a skull does **not** reset the combo (the combo is about swatting, not avoiding).

**R1.3** When a hit is registered, the point value is multiplied by the current combo: ghost → `100 × combo`, bat → `50 × combo`.

**R1.4** The combo counter resets to 1 when a miss occurs (enemy reaches center).

**R1.5** The combo multiplier is displayed in the HUD bottom-right as "x2", "x3", etc. It is hidden (or shown as "x1" dimmed) when combo = 1.

**R1.6** On combo increment to 2 or above, the multiplier label plays a brief scale-up animation (CSS transform or canvas scale pulse) and a short ascending chime plays (Web Audio API, procedurally generated).

---

## R2 — Boss ghost introduction

**R2.1** At t = 55 s (5 seconds before the round timer expires), the normal spawn timers are paused and all active enemies are cleared from the screen.

**R2.2** A single **boss ghost** spawns from the top-center of the screen and moves slowly toward the center. It does not wobble.

**R2.3** The boss ghost is visually distinct:
- Approximately 2× the size of a regular ghost (hitbox 160 × 160 px).
- Wears a procedurally drawn tattered witch hat (canvas 2D shapes).
- Has a pulsing purple/orange glow instead of white.

**R2.4** The boss ghost requires **3 hits** to defeat. A health bar (3 glowing orbs) is rendered below the boss.

**R2.5** Each hit on the boss: one orb dims, the boss briefly flashes white, and a "boss hit" sound plays.

**R2.6** Hitting the boss does **not** score points directly. Defeating it (3rd hit) awards a flat **500-point bonus**.

---

## R3 — Boss defeat (round clear)

**R3.1** When the boss takes its 3rd hit:
- It explodes into a large particle burst (60 particles, purple and orange).
- The screen flashes orange (`rgba(255, 107, 26, 0.5)`) for 400 ms.
- A triumphant fanfare plays (~3 s, procedurally generated via Web Audio API).
- The 500-point bonus is added to the score.

**R3.2** A "ROUND CLEAR!" banner animates in (CSS or canvas, wobble/bounce entrance) over the game canvas.

**R3.3** The final score is displayed below the banner.

**R3.4** After 3 s, the game resets to the initial state (lives intact, score reset to 0, timer reset to 60 s) and a new round begins. Lives carry over in a future spec; for now, reset fully.

---

## R4 — Boss not defeated (game over)

**R4.1** If the round timer reaches 0 s while the boss is still alive (fewer than 3 hits landed), the boss is considered undefeated.

**R4.2** The game transitions to the standard Game Over screen (MVP R8) rather than the round-clear screen.

**R4.3** The final score is displayed as normal.

---

## R5 — Audio

**R5.1** All sounds are generated procedurally via the Web Audio API. No external audio files are loaded.

**R5.2** Sound events:
| Event | Description |
|---|---|
| Combo increment (≥ 2) | Short ascending two-note chime, pitch rises with combo level |
| Boss hit | Deep resonant thump (sine wave, 80 Hz, 0.3 s decay) |
| Boss defeated | Triumphant 3-note fanfare (C–E–G, ~3 s, organ-like timbre) |
| Round clear | Same as boss defeated |

**R5.3** A mute toggle button (🔊/🔇) is always visible in the top-right corner of the HUD, next to the timer. Muting silences all Web Audio output without stopping the audio context.
