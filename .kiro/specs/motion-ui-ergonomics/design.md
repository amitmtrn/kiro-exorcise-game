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
| `ROW_A` | 0.19 H | first row (prefer 15–35 %) |
| row B | `ROW_A·H + 3.1·r` | second row, centre distance 3.1 r (gap 1.1 r); ≤ 0.40 H (0.19 + 3.1·0.065 = 0.3915 H) |
| `COL_OUTER` | 0.12 | left column in 1P, screen-edge column in 2P |
| `COL_INNER_P1` / `COL_INNER_P2` | 0.80 / 0.20 | inner column of a half |
| radius | `clamp(min(0.065 H, 0.06 aw \| 0.105 aw, 0.12 aw − 10), 20, 80)` | `aw` = area width, 0.105 for a half; last term keeps the ring (`RING_OUTSET` 9) on the canvas |
| single column y | `max(row A, muteBottom + r + 8)` | clears the mute button; always ≤ 0.40 H |

Slots per area: a **stacked column** (rows A and B) and a **single column**
(one button at the single y). 1P: stacked = left (`COL_LEFT_1P` 30 %), single = right (`COL_RIGHT_1P` 70 %), 0.20 W either side of the player (see Reach model).
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
textBand(aw, seat) : { x0, x1 }                       // x range reserved for centred text
textRects(screen, W, H) : Rect[]                         // title / score / banner / card-image rects
fitFontPx(text, px, maxW) : number                       // keeps centred titles inside the text band
soundHintRect(W, H) : Rect                               // mirrors the CSS of .sound-hint
```

`ButtonSpec = { id, label, cx, cy, r, destructive, seat }`. `destructive` buttons
get `DESTRUCTIVE_DWELL_MS`.

Text: 1P menu screens keep their text in `x ∈ [0.38 W, 0.62 W]` above 47 % of H (`TEXT_BAND_1P`, titles are shrunk
with `fitFontPx`) and in `[0.2 W, 0.8 W]` below it (`TEXT_BAND_LOW`, e.g. the start hint at 90 %), so the columns (≤ 0.36 W) are free at the button rows. 2P shared
text (STAGE CLEAR, PLAYER n WINS, scores) moves below 47 % of H, under the rows
of buttons. The card preview image is limited to 60 % of the area width and sits
between the columns.

2P mute: stays top centre; the inner column's single button is pushed below it
(`muteBottom`), and the banners it used to overlap are below 47 %.

## Reach model (`layout.ts`, R9)

Pure functions and constants: `FOV_DEG` [65, 75], `NEAR_M` 1.5, `FAR_M` 2.5, `SHOULDER_HALF_M` 0.2,
`ARM_M` 0.65, `PLAYER_CENTRE_1P` 0.5, `PLAYER_CENTRE_2P` [0.25, 0.75].

* frame width `Wf = 2·d·tan(FOV/2)`; sideways reach as a fraction of the frame width `(0.2 + 0.65) / Wf`
  (hand at shoulder height, arm out; a hand raised above the shoulder reaches slightly less; the 1P columns use 0.57 of the 0.65 m arm).

| Distance | FOV 65° (Wf → reach) | FOV 75° (Wf → reach) | Guaranteed |
|---|---|---|---|
| near 1.5 m | 1.91 m → 0.445 W | 2.30 m → 0.369 W | `REACH_NEAR` 0.369 W |
| far 2.5 m | 3.19 m → 0.267 W | 3.84 m → 0.221 W | `REACH_FAR` 0.221 W |

Rule: `0.18·aw ≤ |cx − c| ≤ REACH_FAR·W` for every button centre (c = player centre), `cy ≤ 0.40 H`.
Before: 1P columns at 12 % / 88 % were 0.38 W from the player, i.e. 1.46 m at 2.5 m (arm reach 0.85 m):
out of reach. 2P outer columns (6 % / 94 %, 0.19 W = 0.73 m) and inner columns (40 % / 60 %, 0.15 W) were
already in reach and stay. The 1P columns move to 30 % / 70 % (0.20 W = 0.77 m at the far FOV-75° case, so the hand is 0.57 m from the shoulder, inside the 0.65 m arm; the centre is 0.57 m outside the 0.2 m torso half-width).
Knock-on: the 1P text band narrows to [0.38, 0.62] W above 47 % of H, `RADIUS_W_FULL` 0.08 → 0.06 and `RADIUS_H`
0.07 → 0.065 keep the circles outside it, and `ROW_A` 0.17 → 0.19 keeps row A under the sound hint at the
tallest hint size.

## Activation (`motionButton.ts`)

`MotionButton.update(now)`:

1. `seq = motionFrameSeq`; if equal to the last seen value the camera frame is a
   duplicate: return the previous status, change nothing (R2.4).
2. `dt = clamp(now − lastEvalAt, 0, 120)`.
3. `active` = moved samples inside the circle ≥ `max(3, ceil(0.12 · πr² / cellArea))`,
   `cellArea = motionCell.w · motionCell.h` (R2.2).
4. While `awaitRelease` (after a trigger, or `updateGated(now, false)`): stay idle
   with progress 0 until the circle was still for > 150 ms.
5. Active: `progress += dt` only if the previous evaluation was active
   (the first active frame after any gap only starts the clock). Inactive: `progress −= 1.5 · dt`
   on every off frame, no grace (a grace period let 3-on/3-off patterns net-fill).
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
  been open longer than `PREVIEW_LOCK_MAX_MS` (20 s), counted from its first opening in this
  end-screen visit (`reset()` on entry starts a new lease; reopening does not). **Chosen rule: either player's
  deliberate dwell fires the shared action** (documented in README).
* **Loop** (`loop.ts`): calls `resetGameOverScreen()` on entering game over;
  passes per-half motion sources and live flags to the 2P end screen.

## Sound hint, onboarding

The sound hint moves to the top centre: `SOUND_HINT` (`topFrac` 1.5 %, `maxWidthFrac` 56 %) in `layout.ts`
is applied by `main.ts` as inline style, and `soundHintRect` uses the same constants for the tests. The onboarding silhouette takes its hand targets from
`buttonLayout('start', w, h)` and `drawGuide` writes the "Wave a hand…" line below
the head/shoulders (inside the text band).

## Tests

| File | Covers |
|---|---|
| `layout.test.ts`, `layout.property.test.ts` | R1, R3.2, R4.4, R4.5, R5, R6, R7 over random canvases |
| `motionButton.test.ts`, `motionButton.property.test.ts` | R2 |
| `screens.*.test.ts`, `splitscreen.buttons.test.ts`, `seatCard.test.ts`, `cardScreen.test.ts`, `loop.*.test.ts` | per-screen lockout/latch, exclusivity, 2P halves, lease |
| `onboarding.test.ts` | hand targets equal layout zones |

## Notes

* Supersedes juice R5.3 only for input: the 1P and 2P summary NEXT stays drawn and unfaded, but ignores
  motion for the entry lockout (1.2 s), because the stage-end flail must not press it.
* 2P mute: it stays top centre. The overlap came from the banners, which now sit below 47 % of the height;
  the layout keeps every button clear of the mute rect (the inner column's single button is pushed below it).
* 2P shared decisions: either player's deliberate dwell fires the action (not both). Rationale: a player who
  walked away cannot hold the other hostage, and sway cannot reach a raised edge button with 12 % coverage and
  a 650 ms dwell. MAIN MENU needs 1000 ms.
* Motion harness `wave` mode now hovers over the 1 PLAYER zone (mirrored raw x = 70 %, y = 17 %), in 2 s bursts
  with 1 s gaps so the start screen's release latch (R2.5) sees the hand leave; `drive.mjs` clicks the onboarding Skip.

## Review fixes (T7)

- `sharedButtonsLive(cards, now)` (`seatCard.ts`) is computed after both cards rendered, so an offer
  that opens this frame holds its half's PLAY AGAIN / MAIN MENU (R2.7); `loop.ts` uses it.
- `main.ts` sets the hint font from `soundHintFontPx(gameCanvas.width)` and hides the hint after `SOUND_HINT_MS` (8 s).

## Review fixes (T10)

- `createSoundHintController` defaults to arrow wrappers around `setTimeout` / `clearTimeout`; a test
  replaces the globals with `this`-checking versions that throw like a browser does.
- `SeatCard.openedAt` is set only on the first open after `reset()`, so the R4.3 lease is per end-screen visit.
- `muteRectFor(aw, half, W = 2·aw)` takes the full canvas width; `muteRectOf` passes `W`, so the 2P rect equals
  the drawn `muteButtonRect2P(W, …)` on odd widths.
- `renderSummary` clears `summarySet` when `summaryShownMs` drops (a new summary visit), like the other screens.
- The hint font uses the canvas width, the same input as `soundHintRect`.
