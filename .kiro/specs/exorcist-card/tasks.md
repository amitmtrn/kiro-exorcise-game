# Exorcist Card — Tasks

## T1 — Rank titles and run stats (pure)
- [x] `src/game/rank.ts`: `RANKS`, `rankForScore`.
- [x] `src/game/runStats.ts`: `createRunStats`, `observeRun`, `momentRank`; run-wide best combo, stage, banished; moments boss / combo / end.
- [x] Unit tests: rank thresholds and bad input, banked banished across stage resets, best combo, moment detection.
- [x] Property tests: rank monotone in score; banished never decreases and equals the sum over stages.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(exorcist-card-T1): rank titles and run-wide stats`

## T2 — Snapshot store and card layout (pure)
- [x] `src/card/snapshotStore.ts`: one in-memory slot, strictly-better replacement, lazy grab, release on replace / discard.
- [x] `src/card/layout.ts`: `layoutCard`, `fitText`, `coverRect`, `scaleToFit`.
- [x] Unit tests: snapshot lifecycle (taken, replaced by better, kept on equal / worse, discarded + released); layout positions, `fitText`, `coverRect`.
- [x] Property test: every rect and text extent stays inside the card for any size ≥ 200 × 280 and any score / rank / number lengths.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(exorcist-card-T2): snapshot store and pure card layout`

## T3 — Card drawing and local download
- [x] `src/card/draw.ts`: procedural frame, photo (cover-fit) or silhouette, Creepster title, stats.
- [x] `src/card/download.ts`: `downloadCanvasPng` (toBlob → object URL → `<a download>` → revoke).
- [x] Unit tests with mocked `toBlob` / `URL`: URL revoked (also on click error and null blob), anchor removed, `download` attribute set; spies on `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket` never called; source-grep privacy test; draw smoke test with a recording context (photo vs silhouette).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(exorcist-card-T3): card drawing and local-only PNG download`

## T4 — Screens, input and lifecycle
- [x] `src/ui/cardScreen.ts`: preview overlay with SAVE / NO PHOTO / CLOSE motion buttons, hit test, key mapping.
- [x] Game-over and victory screens: "EXORCIST CARD" motion button; `loop.ts` observes run stats, grabs mirrored snapshots at moments, fallback at game end, opens preview only on explicit choice, discards snapshot and closes preview when leaving the screen / retry / menu / new game.
- [x] `main.ts`: `C`, `S`, `Enter`, `N`, `Esc` keys and `pointerdown` forwarded to the loop (never while typing in a button focus).
- [x] Tests: button hit test, key mapping, snapshot grab is mirrored, `CardSession` lifecycle (`src/card/session.ts`: snapshot discarded on retry / menu / play again, card only on explicit open, save reports status), keys and clicks ignored off the end screens.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(exorcist-card-T4): card offer on game over and victory`

## T5 — Docs
- [ ] README: spec table row, spec count, test count, privacy note (card is local only).
- [ ] `npm test` and `npm run build` both clean.
- [ ] Commit: `docs(exorcist-card-T5): README`

## T6 — Manual smoke test (webcam)
- [ ] Lose a game: CARD button appears; nothing is downloaded until SAVE is chosen; PNG shows the mirrored photo, rank and numbers.
- [ ] NO PHOTO shows a silhouette; CLOSE returns to the buttons.
- [ ] Win: photo is from the boss-defeat moment; Retry / Menu discards it (next game over shows a new photo).
- [ ] DevTools Network tab stays empty and Application → Storage holds no image.
