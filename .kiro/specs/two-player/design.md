# Two Player — Design

## Idea: two seats, each a normal game in a half-width canvas

Instead of teaching every enemy, spawner and renderer about halves, a 2-player
game is **two ordinary `GameState`s** ("seats"). Each seat is simulated and
rendered as if the canvas were `W/2 × H`. Everything in R2 (independence) then
holds by construction, and every 1-player rule (R2.3, R3.2, R3.3) is reused
unchanged because it only ever sees half-width coordinates.

```
                  W
   ┌──────────────┬──────────────┐
   │ seat 0 (P1)  ┆ seat 1 (P2)  │   each: GameState, W/2 × H
   │ x ∈ [0,W/2)  ┆ x ∈ [W/2,W)  │   motion cols 0–159 | 160–319
   └──────────────┴──────────────┘
          divider (orange, glowing)
```

## Geometry and mirror mapping — `src/game/halves.ts` (pure)

```ts
export type Seat = 0 | 1
export const SEATS: readonly Seat[] = [0, 1]

export function halfWidth(w: number): number               // floor(w / 2): integer halves, no half-pixel resampling on odd canvases
export function halfOffset(seat: Seat, w: number): number  // seat * halfWidth(w)
export function seatOfX(x: number, w: number): Seat        // x < w/2 ? 0 : 1 (display, already mirrored)
export function seatOfRawColumn(col: number, rawW: number): Seat
                                                           // seatOfX(mirrorX(col + 0.5, rawW), rawW)
export function cropMotionHalf(d: ImageData, seat: Seat, w = MOTION_W, h = MOTION_H, slot?: number): ImageData
                                                           // copies columns [seat*w/2, (seat+1)*w/2)
export function motionHalfWidth(): number                  // MOTION_W / 2
export function displayPointsInHalf(points, seat, w): Pt[]  // debug-overlay mask points → half-local x
                                                           // (toHalfPoints is the motion-space helper; tested, not used in the loop)
export function pickWinner(a: number, b: number): 0 | 1 | 'tie'
```

**Why left = player 1 is mirror-correct.** `captureFrame` draws the video with
`translate(w,0) scale(-1,1)`, exactly like the display, so *display x == motion
canvas x* (scaled). The motion frame is therefore already in screen orientation:
columns 0–159 are the left of the screen. The person standing on their own left
appears on the left of the mirrored screen (a mirror shows your left on the left),
so they own seat 0. In raw sensor columns that is the **right** half of the
sensor image; `seatOfRawColumn` encodes that and has its own test.

**Cropping.** `cropMotionHalf` copies each row's 160 px slice into a new
`ImageData`-shaped buffer (`{data, width, height}`; the real `ImageData` when
available). Cost: 2 × 160 × 180 × 4 B ≈ 230 KB copy per tick, negligible. Because
a half's detector only sees its slice, a hit gate or swipe centroid can never read
a pixel of the other half (R1.3, R1.4). An enemy hitbox that overhangs the half
edge samples `px >= motionW` → "not moved" (existing out-of-frame rule), so it
cannot spill over either.

## Collision change (backwards compatible)

`scaleHitbox(hitbox, displayW, displayH, motionW = MOTION_W)` and
`resolveHits(..., deltaMs, motionW = MOTION_W)` take an optional motion width
(used for the horizontal scale, the `computeFrameDiff` row stride, the swipe
centroid and its display-space conversion). Default = today's behaviour (R7.2).
A seat is resolved with `resolveHits(seatState, cropCur, cropPrev, W/2, H, now,
frameIsNew, deltaMs, 160)`.

`resolveHits` publishes `lastBanished` / `lastSwipes` module globals; the loop
snapshots `lastBanished` after each seat's call and passes it to that seat's
`renderFrame` (new optional `opts.banished`).

## Session — `src/game/twoPlayer.ts` (pure)

```ts
export type TwoPlayerPhase = 'stageTitle' | 'playing' | 'summary' | 'final'

export interface TwoPlayerState {
  phase: TwoPlayerPhase
  seats: [GameState, GameState]   // each seat's own phase: stageTitle|playing|summary|gameover|victory
  stage: number
  roundTimeMs: number             // shared stage clock (R3.1)
  summaryShownMs: number
}

export function createTwoPlayer(): TwoPlayerState   // both seats → stageTitle, stage 1; no high score is kept in 2P
export function seatStatus(t, seat): 'title' | 'playing' | 'out' | 'cleared' | 'summary' | 'won'
// a boss defeat (seat phase `victory`) is 'cleared' while the session is still `playing`, 'won' afterwards
export function isOut(s: GameState): boolean         // phase === 'gameover'
export function tickTwoPlayer(t, deltaMs, W, H, motion | null): TwoPlayerState  // clock + seats + phase sync
export function advanceSession(t, W, H): TwoPlayerState
export function winnerOf(t): 0 | 1 | 'tie'           // pickWinner(scores)
// per-seat simulation (`stepSeat`, internal) is described below
```

