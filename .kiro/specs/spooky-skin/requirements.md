# Spooky Skin — Requirements (P2)

## R1 — Webcam tint
**R1.1** The webcam image is drawn with a subtle purple-blue tint and reduced brightness (blend mode `multiply` or a dark overlay at ~25% opacity) so it reads as "haunted scene" rather than plain video.

## R2 — Fog and candle glow
**R2.1** A slow-drifting fog layer (semi-transparent gradient rectangles animated with `Math.sin`) covers the lower third of the screen.
**R2.2** Soft orange candle-glow spots are drawn at the left and right screen edges.

## R3 — Enemy art
**R3.1** Ghost, bat, and skull visuals are improved: rounder ghosts with trailing wisps, bats with flapping wing animation (sine on wing span), skulls with more detail.
**R3.2** All art remains procedural canvas 2D — no external image files.

## R4 — Hit effects
**R4.1** On a strong hit (combo ≥ 3), a brief screen shake (translate ±4 px for 3 frames) fires.
**R4.2** Each enemy flashes white for 1 frame on hit before the puff particles appear.

## R5 — HUD polish
**R5.1** Lives, score, stage, and combo use a large, readable display font with a glow, sized for a kid playing from 1 m away.
**R5.2** Score pop: when points are scored, a floating "+100" label drifts upward from the enemy position and fades over 600 ms.
