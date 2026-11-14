# Motion UI Ergonomics — Design

## Idea: one layout module, one activation model

```
 src/ui/layout.ts  (pure)  ──►  screens.ts / cardScreen.ts / seatCard.ts / splitscreen.ts  (render + hit test)
        │                  ──►  onboarding.ts (hand targets)      ──►  tests (property)
 src/ui/motionButton.ts    ──►  coverage + dwell + decay + latch + exclusive groups
 src/game/collision.ts     ──►  motionFrameSeq (new camera frame counter), motionCell (grid cell in px)
```

## Layout (`src/ui/layout.ts`, pure)

Zones, as fractions of the **area** (the canvas in 1P, one half in 2P) :

| Constant | Value | Meaning |
|---|---|---|
| `ROW_A` | 0.17 H | first row (prefer 15–35 %) |
| row B | `ROW_A·H + 3.1·r` | second row, centre distance 3.1 r (gap 1.1 r); ≤ 0.387 H |
| `COL_OUTER` | 0.12 | left column in 1P, screen-edge column in 2P |
| `COL_INNER_2P` | 0.80 (P1) / 0.20 (P2) | inner column of a half |
| radius | `clamp(min(0.07 H, 0.08 aw | 0.105 aw), 20, 80)` | `aw` = area width, 0.105 for a half |
| single column y | `max(row A, muteBottom + r + 8)` | clears the mute button; always ≤ 0.40 H |

Slots per area: a **stacked column** (rows A and B) and a **single column**
(one button at the single y). 1P: stacked = left (12 %), single = right (88 %).
2P half: stacked = outer, single = inner (mirrored for P2). Assignment:

| Screen | Stacked A | Stacked B | Single (destructive in bold) |
|---|---|---|---|
| `start` | 1 PLAYER | – | 2 PLAYERS |
| `summary` | NEXT | – | – |
| `gameover` / `victory` | RETRY / PLAY AGAIN | EXORCIST CARD | **MENU / MAIN MENU** |
| `preview` | NO PHOTO / PHOTO | CLOSE | **SAVE** |
| `summary2p` (per half) | NEXT | – | – |
| `final2p` (per half) | PLAY AGAIN | EXORCIST CARD | **MAIN MENU** |
| `preview2p` (per half) | NO PHOTO / PHOTO | CLOSE | **SAVE** |

API (all pure):

```ts
buttonLayout(screen, W, H, opts?) : ButtonSpec[]        // full-canvas coordinates, 2P screens return both halves
areaButtons(screen, aw, H, seat | null, opts?) : ButtonSpec[]   // area-local coordinates (what a half canvas uses)
textBand(aw, H, kind) : { x0, x1 }                       // x range reserved for centred text
textRects(screen, W, H) : Rect[]                         // title / score / banner / card-image rects
fitFontPx(text, px, maxW) : number                       // keeps centred titles inside the text band
soundHintRect(W, H) : Rect                               // mirrors the CSS of .sound-hint
```

`ButtonSpec = { id, label, cx, cy, r, destructive, seat }`. `destructive` buttons
get `DESTRUCTIVE_DWELL_MS`.

Text: 1P menu screens keep their text in `x ∈ [0.2 W, 0.8 W]` (titles are shrunk
with `fitFontPx`), so the edge columns (≤ 0.2 W) are free at any height. 2P shared
text (STAGE CLEAR, PLAYER n WINS, scores) moves below 47 % of H, under the rows
of buttons. The card preview image is limited to 60 % of the area width and sits
between the columns.

2P mute: stays top centre; the inner column's single button is pushed below it
(`muteBottom`), and the banners it used to overlap are below 47 %.

## Activation (`motionButton.ts`)

`MotionButton.update(now)`:

1. `seq = motionFrameSeq`; if equal to the last seen value the camera frame is a
   duplicate: return the previous status, change nothing (R2.4).
2. `dt = clamp(now − lastEvalAt, 0, 120)`.
3. `active` = moved samples inside the circle ≥ `max(3, ceil(0.12 · πr² / cellArea))`,
   `cellArea = motionCell.w · motionCell.h` (R2.2).
