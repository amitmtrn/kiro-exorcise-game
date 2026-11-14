# Exorcise — Tech

## Stack
- **Language:** TypeScript
- **Markup / Style:** Plain HTML + CSS (no framework)
- **Build tool:** Vite
- **Tests:** Vitest (unit tests)
- **Hosting:** Static — no backend, no server-side code

## Project Structure
```
src/
  main.ts          # Entry point, game loop init
  game/
    loop.ts        # requestAnimationFrame game loop
    state.ts       # Game state (lives, score, combo, round timer)
    enemies/       # Ghost, bat, skull, boss logic
    collision.ts   # Hit detection via frame differencing
    round.ts       # Round / boss sequencing
  webcam/
    capture.ts     # getUserMedia, mirrored canvas
    diff.ts        # Frame differencing implementation
  ui/
    hud.ts         # Lives, score, combo, timer overlay
    screens.ts     # Title, game-over, round-clear screens
  audio/
    sfx.ts         # Web Audio API sound playback
  assets/          # Sprites, sounds (free/self-made only)
```

## Webcam
- Access via `navigator.mediaDevices.getUserMedia`.
- Video is rendered to a canvas with `scaleX(-1)` so the image is mirrored — hand movements feel natural.
- A second off-screen canvas holds the previous frame for differencing.

## Hit Detection (v1 — Frame Differencing)
Replicates the classic webcam motion-game mechanic without ML:

1. Capture the current webcam frame to a canvas.
2. For each active enemy, sample the pixel region inside its hitbox on both the current and previous frame.
3. Compute the mean absolute difference of luminance values across those pixels.
4. If the difference exceeds a configurable threshold, register a hit.
5. Store the current frame as the previous frame.

This approach detects any fast motion inside a hitbox (a swipe, a swat) rather than tracking a specific body part.

**Camera frame rate ≠ loop frame rate.** Webcams deliver 30 fps (15 fps in low
light) while `requestAnimationFrame` runs at 60, so roughly every other tick the
captured frame is byte-identical to the previous one. Treat that as "no new
frame" (keep per-enemy gate counters, keep the last motion mask), never as "no
motion". A real camera frame always carries sensor noise, so an exactly-zero
whole-frame luminance delta is a reliable duplicate-frame signal
(`computeMotionMask().changed`).

### Tuning knobs
| Parameter | Default | Purpose |
|---|---|---|
| `diffThreshold` | `30` | Luminance delta to count a pixel as "moved" |
| `hitRatio` | `0.15` | Fraction of hitbox pixels that must exceed threshold |
| `sampleStride` | `4` | Check every Nth pixel to keep diff fast |
| `hitFramesRequired` | `2` | Consecutive *camera* frames with motion in the hitbox (duplicate ticks skipped) |
| `minMotionPixels` / `idleGraceMs` | `3` / `150` | Motion-button noise floor and reversal tolerance |

## Optional Future Upgrade — MediaPipe Hand Tracking
MediaPipe Hands can be layered on top in v2 with minimal disruption:
- Replace the frame-diff check in `collision.ts` with landmark intersection against the hitbox.
- The rest of the game logic (enemy state, scoring, audio) is unchanged.
- Keep the frame-diff path available behind a feature flag for low-end devices.

## Performance Targets
- 60 fps on a mid-range laptop (target ~4 ms per frame for game logic + diff).
- Canvas 2D API only — no WebGL required in v1.
- Keep the hitbox diff sampling within the time budget by using `sampleStride`.

## Browser Support
Modern evergreen browsers (Chrome, Firefox, Edge, Safari 16+). Requires:
- `getUserMedia` (webcam)
- `requestAnimationFrame`
- ES2020+ (handled by Vite/esbuild)

## Testing
- Unit tests with **Vitest** covering: frame-diff logic, game-state transitions (lives, combo, round timer), enemy spawn/despawn, scoring.
- No browser automation in v1; game-loop tests use mock canvas contexts.
