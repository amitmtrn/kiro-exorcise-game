# Playtest 1 Fixes — Design

Every root cause below was found by reading the code and has (or gets, in the
named task) a failing test that is committed in the same commit as its fix.
The capture runs at about 8 fps (frames 125 ms apart), so it cannot tell one
tick from seven; the causes below cover both readings.

## 1. Instant game over

Observed: 3 of 3 hearts in every frame up to 2:55.6, then NAME YOUR HUNTER
125 ms later, with no heart lost on screen, no death sequence, no GAME OVER.

Root causes (all in code, all reproduced in T1 tests):

1. **One life per reached enemy in one tick.** `step.ts` calls
   `splitReached` (returns the number of enemies that reached the target) and then
   runs `decrementLife` once per enemy. Three ghosts arriving in the same tick
   (stage 3 allows 6 enemies, plus the swarm and flyby waves) take 3 → 0 in one
   `stepSimulation`.
2. **No spacing between life losses.** Skull hit (`collision.ts`), a missed
   enemy (`step.ts`) and a boss strike (`bossPhases.ts`) all call `decrementLife`
   directly. Nothing stops a second one on the next tick, so a skull hit plus two
   arrivals inside the 125 ms between two capture frames empties the hearts.
3. **Game over opens the name screen in the same frame.** The `gameover` branch
   of `loop.ts` calls `onRunEnd` (which makes the name entry for a table-worthy
   score such as 30050) and `runNameScreen` on its very first frame, and only
   draws GAME OVER when the name screen is closed. The HUD (hearts) is drawn
   only in the `playing` branch, so the last heart loss is never drawn at all.
   The video sequence (play frame → name screen) is exactly this.

Ruled out: twin wisps (`splitReached` already counts a pair once), the HUD
drawing stale lives (it reads `state.lives` each frame), another route to the
name screen (only `onRunEnd` creates a name entry, called from the game-over
and victory branches), a skull counted twice (a hit skull leaves the list; two
different skulls need two events and are covered by the grace).

### State (`state.ts`)
```ts
interface GameState { /* ... */
  invulnMs: number    // life-loss grace left, counts down with game time
  lifeFxMs: number    // HUD shake / flash left after a heart is lost
  deathMs: number     // death transition left once phase === 'gameover'
}
export const LIFE_GRACE_MS = 1000
export const LIFE_FX_MS = 700
export const DEATH_MS = 1000
export const NAME_DELAY_MS = 1500
```
- `decrementLife(s)`: returns `s` unchanged when `s.invulnMs > 0` or the phase is
  `gameover`; else lives − 1, `invulnMs = LIFE_GRACE_MS`, `lifeFxMs = LIFE_FX_MS`;
  at 0 lives the phase becomes `gameover` with `deathMs = DEATH_MS`.
  `phase === 'gameover'` keeps its meaning for every existing guard (nothing
  scores, enemies freeze); only the screens wait for `deathMs`.
- `tickTimer` boss timeout also sets `deathMs = DEATH_MS`.
- `tickLifeTimers(s, ms)` counts `invulnMs` and `lifeFxMs` down (called from
  `stepSimulation` with `simMs`, and from `tickEffects`); `tickDeath` counts
  `deathMs` down in `tickEffects`. 2P seats use the same functions.
- `step.ts`: the miss loop keeps `incrementMissed` per enemy but resets the combo
  once and plays the life-lost sound only when `lives` really dropped.
- `collision.ts` skull: flash, particles and sound only when a heart was lost.

### Loop (`loop.ts`)
- gameover branch, `deathMs > 0`: scene frozen, HUD drawn with 0 hearts and the
  loss effect, no buttons, no `onRunEnd`, no name screen.
- After the death: GAME OVER / YOU WIN screen (as today). `onRunEnd` still records
  the score at that moment, but `runNameScreen` is skipped until
  `NAME_DELAY_MS` after the screen appeared (`endShownAt`).
- 2P: `tickTwo` opens the name screens only `NAME_DELAY_MS` after `finalAt`;
  a seat in `gameover` shows its OUT overlay after its own `deathMs`.

