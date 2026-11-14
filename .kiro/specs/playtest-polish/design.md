# Playtest Polish — Design

All new logic is pure and unit-tested; the loop, renderer and `main.ts` only wire
it in. Everything time-based takes `deltaMs`.

---

## A. Performance

### `src/game/quality.ts` (pure + one small module state)

```ts
export type QualityLevel = 0 | 1 | 2 | 3
export type QualityMode = 'auto' | 'high' | 'med' | 'low'

export const BUDGET_DOWN_MS = 20      // average above this ...
export const DOWN_AFTER_MS = 2000     // ... for this long steps down
export const BUDGET_UP_MS = 14        // average below this ...
export const UP_AFTER_MS = 6000       // ... for this long steps up
export const SETTLE_MS = 3000         // no change this soon after a change
export const AVG_TAU_MS = 1000        // time constant of the rolling average
export const IGNORE_ABOVE_MS = 250    // pauses are not slow frames
export const FLIP_WINDOW_MS = 30_000  // down soon after up => longer up wait

export interface FrameBudgetState { level; avgMs; overMs; underMs; settleMs; sinceUpMs; upPenalty }
export function createFrameBudget(level = 0): FrameBudgetState
export function stepFrameBudget(s, deltaMs): FrameBudgetState   // pure reducer
export function parseQualityMode(search: string): QualityMode
export function levelForMode(mode): QualityLevel | null          // null = auto
```

`stepFrameBudget`: `avg += (delta − avg)·(1 − e^(−delta/τ))`; `overMs += delta`
while `avg > 20` else reset to 0 (same for `underMs` with `avg < 14`). All counters
are in ms, so 60 and 30 fps loops decide identically. After a change: `settleMs =
3000`, `avg` re-seeded to 17 ms (the middle of the band), counters 0. A step up
sets `sinceUpMs = 0`; a step down while `sinceUpMs < 30 s` doubles `upPenalty`
(1, 2, 4). The up wait is `6000 · upPenalty`.

Module state (`getQuality()`, `setQualityLevel`, `configureQuality(mode)`) holds
the active level for readers that are not in the loop: particle thinning
(`thinParticles`, used by `addParticles`), call-out cap, atmosphere flag. Default
level 0 returns the input unchanged. `configureQuality('auto'|…)` and the loop's
`applyQuality(level)` are the only writers; demo mode never calls them.

| Level | Particles kept | Call-outs max | Diff grid | Fog / candle flicker |
|---|---|---|---|---|
| 0 | all | 3 | 320 × 180 | on |
| 1 | every 2nd | 1 | 320 × 180 | on |
| 2 | every 2nd | 1 | 160 × 90 | on |
| 3 | every 2nd | 1 | 96 × 54 | off |

### `src/webcam/grid.ts`

```ts
export interface MotionGrid { w: number; h: number; stride: number }
export const GRID_LADDER: readonly MotionGrid[]  // 320×180/4, 160×90/2, 128×72/2, 96×54/2
export function getMotionGrid(): MotionGrid
export function setMotionGrid(g: MotionGrid): boolean   // true when it changed
export function gridForLevel(level: QualityLevel): MotionGrid
```

Kept apart from `diff.ts` because several tests mock `webcam/diff`. `diff.ts`
(`scaleHitbox`, `computeFrameDiff`, `computeMotionMask` default stride),
`swipe.ts`, `halves.ts` and `collision.ts` read the grid at call time through
default parameters. `MOTION_W` / `MOTION_H` stay the *full* size (320 × 180) used
by demo mode, fixtures and the existing tests.

Normalised mapping: `scaleHitbox` already computes `sx = gridW / displayW`,
`sy = gridH / displayH`; with the grid read at call time the same display box maps
to the same fraction at every size. Stride 4 on 320 columns and stride 2 on 160
give the same 80 × 45 sample lattice, so a hitbox gets the same number of samples;
128 × 72 and 96 × 54 give 64 × 36 and 48 × 27 (cheaper, coarser). `motionCell`
= `stride · displayW / gridW`; the motion button's needed coverage
(`MIN_COVERAGE · π r² / cellArea`) therefore follows automatically, and the
dwell, which is time based, is untouched.

### Change protocol (loop)

```
each tick (non-demo):
  quality.step(rawDeltaMs)              // auto mode only
  if gridForLevel(level) != getMotionGrid():
      setMotionGrid(...)
      resize currentCanvas + prevCanvas; captureFrame(prevCtx, video)
      resetHitGates(state / both seats) (game/hitGate.ts); publish an empty mask
      frameIsNew = false for this tick  // duplicate-frame path: no gate update
  getImageData at the grid size ...
```

`DIFF_THRESHOLD` is left as calibrated (R2.4).

### Debug overlay

`render.ts` draws one more line next to `DEBUG [D]`:
`Q2 auto  17.4 ms  160×90`, from `getQualityInfo()`.

