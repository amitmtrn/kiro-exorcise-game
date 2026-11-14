# Two Player Card — Design

## Idea: one card pipeline per seat

A 2P game is two seats. Each seat gets its own `CardSession` (run stats + snapshot store +
preview state, from `exorcist-card/`), its own preview UI and its own offer button, all fed
only with that seat's state, that seat's half of the camera and that seat's half of the motion
points. Independence then holds by construction, as it does for the game state.

```
 seat 0 (P1)                           seat 1 (P2)
 CardSession  ◄ observe(seat state)    CardSession  ◄ observe(seat state)
   grab = grabHalfSnapshot(video, 0)     grab = grabHalfSnapshot(video, 1)
 SeatCard   ◄ half-local motion       SeatCard   ◄ half-local motion
              ◄ clicks with x in half               ◄ clicks with x in half
```

## Modules

| File | Pure? | Purpose |
|---|---|---|
| `src/card/halfSnapshot.ts` | geometry pure, grab = canvas | `halfSnapshotGeometry(seat, W, H)`, `grabHalfSnapshot(video, seat, W, H)` |
| `src/card/twoPlayerCard.ts` | yes | `badgeFor(winner, seat)`, `cardFileName(seat)`, `seatLabel(seat)` |
| `src/card/layout.ts` | yes | `CardData` / `CardTexts` / `CardLayout` gain optional `playerLabel` / `badge` boxes |
| `src/card/draw.ts` | canvas | draws the label chip and the badge ribbon when present |
| `src/card/session.ts` | yes | optional `extra()` dep merged into `CardData` |
| `src/ui/motionButton.ts` | canvas | optional point source (default: whole-frame `lastMotionPixels`) |
| `src/ui/cardScreen.ts` | canvas | `CardPreview` takes an optional point source |
| `src/ui/seatCard.ts` | canvas | `SeatCard`: per-half offer button, preview, lock, click queue; `seatOfferGeometry` |
| `src/game/loop.ts` | – | per-seat sessions, routing, lifecycle on the `final` phase |
| `src/main.ts` | – | `pointerdown` in 2P goes to `handleSeatCardPointer` |

## Half snapshot (R2.3, R2.4)

```ts
halfSnapshotGeometry(seat, W, H): { w, h, scale, offsetX, halfW }
```
`hw = halfWidth(W)`, `off = halfOffset(seat, W)`; `scale = scaleToFit(hw, H, 640, 480)` factor;
the canvas is `round(hw·k) × round(H·k)`. The in-game view draws the video with
`translate(W,0) scale(-1,1) drawImage(video, 0, 0, W, H)`. The half snapshot uses the same
draw with the transform `scale(k,k) · translate(-off, 0) · translate(W,0) · scale(-1,1)`, so
display x in `[off, off+hw)` lands on canvas x in `[0, hw·k)` and everything else falls
outside the canvas and is clipped by it. The other half is never stored anywhere (no full-size
intermediate canvas). Mapping check: a raw sensor column `u·W` lands at display x
`W − u·W`, hence in seat 0's canvas for `u > 0.5` (right half of the sensor) and in seat 1's for
`u < 0.5`; the test applies the recorded transform to sample columns to prove it.

The card paints the photo cover-fitted (a centred crop of the half) into the photo window like the 1P card.

## Per-seat moments (R2.2)

`CardSession.observe(seatState, W, H)` runs every 2P tick for both seats (the same
`observeRun` as 1P). `end` fires when a seat's phase becomes `gameover` (it went out, at that
moment). `boss` fires on the tick after that seat's boss is defeated: the loop remembers whether the seat
had a boss on the previous tick and passes `bossDefeated` (seat phase now `summary` / `victory`) to
`observe`, so the photo is taken in front of the live camera, not on the end screen. `RunStats.bossTaken`
stops a later `victory` from offering a second boss moment. 1P is unchanged (boss on entering `victory`). Because each session sees one seat only, a
combo of P1 can never offer a moment to P2. `grab` is bound to the seat, so it crops that half.

## Card content, label and badge (R3)

`CardData` gets `playerLabel?: string` and `badge?: string`. `buildCardTexts` copies them into
`CardTexts.playerLabel` / `badge`; `layoutCard` places them on the photo (label top-left, badge
top-right, `fitText` with `maxW = 40 %` of the photo width) and returns them as optional
`TextBox`es, so the property test (everything inside the card) covers them. Without them the layout is
byte-for-byte the 1P layout. `drawCard` paints a dark pill with the label and a pumpkin-orange
ribbon with the badge (midnight text); a WINNER badge is gold (candlelight fill), a TIE badge stays orange.

