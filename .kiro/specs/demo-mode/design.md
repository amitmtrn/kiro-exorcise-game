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
| `params.ts` | `DEMO` config (`stepMs`, `minFrameMs`, `timeScale`, `frameMs`, `defaultSeed`, burst / hold timings, hand radius), `parseDemoParams(search)`, `DEMO_TOGGLE_KEY = 'g'`, `demoKeyAction(e)` → `'toggle' \| 'exit' \| 'ignore'` |
| `rng.ts` | `mulberry32(seed)` (own copy: production code does not import from `src/test`) |
| `camera.ts` | `SyntheticCamera`: two reusable `W×H×4` buffers, a 30 fps frame clock, a hand disc, noise |
| `driver.ts` | `DemoDriver` (pure state machine), `DemoView`, `handSafe` (skull rule) |
| `overlay.ts` | `drawDemoBackdrop`, `drawGhostHand`, `drawDemoBadge`, `drawDemoPortrait` (canvas, procedural) |
| `runtime.ts` | `DemoRuntime`: owns camera + driver + trail, the fixed step, the clock / `Math.random` patch, `dispose()` |

### `params.ts`

```ts
export const DEMO = {
  stepMs: 1000 / 60,   // fixed real step per processed tick
  minFrameMs: 12,      // rAF frames sooner than this after the last processed one are skipped
  timeScale: 2,        // game / driver / clock advance stepMs * scale per processed tick
  frameMs: 1000 / 30,  // synthetic camera frame interval (demo time)
  defaultSeed: 7,
  handRadiusH: 0.055,  // hand disc radius as a fraction of the canvas height (clamped 28..60 px)
}
parseDemoParams(search: string): { demo: boolean; seed: number; stage: number; speed: number }
```

`demoKeyAction`: `g` / `G` without Ctrl/Meta/Alt → `toggle`; bare modifier keys and `m` / `M`
→ `ignore`; anything else → `exit`. Used only while demo is on (the toggle-on case is
decided by `main.ts`, which also checks that the title screen is showing).

### Synthetic camera (`camera.ts`)

```ts
class SyntheticCamera {
  constructor(initialHand: Pt, displayW, displayH)
  /** Advances the camera clock; returns the frames for this tick. */
  step(deltaMs: number, hand: Pt, handR: number): { cur: ImageData; prev: ImageData; isNew: boolean }
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
  summaryShownMs: number
  cardOpen: boolean; hasPhoto: boolean; noPhoto: boolean
  lives: number
}
class DemoDriver {
  constructor(seed: number)
  reset(seed?: number): void           // new run: same seed → same run
  update(deltaMs: number, view: DemoView): { x: number; y: number }
  readonly stats: { swipes; misses; presses; blocked }   // for tests and the harness
}
```

**Movement primitive.** `Move = { path(u) → Pt; durMs; t }` with ease-in-out
`u(t) = smootherstep(t / dur)`. Every hand movement (swipe, glide to a button, retreat,
home) is a `Move`; the wave over a button is a `Circle` primitive (radius 0.45 r, 2.5 Hz,
constant speed, so every camera frame carries motion). There is no other way for the
hand to change position, so the skull rule has a single choke point.

**Skull rule (R4.5).** `handSafe(from, to, R, skulls, travelPx)`: both discs
`(from, R)` and `(to, R)` must be at distance ≥ `R + 2·cell + travelPx` from every
skull hitbox, where `cell = 4 · displayW / MOTION_W` and `travelPx` is the skull's
travel in one tick (`speed · h · (stepMs·scale + 16) / 1000`). The diff region of a
frame pair lies inside the union of the two discs, so no sampled pixel of the skull's
hitbox can move. `update` runs this on every proposed step; if it fails the position
is held, the current `Move` is dropped and `stats.blocked` increments. Planned swipes
are pre-checked by sampling the path every `u = 1/16` against the same rule inflated by
the skull travel over the whole swipe; failing that the other bend is tried, then the
target is skipped for 400 ms.

**Targeting.** Candidates: `isHittable(e)`, `e.type !== 'skull'`, centre inside the canvas
(inset 8 px), `view.now − e.spawnedAt ≥ 150`, and `reactReady` (see below). Order: not
harmless first, then distance of the enemy to its target (the centre), then id. The driver
keeps `firstSeen[id]` (driver time) and a per-enemy reaction delay drawn from the PRNG
when first seen (180–320 ms). For a boss / lunger in wind-up the delay counts from the
moment the attack was first observed (`bossAttack`/`movePhase` change), with the phase
ranges of R4.2. Enemy velocity is estimated from the last two observed positions
(`vel`), and the swipe aims at `pos + vel · (0.55 · dur)`.

**Swipe path.** `p0` = hand, `E` = predicted target, `d` = unit(E − p0). End point
`p2 = E + rot(d, ±(15°…35°)) · (R + 70)` (lateral sign from the PRNG, flipped when the
safety check fails). Quadratic Bézier whose control point is solved so that `B(0.55) = E`;
the hand therefore crosses the enemy at 55 % of the swipe, near peak speed. Duration
`clamp(len / (1.6 · h px/s), 220, 520)`. A **miss** replaces `E` by
`E + n · (hitboxHalf + R + 30)` (`n` perpendicular to `d`), with probability 1/8 for
low-urgency targets only.