4. While `awaitRelease` (after a trigger, or `updateGated(now, false)`): stay idle
   with progress 0 until the circle was still for > 150 ms.
5. Active: `progress += dt` if the previous evaluation was active or progress > 0
   (the first active frame only starts the clock). Inactive: hold for
   `REVERSAL_GRACE_MS` (100), then `progress −= 1.5 · dt`.
6. `progress ≥ dwell` → `'triggered'` once, progress 0, latch armed.

`fillProgress()` = `progress / dwell`; `render` draws the wedge and a ring (arc
stroke, radius `r + 6`).

`EntryLock`: `touch(now)` returns whether the screen is live; the first `touch` after
`reset()` sets the entry time; live when `now − entry ≥ ENTRY_LOCK_MS (1200)`. Each
screen calls `button.updateGated(now, live)` so a not-live frame also arms the latch
(R2.5). Screens whose state already carries a timer (1P summary: `summaryShownMs`,
2P summary: `summaryShownMs`) use it; the others use `EntryLock` with an explicit
`reset…Screen()` hook (start, game over, victory, 2P end).

`updateExclusive(buttons, now, lives)`: updates every button with its own `live`
flag, picks the first triggered one in array order (safe actions first, destructive
last), calls `suppress()` (progress 0, latch) on every other button (R2.7).

## Screens

* **1P** (`screens.ts`, `cardScreen.ts`): buttons come from `buttonLayout`; the card
  offer is a persistent `MotionButton` in the same exclusive group as RETRY and MENU
  (order offer, retry, menu). `previewLayout()` is now built from `areaButtons('preview')`.
* **2P** (`splitscreen.ts`, `seatCard.ts`): each half owns its copies of NEXT / PLAY
  AGAIN / MAIN MENU, created with that half's `PointSource` and positioned in half
  coordinates (drawn translated by the half offset). Order for resolution: PLAY AGAIN
  (P1, P2) before MAIN MENU (P1, P2). A half's shared buttons are live when its own
  preview is closed and not recently changed, and the other half's preview has not
  been open longer than `PREVIEW_LOCK_MAX_MS` (20 s). **Chosen rule: either player's
  deliberate dwell fires the shared action** (documented in README).
* **Loop** (`loop.ts`): calls `resetGameOverScreen()` on entering game over;
  passes per-half motion sources and live flags to the 2P end screen.

## Sound hint, onboarding

The sound hint moves to the top centre: `SOUND_HINT` (`topFrac` 1.5 %, `maxWidthFrac` 56 %) in `layout.ts`
is applied by `main.ts` as inline style, and `soundHintRect` uses the same constants for the tests. The onboarding silhouette takes its hand targets from
`buttonLayout('start', w, h)` and `drawGuide` writes the "Raise a hand…" line below
the head/shoulders (inside the text band).

## Tests

| File | Covers |
|---|---|
| `layout.test.ts`, `layout.property.test.ts` | R1, R3.2, R4.4, R4.5, R5, R6, R7 over random canvases |
| `motionButton.test.ts`, `motionButton.property.test.ts` | R2 |
| `screens.*.test.ts`, `splitscreen.test.ts`, `seatCard.test.ts`, `cardScreen.test.ts`, `loop.*.test.ts` | per-screen lockout/latch, exclusivity, 2P halves, lease |
| `onboarding.test.ts` | hand targets equal layout zones |

## Notes

* Supersedes juice R5.3 only for input: the 1P and 2P summary NEXT stays drawn and unfaded, but ignores
  motion for the entry lockout (1.2 s), because the stage-end flail must not press it.
* 2P mute: it stays top centre. The overlap came from the banners, which now sit below 47 % of the height;
  the layout keeps every button clear of the mute rect (the inner column's single button is pushed below it).
* 2P shared decisions: either player's deliberate dwell fires the action (not both). Rationale: a player who
  walked away cannot hold the other hostage, and sway cannot reach a raised edge button with 12 % coverage and
  a 650 ms dwell. MAIN MENU needs 1000 ms.
* Motion harness `wave` mode now hovers over the 1 PLAYER zone (mirrored raw x = 88 %, y = 17 %).
