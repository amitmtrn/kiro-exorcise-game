# Spooky Skin — Tasks (P2)

## T1 — Webcam tint + fog + candle glow
- [x] Purple overlay on webcam canvas after `drawWebcamFrame`.
- [x] Fog layer in `renderFrame` (before enemies).
- [x] Candle glow radial gradients at screen edges.
- [x] Commit: `feat(skin-T1): tint, fog, candle glow`

## T2 — Improved enemy art
- [x] Ghost: trailing wisp + rounder body.
- [x] Bat: wing-flap animation.
- [x] Skull: more detail, cracked texture.
- [x] Commit: `feat(skin-T2): improved enemy art`

## T3 — Hit flash + screen shake
- [x] 1-frame white flash on hit (render enemy in white fill for 1 frame via `hitFlashFrames` on enemy).
- [x] Screen shake on combo ≥ 3 hit.
- [x] Commit: `feat(skin-T3): hit flash + screen shake`

## T4 — Score pop labels
- [x] `ScoreLabel` type + spawn in `resolveHits`.
- [x] Tick + render floating "+N" text.
- [x] Commit: `feat(skin-T4): floating score pop labels`

## T5 — HUD polish
- [ ] Responsive font size.
- [ ] Glow on all HUD text.
- [ ] Commit: `feat(skin-T5): HUD polish`