**Rest.** After a swipe the hand holds still for a cooldown of 120–260 ms (PRNG), then
re-targets. With nothing to hit for 1.5 s it glides to a home point (0.5 w, 0.6 h). In
boss phases 2 and 3, while the boss is shielded, the hand pre-positions at
`(boss.x, boss.y + 0.2 h)` so a wind-up can be met in time.

**Button script.** `screenKey = phase | cardOpen | stage | bonus`; a change restarts
`sinceEntry`. A `Press` goes `wait → glide → circle → retreat → rest → glide …`:
`wait` until `sinceEntry ≥ lockMs + 300` (lockMs = `ENTRY_LOCK_MS`, or
`PREVIEW_INPUT_DELAY_MS` for the preview, from the existing exports); `circle` lasts
`burstMs` (2400, MAIN MENU 3200); `retreat` moves 3 radii away and rests 500 ms so the
release latch clears. The target button comes from `buttonLayout(screen, w, h, opts)`
(`start` → `one`; `summary` → `next`; `victory` → `offer` then, with the preview shown,
hold, `close`, then `menu`; `gameover` → `retry`). The driver never picks `save`. When the
phase returns to `start` after a run it calls `reset(seed)`.

### Runtime (`runtime.ts`)

```ts
class DemoRuntime {
  constructor(opts: { seed; stage; speed; w; h })
  beginTick(timestamp: number): { deltaMs: number } | null   // null → skip this rAF frame
  frame(view: DemoView): { cur; prev; changed? }               // driver update + camera step
  trail: Pt[]; hand: Pt
  onRunStart(): void                  // re-seed Math.random and the driver
  dispose(): void                     // restores performance.now, Math.random
}
```

- `beginTick`: skips the frame when `timestamp − lastProcessed < minFrameMs`; otherwise
  `deltaMs = stepMs · speed`, advances the demo clock by `deltaMs`.
- On construction it installs `performance.now = () => clock` and
  `Math.random = mulberry32(seed)`; `dispose()` puts both back (also on `stopLoop`).
  `performance.now()` is what the enemy factories stamp `spawnedAt` with and what the loop
  passes as `now` to the motion buttons and hit resolution, so the whole run lives on one
  deterministic clock.

### Loop integration (`loop.ts`)

`startLoop(video, webcamCtx, gameCtx, initialStage = 1, opts?: { demo?: DemoRuntime })`.

- `video` may be `null` when `opts.demo` is set; no calibration, no `captureFrame`,
  no `drawWebcamFrame`. `currentCtx` / `prevCtx` are no-op stubs in demo mode so the
  eight `prevCtx.drawImage(currentCanvas, 0, 0)` calls stay as they are.
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
  and calls `demo.onRunStart()`. The 2 PLAYERS button is never pressed by the driver, and
  a key that would start 2P (`2`) leaves demo first (R1.3).
- The card session in demo: `grab` draws `drawDemoPortrait` into an off-screen canvas,
  `download` is `async () => true` (no file), and `extra: () => ({ badge: 'DEMO' })`.
- `state.ts`: `setHighScorePersistence(on: boolean)`; when off, `saveHighScore` is a
  no-op and `loadHighScore` returns 0. The demo sets it off on start and `dispose()` on again.

### `main.ts`

`boot()` reads `parseDemoParams(location.search)`. Demo: load the title font, skip
`initWebcam` / onboarding, create `DemoRuntime`, `startLoop(null, …, stage, { demo })`.
A `keydown` / `pointerdown` handler (capture phase, before the existing ones) applies
`demoKeyAction` while demo is on: `exit` → `leaveDemo()` (stop loop, `dispose()`, `boot()` normal,
`history.replaceState` removes the demo parameters so a reload is the normal game); the key event
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
| `demo/params.test.ts` | `?demo=1` / `0` / junk, `seed`, `stage`, `speed` clamping; key table (`g`, modifiers, `m`, others) |
| `demo/camera.test.ts` | frame size and layout, duplicate ticks (`cur === prev`, `changed` false), new frames (`changed` true), mask points on the 4-px grid around the hand, resting hand → no points, noise below threshold, determinism |
| `demo/driver.test.ts` | determinism per seed, different seeds differ, reaction delay, curved swipe passes through the target, deliberate misses occur and then hit, button script (wait for lock, circle, retreat, never `save`), skull rule, run script transitions |
| `demo/driver.property.test.ts` | any enemy layout: the hand never moves within the skull margin; positions stay on screen; same inputs → same outputs |
| `demo/overlay.test.ts` | badge text and position, ghost hand draws, portrait draws (recording context) |
| `demo/state.persist.test.ts` | demo scores never reach `localStorage`; restored after dispose |
| `demo/demo.sim.test.ts` | headless full run through the real `startLoop` (fake clock, recording context, no canvas, mocked audio): victory and card preview within a bound, no skull hit, combo x4, DEMO badge every tick of every phase, no `getUserMedia` / `fetch` / XHR / `sendBeacon`, nothing stored, same result twice, loops to the title |
| `demo/normal.test.ts` | normal `startLoop` with a video: camera path used, no demo badge, no clock / `Math.random` patch, `saveHighScore` persists |