### Measurement

- `quality.sim.test.ts`: slow (28 ms) then fast (9 ms) frame streams in 8, 16 and
  33 ms steps; asserts the level reaches 3, later 0, and counts level changes.
- `webcam/grid.bench.test.ts`: per resolution, the time of
  `computeMotionMask` + 6 `computeFrameDiff` on synthetic frames (median of
  repeated runs), the sample counts and the bytes of ImageData read per frame.
  It prints a table and asserts only the deterministic parts (sample count and
  bytes shrink with the grid). The browser-side `getImageData` / `drawImage`
  cost is not measurable in Node; the byte counts are the proxy.

---

## B. Audio

### Graph

```
sfx voices ─► per-SFX gain ─┐
                            ├─► master gain ─► bus compressor ─► limiter ─► destination
music voices ► music bus ───┘     (mute / volume)
```

`src/audio/bus.ts`: `BUS_COMP` and `LIMITER` constants, `buildMasterBus(ctx)`
returns `{ input: master gain, comp, limiter }` and wires the chain; if
`createDynamicsCompressor` is missing, `master → destination`. `context.ts` calls
it once; `getMasterGain()` keeps its meaning (the master gain), so every existing
caller (`sfx.ts`, `music.ts`) already feeds the bus.

### SFX as data: `src/audio/recipes.ts`

```ts
type Voice =
  | { kind: 'tone'; type: 'sine'|'sawtooth'; hz; toHz?; glideSec?; peak; a; s; r; at? }
  | { kind: 'noise'; hz; peak; dur; at? }
export const SFX_RECIPES: Record<SfxId, Voice[]>   // numbers copied from the old sfx.ts
export const SFX_GAIN: Record<SfxId, number>        // normalisation table
export const MUSIC_GAIN: number
export function renderRecipe(id, sampleRate): Float32Array  // pure offline render
```

`sfx.ts` plays a recipe by creating a per-sound gain node (`SFX_GAIN[id]`) into
the master gain, then the same envelope / oscillator / noise nodes as before.
`renderRecipe` uses the same envelope maths (linear attack, hold, exponential
release to 0.001), an oscillator and a deterministic noise generator, and an RBJ
band-pass for noise. Combo sounds are rendered for combo 2, 3 and 4.

Normalisation rule (`gainFor`): `min(10^(−22/20) / rms, 10^(−3/20) / peak)`,
`rms` over the active span (samples ≥ 1 % of peak). The table in the source was
produced with this function and rounded to 2 decimals; a test recomputes it and
checks every entry is within 1.5 dB of the rule, and that the post-gain peak is
≤ −3 dBFS and RMS ≈ −22 dBFS (or peak-limited).

Music is a graph of scheduled voices, not a buffer, so its level is an analytic
estimate: per voice, `rms² ≈ peak² · duty / 2` (sine-equivalent), summed
incoherently over the layers active at the highest tier, and the worst-case peak
as the plain sum of voice peaks. `MUSIC_GAIN` is chosen so the estimated RMS is
6 dB under the SFX target and the worst-case peak plus the stacked SFX stays
below 0 dBFS. `music.ts` creates a gain node (`MUSIC_GAIN`) in front of the
master gain and gives it to the engine as `destination`.

Worst case mix test: `bossHit + combo(4) + ghostHit` rendered, summed sample by
sample at start offsets 0 … 100 ms (step 5 ms) plus the music worst-case peak
as a constant offset: `max |x| < 1`.

---

## C. Accessibility

### Settings: `src/settings/`

```ts
interface Settings { cb: boolean; textScale: 1 | 1.25 | 1.5; reducedFlash: boolean }
const KEY = 'exorcise-settings'
parseSettingsParams(search): Partial<Settings>
loadSettings(storage): Partial<Settings>   // validates every field
saveSettings(storage, s)                   // writes only the three fields
resolveSettings({ storage, search, prefersReducedMotion }): Settings
```

Precedence: URL > stored > default (`reducedFlash` default = prefers-reduced-motion).
`runtime.ts` keeps the live settings (`getSettings()`, `updateSettings(patch)` which
saves and notifies), so renderers read them without parameters. Demo mode reads the
same settings; they change only drawing, never simulation (the renderer still
draws its random numbers).

### Panel: `src/ui/settingsPanel.ts`

State `{ open, focus }`. Pure helpers: `gearRect(W, H)`, `panelRows(settings)`,
`panelRect(W, H, scale)`, `rowRects`, `panelKeyAction(key)`, `panelPointer(x, y)`.
Drawing is canvas 2D over the title screen. `loop.ts` start branch: while open, it
draws the panel instead of the start buttons (they get no `update`), and ignores
the start request. `main.ts`: `O` (title screen only) opens; the pointer handler
sends clicks to the panel when open or on the gear. The gear sits bottom-left
(`0.03 W`, `0.93 H`); a test checks it overlaps none of the start motion buttons,
the mute button, the sound-hint pill or the text bands. No motion button (R7.3).

