# Exorcise — Product

## Overview
Exorcise is a browser-based Halloween game inspired by the PS2 EyeToy title "Kung Foo". Players use their laptop webcam and physical hand movements to swat away ghosts and bats that fly in from the dark edges of the screen. No installation required — just open a URL and play.

## Target Audience
Kids and families. The tone is spooky but fun, never scary or violent. Suitable for Halloween parties and school events.

## Core Gameplay Loop

### Enemies
- **Ghosts** fly in from the edges of the screen toward the center. If a ghost reaches the center, the player loses a life.
- **Bats** fly in from the edges in swarms. Swatted away for points.
- **Cursed Skull** — a trap object. Hitting it costs a life. Players must avoid it.
- **Boss Ghost** — appears at the end of each round. Requires 3 hits to defeat before the round ends.

### Hit Detection
Hits are registered by detecting motion (frame differencing) inside an enemy's hitbox — the same mechanic as the original EyeToy. The player's webcam image is mirrored so movements feel natural.

### Lives & Rounds
- 3 lives per game.
- Rounds are 60 seconds long.
- Losing all lives ends the game.

### Scoring
- Each swatted ghost or bat awards points.
- Consecutive hits build a combo multiplier.
- Combo resets on a miss or life loss.
- Defeating the boss ghost awards a bonus score.

## Win / Lose Conditions
- **Survive** the 60-second round and defeat the boss ghost to advance.
- **Game over** when all 3 lives are lost.

## Key Constraints
- Zero install: runs entirely in the browser, no app download.
- Requires only a standard laptop webcam — no special hardware.
- No backend or server-side processing; everything runs client-side.
