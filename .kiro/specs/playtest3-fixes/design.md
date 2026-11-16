# Playtest 3 Fixes — Design

Every root cause below was found by reading the code. Each has a failing test
that is committed in the same commit as its fix (task named in the heading).

## 1. Bright flash when the name screen closes (T1)

Observed (5:44.65–5:45.0): after OK saves the name the YOU WIN screen returns
with no dark backdrop. Mean luma jumps from 27 to 96 in one frame, the backdrop
fades back in over about 0.35 s and the banner wobbles in again.

Root causes:

1. **One reset does two jobs.** `loop.ts runNameScreen(now, onDone)` calls
   `onDone` when the name is saved. For victory `onDone` is
   `resetVictoryScreen`, the same function the entry hook calls. It sets
   `victoryShownAt = null` and clears the buttons. `renderVictory` takes its
   next `now` as the new start, so `t = 0`: the backdrop
   (`0.88 * t / VICTORY_FADE_MS`) and the banner (`k = t / 700`) restart.
2. **The intro clock and the input lock-out are the same variable.** In
   `screens.ts` `victoryShownAt` drives the fade, the banner and
   `live = t >= VICTORY_INPUT_DELAY_MS`. Resetting the lock-out therefore resets
   the animation.
3. **2P has the same shape.** `splitscreen.ts` uses one `EntryLock`
   (`finalLock`) for `el` (backdrop `0.88 * el / FINAL_FADE_MS`, banner `k`) and
   for the input lock. `loop.ts` calls `resetFinalScreen()` when both name
   screens finish, which restarts the fade and the banner.
4. **Why GAME OVER did not flash.** `renderGameOver` fills a constant
   `rgba(13,0,20,0.88)` and has no banner animation. `resetGameOverScreen`
   (lock + button fill only) is a safe button reset. The card-preview close
   path calls no reset, and `now` keeps running, so it does not restart the
   intro in 1P; in 2P the cards use their own buttons and do not touch
   `finalLock`.

Fix: split the intro clock from the input lock-out.

- `screens.ts`: `victoryLock = new EntryLock()` for the buttons. `victoryShownAt`
  stays the intro clock. `resetVictoryScreen()` (arrival) resets both;
  new `resetVictoryButtons()` (name screen closed) resets only the lock and
  clears the buttons. `live = victoryLock.touch(now)`.
- `splitscreen.ts`: `finalIntro = new EntryLock()` for `el`; `finalLock` stays
  the input lock. `resetFinalScreen()` (arrival) resets both; new
  `resetFinalButtons()` resets the lock and the button sets only.
- `loop.ts`: the name-screen `onDone` callbacks use the button-only resets
  (`resetVictoryButtons`, `resetGameOverScreen`, `resetFinalButtons`).

Tests (T1): a victory render at t = 5 s, then a gap with a name-screen
round trip (`resetVictoryButtons`), has the first frame at alpha 0.88 and the
banner at scale 1; the same for 2P final; a property test renders each end
screen at random frame steps (4–200 ms) with random round trips and asserts the
backdrop alpha never drops, for 1P victory, 1P game over and 2P final. The
buttons still ignore motion for `ENTRY_LOCK_MS` after the round trip.

## 2. A skull hidden in a bat swarm (T2)

Observed (3:48.9–3:49.4, stage 4): a skull entered from the left at about 31 %
height. A swarm then flew through its hover spot. The player swept through the
bats and his hand crossed the skull, which cost a heart 0.3 s after the grace
ended.

Root causes:

1. **Skull and lanes are placed independently.** `skull.ts skullPlacement`
   picks a row in 0.25–0.65 H and `paths.ts makeSwarm` / `makePath('flyby')`
   picks lanes in 0.15–0.8 H. Nothing relates them, so the skull's row lies
   inside the lane band by design.
2. **The only clearance is for new ghosts.** `spawn.ts` checks skull vs
   `blink / wisp / mirror` start points (`skullClearancePx`, 2.5 hitboxes) and
   `variantSpawn.pickSpawn` the other way. Path enemies (ghost, bat, pumpkin,
   candy) and their sway are not considered, in either direction.
