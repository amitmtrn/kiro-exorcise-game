# Exorcise — Design

## Tone & Feel
Spooky but friendly. The aesthetic borrows from classic Halloween imagery — pumpkins, bats, candles, foggy graveyards — but everything is rounded, cartoonish, and non-threatening. A 6-year-old should find it exciting, not frightening.

## Colour Palette
| Name | Hex | Use |
|---|---|---|
| Midnight | `#0d0014` | Background / deep dark |
| Deep Purple | `#2a0845` | Secondary background, fog |
| Pumpkin Orange | `#ff6b1a` | Accents, HUD highlights, boss glow |
| Candlelight Yellow | `#ffd166` | Candle flicker, score numbers |
| Ghost White | `#e8e8f0` | Ghost fill, bat highlight |
| Blood Red | `#c0392b` | Cursed skull, life-lost flash |
| Slime Green | `#39ff14` | Combo multiplier text |

## Typography
- HUD and UI: a chunky, rounded display font with a slight glow — no serif body text.
- Score numbers pulse on combo increments.
- "Game Over" and "Round Clear" text animate in with a wobble.

## Atmosphere

### Background
- Static dark scene: silhouetted gravestones, dead trees, a full moon behind clouds.
- A looping CSS/canvas fog layer drifts slowly left-to-right across the lower third.
- A few flickering candle sprites placed at screen edges provide ambient orange light.

### Lighting
- The webcam image sits in the center, slightly desaturated and darkened so it blends into the scene.
- Enemies cast a soft colored glow on the background as they move (canvas shadow blur).

## Enemy Design

### Ghost
- Simple, rounded Casper-style silhouette with large hollow eyes.
- Wobbles on a sine curve as it floats toward center.
- **Hit effect:** Expands briefly, then bursts into a shower of white/blue particles that fade out over ~0.4 s.

### Bat
- Small, fast, angular wings. Moves in a slightly erratic zigzag.
- **Hit effect:** Tumbles and shrinks away with a brief orange flash.

### Cursed Skull
- Orange skull with glowing red eyes and a cracked forehead. Visually distinct from ghosts.
- Pulses with a red glow to signal "don't hit me".
- **If hit:** Screen flashes red, life indicator shakes.

### Boss Ghost
- Larger than normal ghosts (~2× size). Wears a tattered witch hat.
- Health shown as 3 glowing orbs beneath it; one dims per hit.
- After 3 hits: giant particle explosion, screen flashes orange, victory fanfare.

## HUD Layout
```
┌─────────────────────────────────────────────┐
│  ♥ ♥ ♥          EXORCISE       00:45        │
│                                             │
│              [webcam + game canvas]         │
│                                             │
│  Score: 4200        Combo: x3               │
└─────────────────────────────────────────────┘
```
- Lives as heart icons (top-left).
- Round timer countdown (top-right) — flashes red below 10 s.
- Score (bottom-left), combo multiplier (bottom-right) in large glowing text.

## Screens

### Title Screen
- Animated logo: "Exorcise" in drippy orange text with bats flying around it.
- "Press Space or tap to start" prompt pulses.
- Looping ambient wind + distant owl sound.

### Game Over
- Screen dims to near-black with a cracked red border.
- Final score displayed. "Play Again?" button.

### Round Clear
- Boss ghost explodes, confetti-style orange and purple particles fill screen.
- "Round Clear!" banner with final score + bonus.

## Particle System
Particles are canvas-drawn dots/shapes with:
- Initial velocity derived from hit direction.
- Gravity (slight downward drift).
- Alpha fade over lifetime (~0.3–0.5 s).
- Color matched to the enemy type.

## Audio

### Rules
- **Only free or self-made assets.** No copyrighted sounds.
- Acceptable sources: self-recorded, Freesound.org (CC0 or CC-BY with attribution), procedurally generated via the Web Audio API.

### Sound Events
| Event | Sound |
|---|---|
| Ghost hit | Cartoon "poof" / whoosh |
| Bat hit | Quick squeak |
| Skull hit (penalty) | Low thud + creak |
| Life lost | Sad trombone-style descend |
| Combo increment | Short ascending chime |
| Boss hit | Deep resonant thump |
| Boss defeated | Triumphant fanfare (~3 s) |
| Background | Looping ambient wind, distant owl, subtle organ drone |

### Implementation
- Web Audio API for playback and procedural tones.
- Preload all audio buffers at game start.
- Master volume control accessible from the title screen.
- Mute button always visible in-game (accessibility).
