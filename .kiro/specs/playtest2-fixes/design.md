# Playtest 2 Fixes — Design

Every root cause below was found by reading the code. Each has a failing test
that is committed in the same commit as its fix (task named in the heading).

## 1. A ghost costs a heart in empty space (T2)

Observed: a ghost enters at the top right, drifts in the upper right for about
3 s, then vanishes. A heart is lost and the combo resets. Nothing marks why.

Root causes:

1. **The endpoint is arbitrary and unmarked.** `paths.ts walkTarget` picks a
   random play-area point (x 20–80 %, y 25–75 %). `reach.ts splitReached` counts
   "within `CENTER_THRESHOLD` (40 px) of that point" as reached, which costs a
   heart. There is no marker at that point and the ghost looks the same one frame
   before and after.
2. **The band is a share of the canvas, not of the player.** The canvas is the
   whole window (`main.ts resizeCanvases`: width / height = `innerWidth` /
   `innerHeight`) and the video is stretched onto it, so there is no
   `object-fit` crop to explain the position. On a 3024 × 1364 window the 20–80 %
   band is 1814 px wide while a player standing 1.5–2.5 m away fills about the
   middle third. A target at 78 % is nowhere near them. (The 85 % / 15 % reading
   from the video is outside the band `walkTarget` can produce, 80 % / 25 %. It
   is the entry leg of the path seen at the capture's frame spacing; the
   endpoint itself is the unmarked point described above.)
3. **No minimum telegraph.** Nothing says how long an arriving enemy has been
   visibly dangerous. A fast enemy on a short path, a lunger (windup 600 ms), or
   a variant ghost close to its target can cost a heart less than 1 s after any
   cue. `reached()` is pure geometry.
4. **No link between the lost heart and the enemy.** `splitReached` returns a
   count; the enemy just disappears.

Fixes:

- **`enemies/telegraph.ts`**: `TELEGRAPH_MIN_MS = 1000`, `TELEGRAPH_LEAD_MS = 1400`,
  `etaMs(e, W, H)` (remaining travel time: path duration minus `pathMs` for a
  path, `(dist − REACH_PX) / (speed · H)` for a straight mover, approach +
  windup + lunge for a lunger), `tickWarn(e, deltaMs, W, H)` (adds `deltaMs` to
  `e.warnMs` while the centre is on screen and `etaMs ≤ TELEGRAPH_LEAD_MS`;
  never decreases) and `telegraphProgress(e)` (`warnMs / TELEGRAPH_MIN_MS`, 0–1).
  `moveEnemies` calls `tickWarn` for every threat after moving it.
- **`reach.ts`**: `reached()` additionally needs `warnMs ≥ TELEGRAPH_MIN_MS`.
  Because `warnMs` only grows with game time spent on screen and alarmed, the
  guarantee holds whatever the tick length (a 100 ms tick simply adds 100 ms).
  An enemy that arrives early waits at its target in the alarmed pose (a path
  enemy sits at its end point, a straight mover stops at the target). With the
  lead at 1400 ms the normal case never waits: the telegraph runs for 1400 ms
  and the heart is lost at about 1400 ms. `splitReached` also returns `lost`
  (the enemies that arrived).
- **Visual** (`render.ts drawDangerRing`): a dashed ring that shrinks from
  2.4 × to 1.1 × the enemy size over `warnMs`, a red tint of the same ring, and a
  "!" mark above it. The dashed outline and the "!" are shapes, so the cue works
  in the colour-blind palette (uses `palette.danger`) and in greyscale. Reduced
  flash: the ring does not pulse (steady alpha), the "!" does not blink. The
  skull's old cb-only cue (`drawDangerCue`) is replaced by this one for every
  user; the skull's red glow stays.
- **MISSED call-out**: `step.ts` adds a `'miss'` call-out ("MISSED", red) at
  each lost enemy's position (`makeCallout` clamps it into the canvas), once per
  arrival and also inside the heart grace. `calloutPose` / `drawCallout` draw
  `'miss'` in `palette.danger` with an outline; the text itself is the cue.
  The heart loss already shakes the hearts (playtest1-fixes R1.3), so the red
  word at the enemy and the shaking hearts appear on the same tick.
