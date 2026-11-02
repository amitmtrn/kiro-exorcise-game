# Spooky Skin — Tasks (P2)

## T1 — Webcam tint + fog + candle glow
- [x] Purple overlay on webcam canvas after `drawWebcamFrame`.
- [x] Fog layer in `renderFrame` (before enemies).
- [x] Candle glow radial gradients at screen edges.
- [x] Commit: `feat(skin-T1): tint, fog, candle glow`

## T2 — Improved enemy art
- [ ] Ghost: trailing wisp + rounder body.
- [ ] Bat: wing-flap animation.
- [ ] Skull: more detail, cracked texture.
- [ ] Commit: `feat(skin-T2): improved enemy art`

## T3 — Hit flash + screen shake
- [ ] 1-frame white flash on hit (render enemy in white fill for 1 frame via `hitFlashFrames` on enemy).
- [ ] Screen shake on combo ≥ 3 hit.
- [ ] Commit: `feat(skin-T3): hit flash + screen shake`

## T4 — Score pop labels
- [ ] `ScoreLabel` type + spawn in `resolveHits`.
- [ ] Tick + render floating "+N" text.
- [ ] Commit: `feat(skin-T4): floating score pop labels`

## T5 — HUD polish
- [ ] Responsive font size.
- [ ] Glow on all HUD text.
- [ ] Commit: `feat(skin-T5): HUD polish`