### Palette: `src/ui/palette.ts`, `src/ui/cvd.ts`

`cvd.ts`: `srgbToLinear`, `rgbToLab`, `deltaE76`, `deltaE2000`, `simulateCvd(rgb,
kind)` with the Machado 2009 severity-1.0 matrices applied in linear RGB.
`palette.ts`: `Palette` with `{ ghost, bat, skull, skullEye, lunger, pumpkin, boss, candy[],
life, score, combo, danger, p1, p2, ringIdle, ringFill, background }`, a `DEFAULT`
(the steering palette, unchanged) and `OKABE_ITO` variant (orange `#E69F00`, sky
blue `#56B4E9`, bluish green `#009E73`, yellow `#F0E442`, blue `#0072B2`,
vermillion `#D55E00`, reddish purple `#CC79A7`, plus white and black).
`getPalette()` follows the `cb` setting. Redundancy is drawn by the renderers:
skull "!" marker + dashed ring, `●` / `■` before P1 / P2 labels, hollow hearts,
dashed button rings when `cb` is on.

Pairs tested (ΔE2000 ≥ 12 under none, protan, deutan, tritan): ghost/skull,
ghost/bat, ghost/pumpkin, bat/skull, skull/pumpkin, skull/lunger, P1/P2,
life/combo, life/score, combo/score, ringIdle/ringFill. Skull vs. dark background
≥ 20. The original palette is allowed to fail these tests (documented in the test
with a "not required" note), which is the reason for the alternative.

### Bigger text: `src/ui/textScale.ts`

`scaled(px)` = `px · getSettings().textScale`; `hudLayout(W, H, scale, texts)`
returns the HUD boxes (hearts, timer, stage label, score, combo, mute) from the
pure `hudFontSize`, an estimated glyph width (0.6 em, like `fitFontPx`) and a
shrinking rule for the stage label so it never reaches the hearts / timer.
`hud.ts` uses it. `screens.ts` `fit()` multiplies its base size and still fits
the band; raw-size lines go through `fit()` with the full-width band. Minimum
sizes: HUD 16, menu 12 (`MIN_TEXT_PX`), call-out 24.

### Reduced flashing: `src/game/flash.ts`

```ts
const MAX_FLASHES_PER_S = 3
const REDUCED_ALPHA = 0.15, NORMAL_ALPHA = 0.4
const RAMP_MS = 120
interface FlashScheduler { events: {at, until, alpha}[] }
requestFlash(sch, now, durMs, alpha, reduced): FlashScheduler   // drops the 4th in 1 s
flashAlphaAt(sch, now): number                                   // ramped waveform
shakeScale(reduced) = reduced ? 0.25 : 1
```

`render.ts` keeps its `state.flashEndTime` input. It derives a flash *request* per
distinct `flashEndTime`, feeds it to a module scheduler and draws
`flashAlphaAt`. With reduced off the scheduler is bypassed and the code path is
the old constant `0.4`. Shake amplitude multiplies `SHAKE_AMPLITUDE_PX` by
`shakeScale`; `Math.random` is still called twice. The white silhouette
(`hitFlashFrames`) is skipped when reduced.

The property test `flash.property.test.ts` generates request streams (times,
durations, alphas), builds the waveform at 1 ms and counts rising edges
(alpha crossing 50 % of the cap upward); asserts ≤ 3 in every 1000 ms window and
alpha ≤ 0.15.

---

## Compatibility with tests that mock modules

`webcam/diff` is mocked in `collision.test`, `motionButton*.test`, `loop.latch.test`;
those mocks do not export new names, so new runtime state lives in new modules
(`webcam/grid.ts`, `game/quality.ts`, `settings/runtime.ts`) and the callers import
from those directly.

---

## Measured (R4.2)

`npx vitest run src/webcam/grid.bench --disableConsoleIntercept` on the development
machine (Node, one run; timings vary by machine, the sample and byte columns do
not). Analysis = motion mask + 6 hitbox diffs on a 1280 × 720 display:

| Grid | Stride | Mask samples | ImageData read per frame (cur + prev) | JS analysis |
|---|---|---|---|---|
| 320 × 180 | 4 | 3600 | 450 KB | 25.4 µs |
| 160 × 90 | 2 | 3600 | 113 KB | 25.2 µs |
| 128 × 72 | 2 | 2304 | 72 KB | 16.9 µs |
| 96 × 54 | 2 | 1296 | 41 KB | 8.6 µs |

The JS analysis is small at every size. The saving is mainly in what the browser
does before it: `drawImage` down-scaling into a smaller canvas and two
`getImageData` copies per frame, 11× fewer bytes at 96 × 54. That cost is not
measurable in Node, so the byte column is its proxy; the real effect has to be
checked with a throttled browser (T11).
