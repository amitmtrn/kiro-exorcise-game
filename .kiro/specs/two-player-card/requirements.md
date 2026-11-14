# Two Player Card — Requirements

## Scope

On the **two-player end screen** each player can make their **own** Exorcist Card
from their own half of the mirrored camera view: their own snapshot, taken at
their own highlight moment, their own numbers and rank title, a "P1" / "P2"
label and a winner badge. Each half has its own card offer and its own
SAVE / NO PHOTO / CLOSE controls, operated by a wave (or click) **in that half
only**. Both players can have their card open at the same time.

Builds on `exorcist-card/` (card, snapshot, privacy rules) and `two-player/`
(halves, seats, end screen). The 1P card is unchanged. This spec replaces the
earlier "card is 1P only" restriction in both of those specs.

Out of scope: a joint photo of both players, card keyboard shortcuts in 2P (a key
cannot say which player pressed it), persisting cards.

---

## R1 — Per-half offer and controls

**R1.1** On the 2P end screen (`final`) each half shows an "EXORCIST CARD" offer
button inside that half. Nothing is composed, shown or downloaded until a player
chose it (same rule as exorcist-card R1.2); SAVE is a second explicit choice.

**R1.2** Each half has its own preview with SAVE, NO PHOTO / PHOTO (toggle) and CLOSE,
drawn inside that half. Opening, closing, toggling and saving in one half never
changes the other half's card, preview or snapshot.

**R1.3** Motion routing. A button of half A reads only motion points that lie in
half A. Motion anywhere in half B never fills, triggers or holds a button of half A,
whatever the button position, radius or motion position.

**R1.4** Click routing. A click / tap acts only on the buttons of the half that
contains it (a click at `x < halfWidth` belongs to P1, otherwise P2) and, for that
half, only on the offer button (preview closed) or the preview buttons (preview open).

**R1.5** One wave = one action, as in 1P (`MotionButton` awaits release); preview
buttons ignore motion for `PREVIEW_INPUT_DELAY_MS` after opening.

**R1.6** Both previews can be open at the same time.

**R1.7** The shared PLAY AGAIN / MAIN MENU buttons are inactive (and drawn dimmed)
while any card preview is open and for 0.8 s after any preview opened or closed,
so a CLOSE wave cannot fall through to them. They keep the 1.5 s end-screen lock-out.
The offer buttons use the same 1.5 s lock-out.

**R1.8** Keys `C` / `S` / `N` / `Esc` do nothing in 2P. The shared mute button
stays clickable and wins over a card button under it.

---

## R2 — Per-player snapshot (own half, own moment)

**R2.1** Each seat has its own run stats and its own single in-memory snapshot,
managed by the same rules as exorcist-card R2 (strictly-better replacement, lazy
camera read, fallback at the end).

**R2.2** Highlight moments are tracked per seat from that seat's own state:
`boss` (that seat's boss defeated; the snapshot is taken on the tick after the defeat, in that player's half, not on the end screen) > `combo` (that seat's new best tier ≥ x2) >
`end` (that seat went out, or finished the game). One player's combo never
creates or replaces the other player's snapshot.

**R2.3** The snapshot contains **only the player's half**: the camera is drawn
mirrored, exactly like the in-game view, onto a canvas that is only as wide as one
half. The other half's pixels are never drawn into, stored in or passed to that
player's card.

**R2.4** Mirror-correct crop. Half 0 (P1) is the left half of the mirrored view,
i.e. the right half of the raw sensor image; half 1 (P2) the left half of the raw
image. The snapshot has the same orientation as that half on screen.

**R2.5** The snapshot is held in memory only, at most one per seat (≤ 640 × 480),
and discarded (pixels released) when the game leaves the end screen (PLAY AGAIN,
MAIN MENU), when a new game starts and when the loop stops.

---

## R3 — Card content in 2P

**R3.1** The card shows the same content as the 1P card (title, photo or silhouette,
rank title, Score, Best combo, Stage reached, Banished) using **that seat's**
own state and run stats. Rank title comes from that seat's score.

**R3.2** A small label "P1" or "P2" is drawn on the photo.

**R3.3** The winner's card carries a "WINNER" badge. On a tie both cards carry
"TIE". The loser's card has no badge. Winner is the same `winnerOf` as the end
screen (higher score; being out does not decide).

**R3.4** The label and badge are inside the card with any text length (layout stays pure
and inside the card, exorcist-card R4.1). 1P cards have neither (layout and drawing
unchanged).

**R3.5** File names: `exorcist-card-p1.png` and `exorcist-card-p2.png`. The 1P
file name stays `exorcist-card.png`.

---

## R4 — Privacy and constraints

**R4.1** Same guarantees as exorcist-card R5: cards are created only on explicit request;
export via `canvas.toBlob` + object URL + `<a download>`; the URL is always revoked;
no `fetch` / `XMLHttpRequest` / `sendBeacon` / `WebSocket`; no `localStorage`,
`IndexedDB`, cookies or Cache API for images. No new network fetches, no new assets,
no new runtime dependencies.

**R4.2** The onboarding privacy line stays unchanged; the card footer stays
"Made on your device. Not uploaded."

**R4.3** All timing is `deltaMs` / `now` based (motion-button fills, locks).

**R4.4** 1P behaviour is unchanged: same card flow, keys, clicks, file name, locks
and layout. Existing tests pass.

**R4.5** Tests cover: per-half crop and mirror mapping, independent per-player
highlight tracking, per-half input routing (property test: no cross-half
triggering), winner / tie badge, file names, privacy spies (no network / storage),
snapshot discard on retry / menu, 1P card unchanged.

---

## R5 — Review notes folded in

**R5.1** Docs match code: the exorcist-card design note on key / click forwarding,
README mute button position in 2P.
**R5.2** Code hygiene: single `./game/loop` import in `main.ts`; doc comments in
`loop.ts` sit on their own variables; `stopLoop()` resets `twoPlayerActive`; a pending
Space / `1` request in the same tick as the 2 PLAYERS button does not also begin a 1P game.
**R5.3** The 2P card test must discriminate: it drives a 2P game to `final` and asserts there.