### Seat simulation — `src/game/step.ts`

The `simMs > 0` block of `loop.ts` (boss spawn, `tickSpawners`, `moveEnemies`,
`cullExitedEnemies`, `splitReached` + life loss, `tickBoss`) moves verbatim into
`stepSimulation(state, simMs, W, H): GameState` (with the life-lost sfx calls).
`loop.ts` calls it for 1P (behaviour identical), `twoPlayer.ts` calls it per seat
with `W/2`. Hit-stop split (`splitHitStop`), effect ageing, resolve, particles and
labels follow the same order as 1P; the **timer is not ticked per seat**.

### Shared clock and phase sync (R3.1, R3.4, R4)

Per tick, with `deltaMs`:

1. `stageTitle`: every seat runs `tickRound`. Both reach `playing` on the same
   tick (same delta, same title duration); the session then takes
   `roundTimeMs` from a seat that is playing.
2. `playing`: `roundTimeMs = max(0, roundTimeMs − deltaMs)`; every seat that is
   `playing` gets `seat.roundTimeMs = roundTimeMs` and runs the seat step. After
   its step and hit resolution `tickTimer(seat, 0)` applies the expiry rule (boss
   alive → `gameover` = out, else `summary`). Seats that are `gameover` (out) or
   `summary` (cleared) are frozen: not stepped, no spawns; only their cosmetic
   effects (particles, labels, shake) age so they expire.
3. When no seat is `playing`: if any seat reached `summary` / `victory` the
   session moves to `summary`; if every seat is out → `final`.
4. `summary`: `summaryShownMs += deltaMs`; at 5 s (or motion NEXT) `advanceSession`
   calls `advanceToNextStage` for each seat in `summary` (out seats are left alone,
   R4.5). If the finished stage was the last (or every seat is `victory`/out) →
   `final`; otherwise → `stageTitle`. The bonus round is entered/left for all
   surviving seats together because `advanceToNextStage` handles it per seat.

`final` winner: `pickWinner(seats[0].score, seats[1].score)`.

## Loop integration — `src/game/loop.ts`, `src/game/playerMode.ts`

`playerMode.ts` holds `type PlayerMode = 1 | 2`, a module variable (default 1)
with `getPlayerMode()` / `setPlayerMode()` — memory only (R6.3).

In the loop a `two: TwoPlayerState | null` is kept next to the 1P `state`. The
start screen branch returns a mode when a motion button triggers or key 1 / 2 /
Space is requested (`requestStart(mode?)`). Mode 2 creates `two`; the 2P branch of
`tick` runs instead of the 1P phase branches (they stay untouched). `MENU` and
"play again" drop `two` / recreate it. Button callbacks fired by the 2P screens
during a tick only record a pending action (`twoAction`); the loop applies it
*after* `tickTwo` returns so the tick result cannot overwrite it. A `startRequest`
key pressed during a 2P game is discarded (R6.2).

Per tick in 2P: compute the full mask as today; for each seat crop current / prev
`ImageData`, run the seat step and `resolveHits` with `W/2` and `motionW = 160`;
snapshot `lastBanished`.

## Rendering

Each seat renders into its own off-screen canvas `W/2 × H` (`renderFrame` +
`renderHUD` unchanged except two optional params), which is composited onto the
game canvas at `halfOffset`. Reasons: all existing drawing code reads
`ctx.canvas.width/height`, so a half-size canvas makes it half-aware for free
(fonts via `hudFontSize(W/2)`, fog, candle glow, flash overlay, shake); nothing
can draw across the divider.

- `renderFrame(ctx, state, now, opts?)`: `opts.banished` (default `lastBanished`),
  `opts.motionPixels` (default `lastMotionPixels`) so seat debug overlays use the
  seat's own data.
- `renderHUD(ctx, state, now, opts?)`: `opts.pulse` (per-seat combo-pulse record,
  default the module one), `opts.showMute = false` and `opts.label` ("P1"/"P2").
  `drawMuteButton` is extracted and called once at top centre in 2P
  (`muteButtonRect2P`); `main.ts` picks the rect by mode for pointer taps.
- Divider: a vertical line at `W/2`, `#ff6b1a`, 4 px, glow, drawn after the halves
  but *before* the HUD layer: each seat's HUD is rendered on a separate transparent
  half canvas and composited over the divider (R1.5).
- Shared mute button: top centre, *below* the top HUD row (`y = 20 + fontSize + 8`)
  so it overlaps neither P1's timer nor P2's hearts.
- A seat that goes out has its enemies cleared on that tick (R4.1); a seat whose
  boss is defeated shows CLEARED while the session is still `playing` (R4.2).
- Out / cleared overlay on a seat: dim, big "OUT" (Blood Red) or "CLEARED"
  (Candlelight Yellow), the score; wobble-in is optional polish.
