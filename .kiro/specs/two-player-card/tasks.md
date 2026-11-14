# Two Player Card — Tasks

## T1 — Half snapshot, label / badge, file names (pure)
Files: `src/card/halfSnapshot.ts`, `src/card/twoPlayerCard.ts`, `src/card/layout.ts`,
`src/card/draw.ts`, `src/card/session.ts` and their tests

- [x] `halfSnapshot.ts`: `halfSnapshotGeometry`, `grabHalfSnapshot` (mirror-correct, own half only).
- [x] `twoPlayerCard.ts`: `badgeFor`, `cardFileName`, `seatLabel`.
- [x] Layout / draw: optional `playerLabel` and `badge` (inside the card for any length; 1P unchanged).
- [x] `CardSession` optional `extra()` merged into the card data.
- [x] Unit tests: crop and mirror mapping per seat, winner / tie / loser badge, file names, label / badge drawn only when given; property test: label and badge stay inside the card.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(two-player-card-T1): per-half snapshot, label, badge and file names`

## T2 — Per-half card UI and input routing
Files: `src/ui/motionButton.ts`, `src/ui/cardScreen.ts`, `src/ui/seatCard.ts`, tests

- [x] `MotionButton` / `CardPreview` accept an optional motion point source (default unchanged).
- [x] `SeatCardUI`: per-half offer button, preview, click queue, 0.8 s locks, `seatOfferGeometry`.
- [x] Unit tests: geometry inside the half, locks, click hit tests, 1P buttons unchanged.
- [x] Property test: motion in the other half never triggers a button; clicks only reach the half that contains them.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(two-player-card-T2): per-half card controls with half-only input routing`

## T3 — Loop wiring, lifecycle and privacy
Files: `src/game/loop.ts`, `src/ui/splitscreen.ts`, `src/main.ts`, `src/card/privacy.test.ts`,
`src/game/loop.card2p.test.ts`, `src/game/loop.card.test.ts`

- [x] Per-seat `CardSession` observed every 2P tick; offers and previews on the `final` screen; both previews at once.
- [x] Shared PLAY AGAIN / MAIN MENU gated while a preview is open or just changed (dimmed).
- [x] Snapshots discarded on PLAY AGAIN, MAIN MENU, `stopLoop`; previews closed outside `final`.
- [x] `main.ts` routes 2P clicks to `handleSeatCardPointer` (mute button wins).
- [x] Tests: 2P to `final`, independent open / save / close, file names, discard on retry / menu, privacy spies, 1P card unchanged, source grep includes the new files.
- [x] Update `exorcist-card/design.md` and `two-player/design.md` notes (the "1P only" restriction is removed).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(two-player-card-T3): per-player Exorcist Cards on the 2P end screen`

## T4 — Review notes (NITs)
The small code edits of NITs 1, 4, 5, 6 and 7 landed together with T3 in `loop.ts` / `main.ts`; their tests and the docs are here.
Files: `src/main.ts`, `src/game/loop.ts`, `src/game/loop.card.test.ts`, `README.md`, `exorcist-card/design.md`

- [x] NIT 1: card key path gated by `!isTwoPlayerActive()`; design sentence matches.
- [x] NIT 2: the 2P card test drives to `final` and spies on `observe`.
- [x] NIT 3: README says the 🔊 button is top centre in 2 PLAYERS.
- [x] NIT 4: one import from `./game/loop` in `main.ts`.
- [x] NIT 5: doc comments on the right variables in `loop.ts`.
- [x] NIT 6: `stopLoop()` resets `twoPlayerActive`; test.
- [x] NIT 7: no 1P `begin` when a 2P game starts in the same tick; test.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(two-player-card-T4): review nits`

## T5 — Docs
- [x] README: spec row and count, 2P card paragraph, controls, file layout, test count.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `docs(two-player-card-T5): README`

## T7 — Review fixes
- [x] NIT 1: `finalAt = now` set before the audio calls in `tickTwo`.
- [x] NIT 2: `sharedButtonMaxCy` keeps PLAY AGAIN / MAIN MENU clear of both offers; property test.
- [x] NIT 3: "other half" test also asserts exactly one card composed.
- [x] NIT 4: offer clicks gated by `liveAt` like motion; test.
- [x] NIT 5: design names match the code.
- [x] NIT 6 skipped: cosmetic (pill stays inside the card).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(two-player-card): review nits`

## T6 — Manual smoke test (two people, webcam)
- [ ] Finish a 2P game: each half shows an EXORCIST CARD button; waving in one half never moves the other half's buttons.
- [ ] Each card shows its own half, mirrored like the game, P1 / P2 label, WINNER (or TIE on both), own numbers.
- [ ] Both previews open at once; SAVE downloads `exorcist-card-p1.png` / `-p2.png`; CLOSE does not trigger PLAY AGAIN / MAIN MENU.
- [ ] DevTools Network stays empty; Application → Storage holds no image.
