# Juice — Design

## Overview

```
camera frame ─► resolveHits ──► per-enemy motion centroid (Enemy.motionX/Y)
                    │              └─ on confirm: estimateSwipe(prev, cur, enemy)
                    ├─► knocks[]     (flying copy of the banished enemy)
                    ├─► hitStopMs    (freeze budget)
                    └─► callouts[]   (NICE! / x3 COMBO!)
loop.ts: splitHitStop(hitStopMs, deltaMs) → simMs drives every game-time tick
render.ts: knocks, call-outs      screens.ts: intro / outro poses
```

New pure modules under `src/game/`: `swipe.ts`, `knock.ts`, `hitstop.ts`,
`callouts.ts`, `transitions.ts`. Each has a `*.test.ts` and, where an
invariant exists, a `*.property.test.ts`.

## swipe.ts

```ts
export interface Pt { x: number; y: number }
export interface Swipe { dx: number; dy: number; mag: number; source: 'shift' | 'radial' | 'default' }

export const SWIPE_MIN_SHIFT = 0.01          // × canvas height

export function motionPointsIn(cur: ImageData, prev: ImageData, hitbox: Hitbox, canvasWidth: number): Pt[]
export function centroid(points: Pt[]): Pt | null
export function mirrorPoints(points: Pt[], width: number): Pt[]
export function estimateSwipe(prev: Pt | null, cur: Pt | null, enemy: Pt, canvasH: number): Swipe
```

* `motionPointsIn` repeats the sampling of `computeFrameDiff` (same stride,
  luminance, threshold and off-frame skipping) but returns the moved pixels
  instead of a boolean; it returns `[]` for malformed ImageData. `computeFrameDiff`
  is untouched, so hit detection cannot regress.
* The diff of two consecutive frames is centred on the midpoint of the hand's
  motion between them, so the centroid of the next diff is further along the
  swipe: `cur − prev` is the direction of travel. That is the "centroid shift
  between the two frames of the hit gate".
* `estimateSwipe`: shift = cur − prev; `|shift| ≥ SWIPE_MIN_SHIFT × canvasH`
  → `shift`; else if `cur` exists and differs from the enemy centre →
  `radial` (enemy − cur, normalised); else `default` (0, −1). `mag` is the
  shift length in px (0 for fallbacks).
* Mirror correctness: points are in the mirrored motion canvas, i.e. display
  orientation; `mirrorPoints(p, W)` is `x → W − x`. Tests build masks in raw
  camera space, mirror them like `captureFrame`, and check `dx` flips.

`Enemy` gains optional `motionX?: number; motionY?: number` (display-space
centroid of the last gate frame with motion). `resolveHits`:

1. new camera frame, hittable enemy, `computeFrameDiff` true → compute points and
   centroid, convert motion → display (× displayW/MOTION_W, displayH/MOTION_H);
   keep as `motionX/Y` on the updated enemy.
2. diff false → clear `motionX/Y` (a swipe must be contiguous).
3. hit confirmed → `estimateSwipe(prevCentroid, curCentroid, enemy, displayH)`;
   published through `export let lastSwipes: Map<string, Swipe>` (like
   `lastBanished`, reset at the start of every call).

The previous centroid is the one stored on the enemy *before* this frame's update.

## knock.ts

```ts
export interface Knock {
  enemy: Enemy            // snapshot at the moment of the hit
  x0: number; y0: number
  ux: number; uy: number  // unit swipe vector
  speed: number           // px/s initial
  spin: number            // rad/s (sign follows ux)
  ageMs: number; lifeMs: number
}
export const KNOCK_LIFE_MS = 600, KNOCK_SPEED = 2.2 /* heights/s */, KNOCK_DRAG = 4 /* 1/s */
export const KNOCK_MIN_SCALE = 0.4

export function makeKnock(enemy: Enemy, swipe: Swipe, canvasH: number): Knock
export function knockPose(k: Knock): { x: number; y: number; angle: number; scale: number; alpha: number }
export function tickKnocks(ks: Knock[], deltaMs: number): Knock[]
```

* distance(t) = `speed · (1 − e^(−k t)) / k` (t in s); position = origin + u · distance.
* alpha = `1 − (age/life)²`‑style ease would not be monotone-simple; use
  `alpha = 1 − age/life` (linear), `scale = 1 − (1 − MIN) · age/life`, `angle = spin · t`.
* Strength = `clamp(swipe.mag / (0.1 × canvasH), 0.6, 1.5)`; fallbacks use 1.
* `tickKnocks` adds `deltaMs` to age and drops expired knocks; the pose is a
  function of age only, so stepping is irrelevant.

State: `GameState.knocks: Knock[]`. `render.ts` draws them after enemies:
translate to pose, rotate, scale, `globalAlpha`, then the existing `drawEnemy`.

## hitstop.ts