- 2P stage title / summary / end screens are drawn over the full canvas by
  `renderStageTitle` (per half, existing), `renderTwoPlayerSummary` and
  `renderTwoPlayerFinal` in `ui/splitscreen.ts` (start screen stays in `ui/screens.ts`) (both scores side by side; `final` has the winner banner,
  PLAY AGAIN / MAIN MENU motion buttons with the 1.5 s lock-out).

## Start screen

`renderStartScreen(ctx, state, now, onStart(mode))` has two `MotionButton`s:
"1 PLAYER" at the old START position `(W/2, 0.72H)` (keeps the motion harness
`wave` mode working) and "2 PLAYERS" to its right `(W/2 + 2.6 r, 0.72H)`. The
remembered mode's button gets a pumpkin-orange ring. Hint text: "Wave over a
button • or press 1 / 2 • Space = last mode".

## Boss in 2P (R3.3)

Each seat spawns its own boss via the existing `spawnBoss(seat, W/2, H)`. Boss
code only uses `canvasW` for the centre and the sway amplitude
(`SWAY_AMPLITUDE × canvasW`), so with `canvasW = W/2` the boss sways within its
half. `BOSS_SIZE` stays 160 px (an on-screen character size, not a fraction of the
screen, as for every other enemy); on a 1280 px screen a half is 640 px, so the
boss plus its sway still fits. On very narrow windows the boss is partly clipped
by the half, like any enemy overhanging a screen edge (the divider clips, it is
never drawn into the other half). Rejected alternative: one shared boss that both
players hit — it needs cross-half collision, the thing R1.4 forbids.

## Tests

| File | Covers |
|---|---|
| `halves.test.ts` | half widths / offsets, `seatOfX`, `seatOfRawColumn` mirror mapping, `cropMotionHalf` columns, `pickWinner` |
| `halves.property.test.ts` | random hitboxes × random masks: a hit in seat A's crop never depends on seat B's columns; ownership partitions the screen |
| `collision.test.ts` | `scaleHitbox` / `resolveHits` default `motionW` unchanged; `motionW = 160` scales correctly |
| `twoPlayer.test.ts` | independent lives / score / combo, out behaviour (no spawn, other continues), cleared boss, shared clock, phase sync, final, winner / tie, out stays out |
| `twoPlayer.property.test.ts` | clock monotone and equal for both seats; one seat's inputs never change the other; deltaMs split-invariance |
| `playerMode.test.ts` | default 1, set / get, no storage use |
| `loop.mode.test.ts` | start request → mode mapping (keys 1 / 2 / Space), 1P path unaffected; 2P PLAY AGAIN / MAIN MENU / NEXT callbacks take effect, stray keys do not leak |
| `ui/hud.test.ts` | `muteButtonRect2P` centred, per-seat pulse isolation, `showMute` / `label` options |
| `ui/splitscreen.test.ts` | winner text, divider line, OUT / CLEARED overlays |
| `game/render.opts.test.ts` | `renderFrame` options: defaults unchanged for 1P, per-seat banished flash |

## Review fixes (T8)

- Half width is `floor(W / 2)` everywhere (crop, simulation, off-screen canvases, divider), so odd
  window widths neither reallocate the half canvases every frame nor blur the right half.
- Start screen: the mode buttons ignore motion for `START_INPUT_DELAY_MS` (1 s) after the screen is
  (re)entered, and buttons are rebuilt on entry. The 2 PLAYERS button is clamped to stay on screen.
  This stops the wave that triggered MENU from also starting a game (R7.1).
- `renderTwoPlayerSummary` / `renderTwoPlayerFinal` buttons are rebuilt on phase entry
  (`resetSummaryScreen`, `resetFinalScreen`); final-screen radius follows resizes.
- The shared mute button is drawn after the summary / final overlays.
- The clear jingle is not played when the game ends with both players out.
- `tickTwoPlayer` skips `cropMotionHalf` on duplicate camera frames, and passes a `slot`
  (cur = 0, prev = 1) so the crops reuse per-seat scratch buffers instead of allocating.
- Each seat reads the shared clock *before* this tick, simulates, then ticks the timer by
  `deltaMs` — the same order as 1P, so wave-script thresholds fire on the same tick.
- Start-screen entry is signalled by `resetStartScreen()` (called by the loop on entry),
  not inferred from render gaps, so a long hitch never re-arms the lock-out.
- Start buttons shrink / slide left on narrow canvases so 1 PLAYER and 2 PLAYERS never overlap.
- The shared summary shows only the score for an out seat (its per-stage stats are stale).
- `twoPlayerActive` is set in `begin(2)`, so the mute target moves on the same frame.
- `seatStatus` is `cleared` for any finished seat while the session is `playing`; `won` /
  `summary` only after the session leaves `playing`.
- `isTwoPlayerActive` is cleared immediately on MAIN MENU and at `startLoop`.