### HUD (`hud.ts`)
While `lifeFxMs > 0` the hearts shake (amplitude × `shakeScale(reducedFlash)`)
and draw in Blood Red with a pulse; with `reducedFlash` the pulse is a steady
highlight (no blink) and the shake is a quarter. Pure helper
`lifeFx(lifeFxMs, reduced)` returns `{ dx, glow, blink }` and is unit-tested.

### Tests
`lives.property.test.ts` (fast-check): with lives > 1 no tick goes to
`gameover`; lives never drop by more than 1 inside the grace window; gameover
always carries `deathMs = DEATH_MS`. Unit tests: three reached enemies cost one
heart; skull plus reach inside the grace cost one; a loop test shows the name
screen is not drawn before GAME OVER.

## 2. Motion buttons fill but do not fire

Reproduced on every screen with a hand on the exact circle centre: every button
fires once (the activation callbacks are wired, buttons are persistent in a
`ButtonSet`, the release latch clears). The failures need a real hand:

1. **A neighbour steals the press.** A button only asks "has 12 % of my circle
   moved?". Stacked buttons sit 3.1 radii apart, so a forearm or a wide hand on
   CLOSE (row B) also covers 12 % of NO PHOTO (row A); both fill at the same
   rate and `updateExclusive` gives the frame to the first one in list order
   (toggle before close, ◄ before OK). The player sees the wanted ring fill and
   something else happens (the photo flips, the name is reset to "A").
2. **OK did not finish naming.** After ◄ / ► had touched the name, `confirm`
   only moved a cursor that was drawn as a 4 px underline, so OK "did nothing"
   and the screen left by its 30 s timeout. See section 3.

Fix (T2): `updateExclusive` computes each live button's moved-sample coverage on
a new camera frame and lets only the button with the largest coverage count the
frame as active (ties go to list order); the others see an inactive frame (they
drain, they do not trigger). `MotionButton.update(now, allow)` and
`coverageScore()` are new; single buttons behave as before.

SAVE keeps its 1 s dwell (motion-ui-ergonomics R3.1). Not changed.

## 3. Name entry flow

`nameEntry.ts`:
- `pickStep` edits the letter at `cursor` of the current text in place (a
  non-letter becomes `A` ± 1); it no longer replaces the default by `A`.
- `confirm` = accept: sets `done`.
- `tickNameEntry` advances the cursor `CURSOR_ADVANCE_MS` after the last step
  (new field `lastStepAt`, `stepped`), up to `PICK_LEN` − 1, then applies the
  existing timeouts.

`nameScreen.ts`: highlight box behind the letter at `cursor`, drawn from the
start. Hint text per R3.4. Layout unchanged: ◄ row A and OK row B in the stacked
column, ► alone in the other column. A NEXT LETTER button would need a slot
below 40 % of the height (the column's second row is at 45 %), so it is not
added; the automatic cursor advance replaces it.

## 4. Exorcist card

- The yellow disc at the card's top-right corner is `card/draw.ts`: the moon
  (`arc(w·0.92, h·0.06, w·0.03)`). No motion button or ring exists there; the
  new zone-equals-rect test lists every circle the preview draws and compares
  them to `previewLayout`.
- `previewCardRect` left the card 6 px from the circle edge but the progress ring
  is drawn at `r + RING_OUTSET` (9 px), so the ring of NO PHOTO / CLOSE (and
  SAVE) overlapped the card edge by 3 px and sat inside its glow
  (`shadowBlur 24`). Reproduced at all sizes. Fix: the gap is
  `RING_OUTSET + CARD_GAP` (`CARD_GAP` 12), and the card keeps its aspect inside
  the narrower span.

## 5. Mirroring (verification)

One test records the transform of `drawWebcamFrame`, `captureFrame`,
`grabMirroredSnapshot` and `grabHalfSnapshot` (all `translate(W, 0); scale(-1, 1)`),
maps a raw point through each, and checks `mirrorX`: the raw left side lands on
the screen's right. No code change unless it fails.

## 6. Video stutter (verification)

`drawWebcamFrame` is called every tick with the canvas size and never reads the
quality level; the adaptive level only changes the motion grid
(`gridForLevel`), the effects (`atmosphereOn`, `thinParticles`) and the
`captureFrame` copy. A loop test at levels 0–3 checks one full-size draw per tick.
