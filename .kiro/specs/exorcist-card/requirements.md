# Exorcist Card — Requirements

## Scope

At **game over** and on the **victory screen** the player can choose to make an
"Exorcist Card": a shareable, trading-card style PNG composed locally on a canvas
from a webcam snapshot, a spooky procedural frame, the Creepster title font and
the run's numbers (score, best combo, stage reached, enemies banished, a playful
rank title). The card is downloaded locally; nothing leaves the device.

Builds on `boss-phases/` (victory screen, R6.3), `spooky-skin/` (palette),
`onboarding/` (privacy line) and `juice/` (title font). Does not change gameplay.

---

## R1 — Offer, never automatic

**R1.1** The game-over and victory screens each offer an "EXORCIST CARD" choice as
a motion button, and by click/tap on that button or by pressing `C`.

**R1.2** No card is composed, shown or downloaded unless the player chose it.
Choosing the card opens a preview; downloading needs a second explicit choice
("SAVE" motion button, click, or `S` / `Enter`).

**R1.3** The preview offers: SAVE, NO PHOTO / PHOTO (toggle), CLOSE (`Esc`).
Closing returns to the game-over / victory screen with its buttons unchanged.

**R1.4** While the preview is open the Retry / Menu / Play Again buttons are
inactive, so a wave cannot restart the game by accident.

---

## R2 — Snapshot (memory only)

**R2.1** The game keeps at most **one** snapshot of the (mirrored) webcam image,
held only in memory (an off-screen canvas). It is never written to
`localStorage`, `IndexedDB`, cookies, the Cache API or the file system.

**R2.2** A snapshot is taken at a fun moment, with a rank per moment kind:
`boss` (boss defeated → victory) > `combo` (a new run-best combo tier ≥ x2; a higher
tier ranks higher) > `end` (fallback taken when the game ends without a better one).

**R2.3** A new moment replaces the stored one only if its rank is **strictly higher**.
The camera is only read (`drawImage`) when the moment is accepted.

**R2.4** The snapshot is discarded (and its canvas released) when the player leaves
the game-over / victory screen — Retry, Menu, Play Again — and when a new game
starts. It is never kept across runs.

**R2.5** The snapshot is mirrored exactly like the in-game view (it is captured
with the same mirrored draw as the live feed), so the card matches what the player saw.

---

## R3 — Card content

**R3.1** The card shows: title "EXORCIST" (Creepster), the photo (or silhouette),
the rank title, and four rows: Score, Best combo (`x1`–`x4`), Stage reached
(`n / 5`) and Banished (enemies swatted over the whole run).

**R3.2** Rank title is a pure function of the score: Apprentice Exorcist →
Spirit Sweeper → Haunt Hunter → Ghostbane Knight → Master Exorcist → Grand
Exorcist, non-decreasing in the score; negative / non-finite scores give the lowest rank.

**R3.3** Run stats (best combo, stage reached, banished) are run-wide, not per
stage: they survive stage changes and reset on Retry / Menu / new game.

**R3.4** The look is procedural canvas drawing only: midnight → deep-purple
background, pumpkin-orange double frame, candlelight-yellow numbers, corner
cobwebs, bats and a moon. Friendly, never scary.

**R3.5** Optional **no-photo** variant: a head-and-shoulders silhouette replaces the
camera image (also the automatic fallback when no snapshot exists).

---

## R4 — Layout

**R4.1** Layout is a pure function of the card size and the texts (no canvas, no
DOM). Every rectangle and every text extent lies inside the card, with a margin,
for any card size ≥ 200 × 280 and any score / rank / number lengths.

**R4.2** Text that would be too wide shrinks (down to a minimum size) and then is
truncated with "…", using a character-width estimate so layout needs no canvas.

**R4.3** The photo is cover-fitted (cropped, never stretched) into its rectangle.

---

## R5 — Local download and privacy

**R5.1** The card is exported with `canvas.toBlob('image/png')`, an object URL
(`URL.createObjectURL`) and a temporary `<a download>` click. The object URL is
**always revoked** afterwards (also when the click throws or `toBlob` yields null).

**R5.2** The download flow makes no network request: no `fetch`, `XMLHttpRequest`,
`sendBeacon`, `WebSocket` or `<img>`/`<script>` to a remote URL. No new network
fetches are added anywhere in the game.

**R5.3** The exact onboarding line `Your video stays on your device. Nothing is uploaded.`
stays unchanged and stays true. The card preview repeats the promise in short
form ("Made on your device. Not uploaded.").

**R5.4** The temporary `<a>` element is removed from the DOM after the click.

---

## R6 — Constraints

**R6.1** All art procedural; no image / audio assets; no new runtime dependencies.

**R6.2** All timing in the card UI is `deltaMs`/`now` based (motion-button fills use
the existing `MotionButton`), never per-frame counters.

**R6.3** Tests: rank selection (incl. property: monotone), layout (incl. property:
inside the card for any lengths), snapshot lifecycle, run-stat tracking, download
flow with mocked `toBlob` / `URL` and spies proving no `fetch` / XHR / `sendBeacon`.