`badgeFor(winner, seat)`: `tie → 'TIE'`, `winner === seat → 'WINNER'`, else `undefined`.
`cardFileName(seat)`: `exorcist-card-p1.png` / `-p2.png`. The session is built with
`extra: () => ({ playerLabel, badge })` reading the current `winnerOf(two)`; `download` uses
`downloadCanvasPng(c, cardFileName(seat))`.

## Input routing (R1.3, R1.4)

- **Motion.** Each tick the loop computes `displayPointsInHalf(lastMotionPixels, seat, W)`:
  only points inside the half, with x relative to the half. `SeatCard` draws on a half-sized
  transparent canvas, so the button circles and the points share the half-local coordinate
  system and a button can only ever see points of its own half. The buttons are also clamped to the half
  by their geometry (`seatOfferGeometry`, `previewLayout` use the half width).
- **Clicks.** `handleSeatCardPointer(x, y)` returns false unless the 2P `final` screen is
  showing. `routeSeatClick(x, y, W)` gives the seat, local `x − halfOffset`; the click is queued for that seat only and
  hit-tested against that seat's offer or preview buttons.
- **Keys.** Not used in 2P. `main.ts` gates the card key path with `!isTwoPlayerActive()` too.
- **Mute.** `main.ts` toggles mute when the click lies on `muteButtonRect2P`, and does not route it to a card.

## Screen flow and locks

```
final ─ offer visible in each half (after the 1.5 s final lock-out)
  P1 offer wave/click ─► P1 preview (SAVE / NO PHOTO / CLOSE)      P2 independent
```
`SeatCard.render(ctx, now, live)` draws, on its own transparent half canvas, the offer
button (gated: `live && now ≥ liveAt`) or the preview. After open / close of a preview it resets and
gates the seat's offer button for 0.8 s and records `lockedUntil = now + 0.8 s`. The loop passes
`buttonsLive = !anyOpen && now ≥ max(lockedUntil of both seats)` to `renderTwoPlayerFinal`, which gates
PLAY AGAIN / MAIN MENU with it and draws them at 35 % alpha while locked. On the final screen the
PLAY AGAIN / MAIN MENU buttons are placed by `sharedButtonLayout`: centred in the band between the
"out of lives" line (`0.6 H + 12 px`) and an 8 px gap above both offers, with the radius shrunk if the band is
short. They overlap neither label, score nor offers from 640 × 480 to 1920 × 1080 (tested).
Offer clicks obey the same 0.8 s gate as offer motion. `finalAt` is set before any audio call. The seat card layers are composited over the final overlay, and the divider is redrawn above them.

## Lifecycle (R2.5)

`session.reset()` for both seats on PLAY AGAIN, MAIN MENU, `stopLoop()` and the cleanup returned by
`startLoop`. Previews are closed whenever the session phase is not `final`. `observe` also resets
a seat on its own when its phase leaves `gameover` / `victory`. The 1P session is untouched.

## Privacy

`src/card/halfSnapshot.ts`, `twoPlayerCard.ts` and `ui/seatCard.ts` are included in the source grep
of `card/privacy.test.ts` (no network or storage API). Spies in `loop.card2p.test.ts` assert that
`fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, `localStorage.setItem` and
`indexedDB` are never called while a 2P game reaches `final`, cards are opened and saved; the download
helper is exercised with injected deps (URL revoked).

## Review notes folded in

NIT 1 (`main.ts` key path gated by `!isTwoPlayerActive()`, sentence in exorcist-card design now true),
2 (discriminating 2P test drives to `final`, spies on `observe` / grab), 3 (README), 4 (single import),
5 (comment placement), 6 (`stopLoop` resets `twoPlayerActive`), 7 (a `!twoStarted()` guard at the
call site in `loop.ts` stops the 1P `begin` when a 2P game starts in the same tick; `begin` itself is unchanged).

## Tests

| File | Covers |
|---|---|
| `card/halfSnapshot.test.ts` | geometry per seat, cap 640 × 480, mirror mapping of raw columns, only the half's draw call, release |
| `card/twoPlayerCard.test.ts` | badge winner / tie / loser, file names, labels |
| `card/layout.test.ts`, `layout.property.test.ts` | label / badge inside the card, 1P layout unchanged |
| `card/draw.test.ts` | label and badge drawn only when given |
| `card/session.test.ts` | `extra` merged into the card data; independent sessions |
| `ui/motionButton.test.ts` | custom point source |
| `ui/seatCard.test.ts` | per-half routing (unit + property: no cross-half trigger, clicks), geometry inside the half, locks |
| `game/loop.card2p.test.ts` | 2P to `final`: per-seat offers, independent open / save / close, file names, discard on again / menu, privacy spies, 1P unchanged |