- **Where threats end (the choice).** Line / arc ghosts and pumpkins end in
  `PLAYER_END`: x 38–62 %, y 35–65 % of the area played. Alternatives:
  - *Keep a random play-area point, add the telegraph only.* Fair, but a heart
    can still be lost far from anyone, and the lost heart stays unexplained.
  - *End at the exact centre like the new ghosts and the lunger.* Simplest, but
    every ghost would stack on one point.
  - *End near the player (chosen).* It matches the product rule ("if a ghost
    reaches the center, the player loses a life"), the new ghosts and the lunger,
    the loss happens where the player is, and a small box avoids stacking.
  The reaction window: the old walk was at least 0.85 H long. A walk to the
  middle from a top or bottom edge is shorter (about 0.55 H), so `makePath`
  scales the speed of a short chord by `chord / (0.85 H)`. The duration of the
  walk is therefore never less than that of a 0.85 H walk at the nominal speed
  (stage 1: still about 4 s), and the 1400 ms telegraph is inside it. Waves R1.2
  is amended in that spec. Body motion can now swat a ghost standing in the
  player zone; that is by design (it is the player's own space), and a swat still
  needs `diffThreshold` motion over `hitRatio` of the hitbox on two camera frames.
- **Not changed:** boss lunges keep their boss-phases windup and pose (their
  telegraph is the 350–700 ms windup, tuned there); the bonus round and
  harmless enemies are not threats (`isThreat`).

## 2. A skull homes onto the player's head (T1)

Observed: a skull hovers just above the head at screen centre for about
half a second. Normal idle motion of head and shoulders costs a heart.

Root cause: `skull.ts createSkull` takes `centerTarget` (centre ± 120 px). A
skull costs a heart when hit (`collision.ts`), and the centre of a 1P canvas is
where head and torso are, so ordinary body motion over `hitRatio` of the hitbox
registers a hit. The skull then lingers there for `SKULL_ON_SCREEN_MS` (4 s).

Fix (`game/zones.ts`, one place):

```ts
export const BODY_HALF = 0.18                // body column = centre ± 18 % of the area width
bodyZone(W, H): Rect                         // x 0.32 W … 0.68 W, y 0 … H
```

`createSkull` picks a side (left or right), a target x in the side band between
`halfHit + 4` and `bodyZone.left − halfHit − 4` (hitbox half-width included) and
a target y, and the skull flies along the horizontal line to it. It exits along
`x` away from the centre (the existing exit already uses "away from the centre"),
so it never crosses the column. A 2P seat passes its half, so each half has its
own column. The skull stays a hazard at both sides of the player, at hand height.

## 3. A skull hurts the moment it enters, under the HUD (T1)

Observed: a skull enters from the bottom left, under the "Score" text, where a
lowered hand rests, and costs the last heart in 0.3 s.

Root causes:

1. `spawnUtils.randomEdgeSpawn` picks any of the four edges, including the
   bottom, where the lowered hands and the score sit.
2. A skull is hittable from the first tick: `resolveHits` gates every enemy on
   motion only. At 0.148 H/s a skull needs about 0.4 s just to be fully visible.
3. No rule keeps spawn points or paths clear of the HUD corners.

Fix:

- `hudRects(W, H)` (in `zones.ts`): four corner rects of width
  `max(0.3 W, 9 · fontSize)` and height `3.2 · fontSize` (`hudFontSize`), each
  holding hearts, timer + mute, score, combo.
- Skull entry: left or right edge only (never top, never bottom), at a height
  `y ∈ [max(0.25 H, hudH + halfHit), min(0.65 H, H − hudH − halfHit)]`
  (`H / 2` when the band is empty on a tiny canvas). The line is horizontal, so the
  hitbox never meets a HUD rect or the body column.
- `SKULL_GRACE_MS = 1000`: `warnMs` of a skull counts while its whole hitbox is
  inside the canvas. While `warnMs < SKULL_GRACE_MS` `resolveHits` ignores the
  skull (no hit, no life loss, not removed) and the danger ring of §1 shows with
  the same progress. A skull in the grace therefore costs nothing at any frame
  rate; after the grace it behaves as before.

## 4. Silence after death, silent motion buttons (T3, T4)

Observed: music stops at death and nothing plays again; waving OK, EXORCIST
CARD gives no sound.

Root causes: `loop.ts` calls `stopMusic()` at the `gameover` transition and
`sfx.ts` has no game-over sound. Motion buttons (`motionButton.ts`) return
`'triggered'` and the screens run the action; no code on that path plays a sound.
The title music is only requested on the start screen.

Fix:

- Recipes (`recipes.ts`): `gameOver` (a slow descending minor figure, three
  sine notes with a low saw under them, about 1.6 s), `uiConfirm` (a soft two-note
  sine blip, about 0.15 s), `countTick` (a short wooden tick: one 660 Hz sine
  and a noise click, about 0.08 s) and `countGo` (a brighter two-note rise,
  about 0.3 s). Gains come from `gainFor` (floored to 2 decimals) into
  `SFX_GAIN`, so the RMS target, the −3 dBFS peak ceiling and the stack ceiling
  (`stackPeakCeil`) apply as for every other sound. All pass through
  `play()` → per-sound gain → master gain → compressor → limiter.
- `sfx.ts` / `index.ts`: `sfxGameOver`, `sfxConfirm`, `sfxCountTick`, `sfxCountGo`.
- **Fire once.** `updateExclusive` is the one function that resolves a press on
  every screen (start, summary, game over, victory, name, card preview, 2P end
  screens); it plays `sfxConfirm` once when it returns a winner. `SeatCard`'s
  own button (`updateGated`) plays it when it runs its action. Suppressed
  neighbours never play.
- **Game over once.** The sting plays in the 1P `prevPhase → 'gameover'` hook
  (which runs once per transition, also for the boss timeout) and in the 2P
  `final` hook when both seats are out. The title bed starts when the end screen
  is first shown (`gameOverVisible` / `victoryVisible`), after the sting.
- **Countdown.** `game/countdown.ts`: `createCountdownCues()` returns
  `update(inTitle, stageTitleMs)`. It plays `countTick` when `ceil(ms / 1000)` is
  a new number in 1..3 and `countGo` when the title ends. It keeps the last
  number, so a 100 ms tick, a 16 ms tick or a skipped frame play each number
  once. The loop feeds it in the 1P `stageTitle` branch and from the 2P phase.

## 5. Gain table and stack safety

The new ids join `SFX_IDS`, so the existing normalisation, the pair / triple grid
and the random three-sound property run over them with no new code. The new
recipes keep every peak under `stackPeakCeil()` by the same `gainFor`. A test
adds the new sounds to the three-sound worst case explicitly and one asserts a
stack of `gameOver + uiConfirm + countTick + music` stays under 1.

## 6. Tests

| Item | Test |
|---|---|
| Telegraph ≥ 1000 ms | `telegraph.property.test.ts`: any dt split (8–100 ms ticks), every threat type, no life lost before `warnMs ≥ 1000` |
| Early arrival waits | unit: a ghost on a 600 ms path stalls until the telegraph is complete |
| MISSED call-out | unit: a lost enemy adds one `'miss'` call-out at its position |
| End zone, reaction window | `paths.test.ts`: end in `PLAYER_END`, duration ≥ 0.85 H walk |
| Skull zones | `zones.property.test.ts`: targets, path samples and exit samples never meet the body zone or the HUD rects; never the bottom or top edge |
| Skull grace | unit + property: a skull hit inside the grace costs nothing and stays |
| Sounds | `recipes.test.ts` (gain table, stack), `sfx.fire.test.ts` (confirm once), `loop.audio.test.ts` (sting once, ticks once per number) |
