# Demo Mode — Design

## Idea

Replace only the *source* of motion. The loop's camera branch turns a `<video>`
into `currentData` / `prevData` (two `ImageData`) and a mask; everything after
that point is untouched. In demo mode a `DemoRuntime` supplies the same two
frames, drawn from the position of a scripted hand, and the rest of the tick runs
as always.

```
 normal:  video ──captureFrame──► currentData/prevData ─┐
 demo:    DemoDriver ─hand─► SyntheticCamera ─frames────┤
                                                        ▼
                  computeMotionMask → updateMotionPixels → motion buttons
                                    └► resolveHits → combo / hit-stop / knock / call-outs
```

## Modules (`src/demo/`)

| File | Contents |
|---|---|
| `params.ts` | `DEMO` config (`stepMs`, `stepSlackMs`, `maxGapMs`, `timeScale`, `frameMs`, `defaultSeed`, speed limits, hand radius; the burst / hold timings are constants in `driver.ts`), `parseDemoParams(search)`, `DEMO_TOGGLE_KEY = 'g'`, `demoKeyAction(e)` → `'toggle' \| 'exit' \| 'ignore'`, `routeDemoKey` |
| `rng.ts` | `mulberry32(seed)` (own copy: production code does not import from `src/test`) |
| `camera.ts` | `SyntheticCamera`: two reusable `W×H×4` buffers, a 30 fps frame clock, a hand disc, noise |
| `driver.ts` | `DemoDriver` (pure state machine), `DemoView`, `stepSafe` (skull rule) |
| `overlay.ts` | `drawDemoBackdrop`, `drawGhostHand`, `drawDemoBadge`, `grabDemoPortrait` (canvas, procedural placeholder portrait) |
| `runtime.ts` | `DemoRuntime`: owns camera + driver + trail, the fixed step, the clock / `Math.random` patch, `dispose()` |

### `params.ts`

```ts
export const DEMO = {
  stepMs: 1000 / 60,   // fixed real step per processed tick
  stepSlackMs: 2,      // a frame this much short of a full real step still runs it (jitter at 60 Hz)
  maxGapMs: 100,       // one frame gap counts for at most this much real time; longer gaps clear the bank
  timeScale: 2,        // game / driver / clock advance stepMs * scale per processed tick
  frameMs: 1000 / 30,  // synthetic camera frame interval (demo time)
  defaultSeed: 5,
  handRadiusH: 0.055,  // hand disc radius as a fraction of the canvas height (clamped 36..60 px:
                       // two discs must cover 15 % of the fixed-size 192 px boss hitbox on small canvases)
}
parseDemoParams(search: string): { demo: boolean; seed: number; stage: number; speed: number }
```

`parseDemoParams`: `seed` and `stage` must be plain integers, `speed` a plain decimal
(`^\d{1,3}(\.\d{1,6})?$`); a value outside its range is invalid and takes the default (no clamping).

`demoKeyAction`: `g` / `G` without Ctrl/Meta/Alt → `toggle`; bare modifier keys, `m` / `M`,
`F1`–`F12` and every Ctrl / Meta / Alt chord → `ignore`; anything else → `exit`. `ignore`
maps to `routeDemoKey` → `pass`: no `preventDefault`, so the browser keeps reload, full
screen and dev tools. The normal key handler then acts only on a plain `M` while demo is on. Used only while demo is on (the toggle-on case is
decided by `main.ts`, which also checks that the title screen is showing).

### Synthetic camera (`camera.ts`)

```ts
class SyntheticCamera {
  constructor(initialHand: Pt, handR: number, displayW: number, displayH: number)
  /** Advances the camera clock; returns the frames for this tick. */
  step(deltaMs: number, hand: Pt, handR: number, displayW: number, displayH: number): { cur: ImageData; prev: ImageData; isNew: boolean }
  /** New run: the frame clock restarts, so every loop has the same new / duplicate-tick pattern at any speed. */
  resetPhase(): void
}
```

- Frames are plain `{ data: Uint8ClampedArray, width, height }` objects cast to `ImageData`
  (both consumers read only `.data`), so no canvas is needed.