3. **A swarm is exactly the case.** Five lanes spread ±0.12 H around the lead,
   plus ±0.06 H of sway, cover about a third of the screen height. Swatting a
   bat in the swarm puts the hand within a hand radius of the skull.

Fix (a combination, justified below):

- **`src/game/skullLane.ts`** (pure). `skullClearancePx(H)` = hand radius
  (`DEMO.handRadiusH`, clamped to 36–60 px) + skull hitbox width (67 px),
  capped at `0.2 H` on very small areas. `skullZone(skull-like, W, H)` is the
  corridor from the entry edge to the hover point, with the hover rect, grown
  by the clearance: `y` band of ±(half hitbox + clearance), `x` from the entry
  side to the hover x plus the clearance. `pathHitsZone(spec, W, H, zones, fromMs)` samples
  `pathPosition` (closed form, so sway is included and the result does not
  depend on the frame rate) over the rest of the path at ≤ 30 ms steps.
- **New enemies keep out.** `spawnWave` takes `avoid` zones. It tries up to
  8 attempts (the last 4 drop a fixed scripted `height`), removes members whose
  path hits a zone, keeps the attempt with the most clear members and returns
  `[]` when none. `tickSpawners` passes the zones of every skull in the list
  (leaving skulls too, they still cost a heart). A scripted event that made
  nothing waits (as it already does for a full cap) and is retried on later
  ticks; random spawns are skipped and their timer reset.
- **The skull picks a clear row.** In the skull spawn loop a candidate is
  accepted only if its zone does not meet the remaining path
  (`pathMs` → end) of any path enemy on screen; 12 candidates, then the skull
  waits for the next tick (the existing `skullWaits`). Lanes of enemies already
  on screen can no longer be crossed by a new skull, and new lanes avoid it, so
  the skull's corridor stays clear while it is active (both directions).
- **Why both.** Only moving lanes would let a skull appear in front of a swarm;
  only moving the skull would let the next swarm fly through it. The skull is
  the rarer, longer-lived (4 s) object, so spawns yield to it.
- **Still a hazard.** Grace, hover time, hitbox and hit rules are unchanged. A
  flailing hand can still reach a skull; the player is just no longer pushed
  into it by the harmless targets. Skulls still sit beside the body zone, so
  the clearance excludes lanes only on that side.
- **2P and stage 6.** `tickSpawners` runs per half with the half's `W` × `H`, so
  both seats get the same rule. Stage 6 uses the same spawner. Boss minions and
  the lunger / new ghosts keep their existing rules (out of scope).
- **Demo.** The driver hits only what it chooses to; seed 5 is re-run at the
  tested sizes and speeds.

Tests (T2): unit: a swarm spawned with a skull zone has no sample inside it;
a skull is not placed on the row of a flyby on screen. Property (fast-check):
with an active skull no newly spawned bat, candy, ghost or pumpkin path (all
kinds) passes within the clearance of its zone, at 320×360 … 3024×1364;
a skull never picks a row that an on-screen lane occupies; per 2P half.

## 3. Unconfirmed observations (no code change)

- The name changed `BOO-1B` → `COO-1B` via ► at 5:40. Intent unknown; it may
  be a deliberate edit or a stray press while aiming at OK.
- The name-screen backdrop is very dark, so the player sees little of himself
  while aiming at the arrows and OK.

## 4. Tests

| Item | Test |
|---|---|
| Intro plays once per arrival | `screens.end.test.ts`, `splitscreen.buttons.test.ts` (first frame after a round trip has full alpha, banner at rest) |
| No alpha drop on any frame | `screens.intro.property.test.ts` (1P victory, 1P game over, 2P final, random frame steps) |
| Buttons still locked after a round trip | existing lock-out tests + a new round-trip case |
| Skull zone clear of new lanes | `skullLane.property.test.ts` |
| Skull row clear of on-screen lanes | `skullLane.property.test.ts` through `tickSpawners` |
| Demo seed 5 clean | `demo.sim.test.ts` (unchanged) |
