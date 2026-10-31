# Spooky Skin — Design (P2)

## Webcam tint
After `drawWebcamFrame`, draw a `rgba(40, 0, 60, 0.22)` full-canvas rect on
the webcam canvas — simple, zero extra passes.

## Fog
3–4 large semi-transparent gradient ellipses in `#2a0845` / transparent,
each with an independent slow horizontal drift (`x += 0.3 * Math.sin(t/4000)`).
Rendered at the bottom of the game canvas before enemies.

## Candle glow
Two radial gradients (orange → transparent, radius ~120 px) at the bottom-left
and bottom-right corners, pulsing slowly via `Math.sin(t/800)` on the alpha.

## Screen shake
A `shakeFrames: number` counter in `GameState` (decremented each tick).
`renderFrame` wraps all drawing in `ctx.translate(dx, dy)` where `dx, dy` is a
small random value while `shakeFrames > 0`. Set via `setShake(state, 3)` from
`resolveHits` when combo ≥ 3.

## Score pop labels
A `ScoreLabel { x, y, text, alpha, vy }` array in `GameState`. Spawned from
`resolveHits`. Ticked in `tickParticles` equivalent. Rendered after enemies.

## HUD font sizing
Use `clamp()`-style logic: `Math.max(24, Math.min(48, canvasW / 20))` for font
size so it scales with window size.