- Background luminance 40, hand disc luminance 230 (grey: R = G = B, so the BT.601
  weights sum to 256 and the luminance is exact). Moved pixels are `|230 − 40| = 190 > 30`.
- Two buffers `A`, `B`. `prev` is the `cur` of the previous tick, as in the loop
  (`prevCtx.drawImage(currentCanvas)` after every tick). A tick that is not a new
  camera frame returns `cur === prev` (same object, zero diff, `mask.changed === false`).
  A new frame erases the disc previously drawn in the *other* buffer (bounding box
  tracked), draws the disc at the current hand position and adds noise.
- Noise: 12 fixed grid pixels (multiples of 4 = on the mask's sampling grid) toggle by
  ±2 luminance per frame. Below `DIFF_THRESHOLD` (≥ 15), above 0: `changed` is true.
- Display → motion coordinates: `x * MOTION_W / displayW`, `y * MOTION_H / displayH`; the
  disc is an ellipse in motion space so it is round on screen.
- The initial hand is drawn into both buffers, so the first frame has no appearance spike.

### Driver (`driver.ts`)

```ts
interface DemoView {
  phase: GamePhase; stage: number; bonus: boolean
  enemies: readonly Enemy[]
  w: number; h: number
  now: number            // game clock (performance.now, patched in demo)
  cardOpen: boolean; hasPhoto: boolean; noPhoto: boolean
}
class DemoDriver {
  constructor(seed: number, w = 1280, h = 720)   // the hand starts at (0.5 w, 0.7 h)
  reset(): void                        // the title is back after a run: counts the loop, sends the hand home
  // private beginRun(): the first phase after the title restarts driver time and the RNG from `seed`
  update(deltaMs: number, view: DemoView): { x: number; y: number }
  readonly stats: { swipes; misses; presses; blocked; detours; interrupts; whiffs; runs }   // for tests and the harness
}
```

**Movement primitive.** `Move = { path(u) → Pt; durMs; t }` with ease-in-out
`u(t) = smootherstep(t / dur)`. Every hand movement (swipe, glide to a button, retreat,
home) is a `Move`; the wave over a button is a `Circle` primitive (radius 0.55 r, 4 Hz,
constant speed, so every camera frame carries motion). There is no other way for the
hand to change position, so the skull rule has a single choke point.

**Skull rule (R4.5).** `stepSafe(from, to, R, skulls, w, h, tickMs, extraMs?)`: both discs
`(from, R)` and `(to, R)` must be at distance ≥ `R + 2·px + travelPx` from every
skull hitbox, where `px = max(displayW / MOTION_W, displayH / MOTION_H)` (one motion pixel) and `travelPx` is the skull's
travel in one tick (`speed · h · (stepMs·scale + 16) / 1000`). Only skulls that can be hit
count (`playing`, `summary`): a frozen skull behind the game-over screen does not block the
hand. The diff region of a
frame pair lies inside the union of the two discs, so no sampled pixel of the skull's
hitbox can move. `update` runs this on every proposed step; if it fails the position
is held, the current `Move` is dropped and `stats.blocked` increments. Planned swipes
are pre-checked by sampling the path every `u = 1/16` against the same rule inflated by
the skull travel up to that sample's time; failing that the other bend is tried, then the
target is skipped for 400 ms.

**Misses and velocity.** A deliberate miss also needs `timeToThreatMs(e) > MISS_SAFE_MS` (3000 ms), so a miss plus the re-swipe always fits before the enemy could cost a life (R4.4). The enemy velocity estimate used for the aim lead is an exponential average with a fixed time constant (`VELOCITY_TAU_MS` = 24 ms), so the lead does not depend on `speed`. The hand trail in `runtime.ts` grows and fades per processed tick, not per `deltaMs`, so its visible length differs between `speed=1` and `speed=3` (cosmetic, accepted).

**Urgency.** `timeToThreatMs(e)` estimates when an enemy costs a life: scripted paths and
drops from the remaining path time, lungers from approach + 600 ms wind-up + lunge, others from
distance / speed; harmless enemies, flybys, skulls and the boss are `Infinity`. A swipe or glide
at something less urgent is dropped when an attack or a threat due within `URGENT_MS` (1200) is
ready. An approaching lunger within 0.3 h of the centre (and no other threat due within 1.5 s)
makes the hand wait just outside it, so the wind-up is met. When no safe swipe exists from the
hand's position (a skull in the way), the driver tries aims around the target and then a
straight **detour** glide to a staging point from which a safe swipe exists.

**Targeting.** Candidates: `isHittable(e)`, `e.type !== 'skull'`, centre inside the canvas
(inset 8 px), `view.now − e.spawnedAt ≥ 150`, and `reactReady` (see below). Order: attacks
(boss / lunger wind-up, lunge, recover) first, then threats by `timeToThreatMs`, then an idle boss,
then harmless targets by distance to the centre. The driver
keeps `firstSeen[id]` (driver time) and a per-enemy reaction delay drawn from the PRNG
when first seen (180–320 ms). For a boss / lunger in wind-up the delay counts from the
moment the attack was first observed (`bossAttack` leaves `idle` / `movePhase` leaves
`approach`; wind-up, lunge and recover are one attack), with the phase ranges of R4.2. Enemy velocity is estimated from the last two observed positions
(`vel`), and the swipe aims at `pos + vel · (0.55 · dur)`.

**Swipe path.** `p0` = hand, `E` = predicted target, `d` = unit(E − p0). End point
`p2 = E + rot(d, ±(15°…35°)) · (R + 70)` (lateral sign from the PRNG, flipped when the
safety check fails). Quadratic Bézier whose control point is solved so that `B(0.55) = E`;
the hand therefore crosses the enemy at 55 % of the swipe, near peak speed. Duration
`clamp(len / (2.2 · h px/s), 180, 800)` where `len` is the length of the curve (sampled), and
every step is capped at 4.5 h px/s (`MAX_HAND_SPEED_H`). A **miss** replaces `E` by
`E + n · (hitboxHalf + R + 30)` (`n` perpendicular to `d`), with probability 1/8 for
low-urgency targets only.

**Rest.** After a swipe the hand holds still for a cooldown of 80–200 ms (PRNG), then
re-targets. With nothing to hit for 1.5 s it glides to a home point (0.5 w, 0.6 h). In
boss phases 2 and 3, while the boss is shielded, the hand pre-positions at
`(boss.x, boss.y + 0.2 h)` so a wind-up can be met in time.

**Button script.** `screenKey = phase | cardOpen | stage | bonus`; a change restarts
`sinceEntry`. A `Press` goes `wait → glide → circle → retreat → rest → glide …`:
`wait` until `sinceEntry ≥ lockMs + 300` (lockMs = `ENTRY_LOCK_MS`, or
`PREVIEW_INPUT_DELAY_MS` for the preview, from the existing exports); `circle` lasts
`burstMs` (2400, MAIN MENU 3200); `retreat` moves 3.2 radii away and rests 600 ms (`RETREAT_REST_MS`) so the
release latch clears. After `OFFER_BURSTS_MAX` (3) bursts at `offer` without the preview
opening, the victory target becomes `menu` (fallback so the loop never stalls). The target button comes from `buttonLayout(screen, w, h, opts)`
(`start` → `one`; `summary` → `next`; `victory` → `offer` then, with the preview shown,
hold, `close`, then `menu`; `gameover` → `retry`). The driver never picks `save`. When the
phase returns to `start` after a run it calls `reset()`; the next run's first phase calls `beginRun()`, which
re-seeds the driver. A change of `view.w` / `view.h` between ticks drops the current move and
rescales the hand, because a `Move` closure holds pixel positions.

### Runtime (`runtime.ts`)

```ts
class DemoRuntime {
  constructor(opts: { seed; stage; speed; w; h })
  beginTick(timestamp: number): { deltaMs: number } | null   // null → skip this rAF frame
  frame(view: DemoView): { cur; prev; changed? }               // driver update + camera step
  trail: Pt[]; hand: Pt
  onRunStart(): void                  // re-seed Math.random and restart the camera clock (the driver re-seeds itself)
  dispose(): void                     // restores performance.now, Math.random
}
```

- `beginTick`: adds the real gap since the previous rAF timestamp (first frame: one
  `stepMs`; capped at `maxGapMs`, negative → 0) to an accumulator. Below
  `stepMs − stepSlackMs` it returns null (skip). Otherwise it runs one step:
  the accumulator keeps the remainder, clamped to `[−stepSlackMs, stepMs]` (a stall
  longer than `maxGapMs` resets it to 0), `deltaMs = stepMs · speed`, and the demo clock
  advances by `deltaMs`. `deltaMs` never depends on the timestamps, so the run stays a
  pure function of `(seed, speed, canvas size)`; only its real-time pace follows the clock.
- The clock starts at `CLOCK_START_MS = 2^40` for every runtime. All clock values then share
  one binade and one ulp, so `clock + step` rounds the same way in every run and differences
  are bit-identical; and it is far above any real `performance.now()`. `lockEndButtons(clock)`
  runs on construction and `lockEndButtons(realNow)` on `dispose()`, so the end-screen lock
  and the card offer button never hold a timestamp from the other clock.
- `DemoDriver` restarts its own time at 0 when a run begins (after the title screen), for the
  same reason. The attract loop therefore replays the identical run.
- `sfx.ts` noise uses a private xorshift generator: sound effects run in the browser and are
  mocked in tests, so they must not consume the seeded `Math.random` stream.
- On construction it installs `performance.now = () => clock` and
  `Math.random = mulberry32(seed)`; `dispose()` puts both back. `startLoop` remembers the
  runtime and `stopLoop()` disposes it, whoever calls `stopLoop`; an exception in a demo
  tick calls `stopLoop()` before rethrowing, so the patches never outlive the loop.
  `performance.now()` is what the enemy factories stamp `spawnedAt` with and what the loop
  passes as `now` to the motion buttons and hit resolution, so the whole run lives on one
  deterministic clock.

### Loop integration (`loop.ts`)

`startLoop(video, webcamCtx, gameCtx, initialStage = 1, opts?: { demo?: DemoRuntime })`.

- `video` may be `null` when `opts.demo` is set; no calibration, no `captureFrame`,
  no `drawWebcamFrame`. The motion canvases stay blank in demo mode, so the eight
  `prevCtx.drawImage(currentCanvas, 0, 0)` calls stay as they are (a harmless copy).
- `tick` becomes a thin wrapper around the old body (`tickBody`):

  ```ts
  function tick(ts) {
    if (!demo) return tickBody(ts)
    const step = demo.beginTick(ts)
    if (!step) { rafId = requestAnimationFrame(tick); return }
    tickBody(ts, step.deltaMs)
    drawGhostHand(gameCtx, demo.hand, demo.trail, ...)
    drawDemoBadge(gameCtx)          // last: above the game, the card preview and the hand
  }
  ```
  `tickBody` takes an optional `forcedDeltaMs`; with it unset (normal mode) the delta
  is computed exactly as before.
- In `tickBody` the camera section is `if (demo) { backdrop; ({cur, prev} = demo.frame(view)) } else { …existing… }`.
  `view` is built from the state at the top of the tick (same state the buttons see).
- `begin(mode)` in demo mode sets `state.stage = demo.startStage` after `startGame`
  and calls `demo.onRunStart()`. The victory PLAY AGAIN callback goes through `begin(1)` in demo too, so a stray press starts the same seeded run. The 2 PLAYERS button is never pressed by the driver, and
  a key that would start 2P (`2`) leaves demo first (R1.3).
- The card session in demo: `grab` is `grabDemoPortrait`, which draws the portrait into an off-screen canvas,
  `download` is `async () => true` (no file), and `extra: () => ({ badge: 'DEMO' })`.
- `state.ts`: `setHighScorePersistence(on: boolean)`; when off, `saveHighScore` is a
  no-op and `loadHighScore` returns 0. The demo sets it off on start and `dispose()` on again.

### `main.ts`

`boot()` reads `parseDemoParams(location.search)`. Key routing is the pure
`routeDemoKey(e, { demoOn, onTitle, msSinceLeft })` → `leave | enter | swallow | pass`
(`params.ts`); while demo is on, auto-repeats of any non-passive key are swallowed (one physical press is one toggle, so a held `G` enters demo and stays), and auto-repeats of the key that left demo are swallowed for 500 ms. The
onboarding state is created on the first normal boot only, so demo mode never reads the
onboarding flag. Demo: load the title font first (for up to 1.5 s no clock or `Math.random`
patch exists and no loop runs), skip
`initWebcam` / onboarding, then create `DemoRuntime`, `startLoop(null, …, stage, { demo })`.
A `keydown` handler (a bubble listener on `document`, registered before the existing one) and a capture-phase `pointerdown` listener on `window` apply
`demoKeyAction` while demo is on: `exit` → `leaveDemo()` (stop loop, `dispose()`, `stopMusic()`,
`history.replaceState` removes the demo parameters so a reload is the normal game, then
`boot()`; a module flag `demoLeft` makes every later `boot()` ignore the URL's demo
parameters, so a failing `replaceState` cannot send it back into demo); the key event
is consumed so the key that left demo does not also start a game. `G` on the title screen
(`isStartScreenVisible()` exported by the loop) in a normal game stops the loop, releases the
camera (`stopWebcam`) and starts demo. The sound hint is kept hidden while demo is on.

## Why a fixed step and a patched clock

Real `deltaMs` would make a run depend on the machine's frame timing, and re-takes would
differ (spawn timers consume `Math.random` in a different order). A fixed step makes the
loop a pure function of `(seed, speed)`. Patching `performance.now` rather than threading a
clock through eight enemy factories keeps normal-mode code untouched; the patch exists only
between `new DemoRuntime` and `dispose()`.

## Tests

| File | Covers |
|---|---|
| `demo/params.test.ts` | `?demo=1` / `0` / junk, `seed`, `stage`, `speed` range and form (out of range / hex / exponent → default); key table (`g`, modifiers, `m`, `F1`–`F12`, Ctrl / Meta chords, others) |
| `demo/runtime.test.ts` | fixed step, 60 steps per real second at 60–240 Hz, jitter tolerance, stall cap, clock / `Math.random` patch and restore |
| `demo/camera.test.ts` | frame size and layout, duplicate ticks (`cur === prev`, `changed` false), new frames (`changed` true), mask points on the 4-px grid around the hand, resting hand → no points, noise below threshold, determinism |
| `demo/driver.test.ts` | determinism per seed, different seeds differ, reaction delay, curved swipe passes through the target, deliberate misses occur and then hit, button script (wait for lock, circle, retreat, never `save`), skull rule, run script transitions |
| `demo/driver.property.test.ts` | any enemy layout: the hand never moves within the skull margin; positions stay on screen; same inputs → same outputs |
| `demo/overlay.test.ts` | badge text and position, ghost hand draws, portrait draws (recording context) |
| `demo/state.persist.test.ts` | demo scores never reach `localStorage`; restored after dispose |
| `demo/demo.sim.test.ts` | headless full run through the real `startLoop` (fake clock, recording context, no canvas, mocked audio): victory and card preview within a bound, no skull hit, combo x4, DEMO badge every tick of every phase, no `getUserMedia` / `fetch` / XHR / `sendBeacon`, nothing stored, same result twice, loops to the title |
| `demo/main.demo.test.ts` | `main.ts` against a stub DOM: `?demo=1` never calls `initWebcam` / `getUserMedia` / onboarding / network and draws DEMO; `M` stays in demo; `F5` / `F11` / `F12` / Ctrl+R / Cmd+R stay in demo without `preventDefault`; leaving stops the music and works when `replaceState` throws; any other key or a click leaves (key used up, click does not reach the mute button, clock and `Math.random` restored, URL cleaned, camera requested); `?demo=0` normal; `G` on the normal title releases the camera and starts demo |
| `demo/normal.test.ts` | normal `startLoop` with a video: camera path used, no demo badge, no clock / `Math.random` patch, `saveHighScore` persists; `stopLoop` and a throwing demo tick dispose the runtime |