```ts
export const HITSTOP_MS = 60
export function addHitStop(current: number, ms = HITSTOP_MS): number   // max(current, ms)
export function splitHitStop(remainingMs: number, deltaMs: number):
  { frozenMs: number; liveMs: number; remainingMs: number }
```

`frozen = min(remaining, delta)`, `live = delta − frozen`, `remaining' = remaining − frozen`.
`GameState.hitStopMs: number` (0 by default). In `loop.ts` the playing branch
computes the split first, stores `remainingMs`, and uses `liveMs` as `simMs` for
spawners, movement, reach, boss, timer, shake, particles, knocks and call-outs.
`resolveHits` still runs with the real `deltaMs` every tick (motion keeps
registering) and sets `hitStopMs = addHitStop(...)` on a scoring banish. When
`simMs === 0` the simulation block is skipped, which keeps zero-step side effects
out of the spawners. `tickRound` entering `playing` resets `hitStopMs` to 0
(R3.4).

## callouts.ts

```ts
export interface Callout { x: number; y: number; text: string; kind: 'tierUp' | 'praise'; ageMs: number; lifeMs: number }
export const CALLOUT_LIFE_MS = 900, MAX_CALLOUTS = 3, PRAISE_EVERY = 2
export const PRAISE: Record<2 | 3 | 4, string> = { 2: 'NICE!', 3: 'GREAT!', 4: 'PERFECT!' }

export function selectCallout(prevCombo: number, newCombo: number, streak: number): { text: string; kind: Callout['kind'] } | null
export function makeCallout(x, y, sel, W, H): Callout          // clamps into the canvas
export function addCallout(list: Callout[], c: Callout): Callout[]  // cap MAX_CALLOUTS, drop oldest
export function tickCallouts(list: Callout[], deltaMs: number): Callout[]
export function calloutPose(c: Callout): { scale: number; alpha: number; dy: number }
```

Selection: tier-up (`new > prev`) → `x{new} COMBO!`; else if `new ≥ 2 && streak % 2 === 0` →
`PRAISE[min(new, 4)]`; else `null`. Pose: scale = easeOutBack over the first
150 ms then 1; alpha 1 until 60 % of life then linear to 0; `dy = −40 · age/life`.
`GameState.callouts`; drawn in `render.ts` with the HUD font stack
(`ui/hud.ts`), slime green for tier-ups and candlelight yellow for praise.

## transitions.ts

```ts
export function easeOutBack(t: number): number           // 0→0, 1→1, overshoots
export function introPose(elapsedMs: number, totalMs: number):
  { nameX: number; subX: number; alpha: number }          // x offsets in canvas widths (0 = resting)
export function outroPose(summaryMs: number):
  { overlayAlpha: number; bannerScale: number; bannerAngle: number; bannerY: number; rowAlpha(i: number): number }
```

* Intro: name offset `−1 + easeOutBack(t₁)` canvas widths over 0‑450 ms; subtitle
  `+1 − easeOutBack(t₂)` over 150‑600 ms; alpha 1 until `total − 300`, then linear to 0.
* Outro: overlay `0.88 · min(1, ms/500)`; banner scale `easeOutBack(ms/600)` and angle
  `0.12 · e^(−ms/250) · cos(ms/60)` (wobble that settles), `bannerY` rests at 0.18 H;
  row *i* fades in from `600 + 120 i` ms over 250 ms.
* `renderStageTitle` takes the elapsed time from `STAGE_TITLE_DURATION_MS − stageTitleMs`;
  `renderSummary` uses `state.summaryShownMs`. Existing text, positions and motion
  buttons are unchanged at rest.

## Tuning table

| Constant | Value |
|---|---|
| `SWIPE_MIN_SHIFT` | 0.01 × H |
| `KNOCK_LIFE_MS` / `KNOCK_SPEED` / `KNOCK_DRAG` | 600 / 2.2 H/s / 4 s⁻¹ |
| `HITSTOP_MS` | 60 |
| `CALLOUT_LIFE_MS` / `MAX_CALLOUTS` / `PRAISE_EVERY` | 900 / 3 / 2 |
| Intro slide / outro banner / overlay fade | 450 ms / 600 ms / 500 ms |

## Testing

* `swipe.test.ts`, `swipe.property.test.ts`: synthetic masks (moving blob right/left/up/down),
  mirrored masks, ImageData round-trip through `motionPointsIn`, fallbacks, unit length, no NaN.
* `knock.test.ts`, `knock.property.test.ts`: direction, monotone distance/alpha/scale, step independence, expiry.
* `hitstop.test.ts`, `hitstop.property.test.ts`: duration at 30/60/144 Hz and a 100 ms stall, conservation, max-merge.
* `callouts.test.ts`: selection per tier, tier-up vs praise, clamping, cap, expiry.
* `transitions.test.ts`: poses at t = 0, rest, end; wobble settles; recording-context checks of the screens.
* `collision.test.ts`: hit records a swipe, spawns a knock, sets hit-stop and a call-out.
