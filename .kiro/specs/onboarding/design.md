# Onboarding — Design

## Flow

```
boot()
  ├─ initWebcam() rejects ─▶ cameraDenied ─▶ denied screen ─▶ [Try again] ─▶ boot()
  └─ ok
       ├─ seen flag in localStorage ─▶ startLoop (calibration, title)  (unchanged)
       └─ first run ─▶ runOnboarding(video)  ─▶ finish | skip ─▶ set flag ─▶ startLoop
```

Onboarding runs in its own small `requestAnimationFrame` loop (`runOnboarding` in `src/ui/onboarding.ts`, called from `main.ts`)
*before* `startLoop`, so `GamePhase`, `loop.ts` and the existing screens are not
touched. It reuses `drawWebcamFrame` + `drawWebcamTint` for the mirrored view and
draws the guide on the game canvas. Text and buttons are an HTML panel in `#ui`
(accessible, keyboard operable); the loop is stopped and the panel removed when
`done`.

## Modules

| File | Role |
|---|---|
| `src/game/onboarding.ts` | pure: types, `createOnboarding`, `onboardingReducer`, storage helpers, copy constants |
| `src/webcam/framing.ts` | pure: `checkFraming`, `tickFraming` (deltaMs accumulation), thresholds |
| `src/ui/onboarding.ts` | DOM/canvas: `runOnboarding`, `showCameraDenied`, `hideCameraDenied`, `drawGuide`, `guideGeometry` |
| `src/ui/fonts.ts` | `TITLE_FONT_FAMILY`, `loadTitleFont()` (local `document.fonts.load`) |
| `src/assets/fonts/` | `Creepster-Regular.ttf`, `OFL.txt` |
| `src/style.css` | `@font-face`, `.onboarding`, `.screen-error` list styles |
| `tools/fonts.test.mjs` | no-network font references test (needs `node:fs`, `src/` has no node types) |

## State machine

```ts
type OnboardingStep = 'guide' | 'howto' | 'denied' | 'done'
interface OnboardingState {
  step: OnboardingStep
  howtoIndex: 0 | 1 | 2
  resume: 'guide' | 'howto' | 'done' // where `retry` returns to
  framing: FramingStatus | null
  framingOkMs: number
  seen: boolean                  // true once finished or skipped
}
type OnboardingEvent =
  | { type: 'next' } | { type: 'back' } | { type: 'skip' }
  | { type: 'cameraDenied' } | { type: 'retry' }
  | { type: 'framing'; status: FramingStatus; deltaMs: number }
```

Transitions as in requirements R1. `denied` from `done` resumes to `done`
(`resume` is `'guide' | 'howto' | 'done'`). `framing` events only update the
guide step. `seen` is set only by `next` from howto 2 and `skip`. The UI calls
`persistSeen(storage)` when `seen` flips to true (a pure `shouldPersist(prev,
next)`), keeping the reducer free of I/O.

Storage: `Pick<Storage,'getItem'|'setItem'>`; `hasSeenOnboarding` and
`persistSeen` catch every exception. Key `exorcise.onboarding.v1`, value `"1"`.

## Framing check

Input `{ data: Uint8ClampedArray, width, height }` (an `ImageData` fits). The UI
draws the video into a 64×36 canvas and reads it every `FRAMING_INTERVAL_MS`
(250 ms of accumulated `deltaMs`).

- luma = `(77r + 150g + 29b) >> 8` (same as `diff.ts`).
- `too-dark`: mean luma < 40.
- `too-close`: in the central 50 % × 50 % box, share of skin pixels ≥ 0.6.
  Skin = `r > 95 && g > 40 && b > 20 && r > g && r > b && r − min(g,b) > 15`.
  A heuristic: it will not fire for every skin tone or lighting; the check is
  advisory and Skip/Next are always available.
- `low-detail`: share of pixels whose luma differs from the right or lower
  neighbour by ≥ 24 is < 0.04.
- else `ok`.

`tickFraming(okMs, status, deltaMs)` adds `deltaMs` to `framingOkMs` when `ok`
and resets it otherwise; "Looking good!" shows at ≥ 1000 ms.

## Guide silhouette (procedural)

`guideGeometry(w, h)` returns the head ellipse (centre x, 0.2 h; ry ≈ 0.095 unit),
a shoulders path (a semicircle, radius ≤ 0.17 w, whose top sits just below the
chin: `cy = head.cy + head.ry + 0.01 h + r`) and two hand circles at x = 0.2 w
and 0.8 w, y = 0.42 h. The figure lives in the top ~55 % of the canvas so the
bottom-anchored panel (CSS-capped at `max-height: 40vh`, compact below 560 px height) never covers the hand targets. All coordinates are inside the canvas for any
size (property-tested). Drawn with a dashed stroke, pumpkin orange; slime green
and a soft glow when the framing has been `ok` for 1 s. Faint pulsing uses
the rAF timestamp for visuals only (not gameplay). Framing stability is credited
only for observed ok time: the first `ok` sample after a non-ok one starts the
clock at 0; framing state resets whenever the guide is (re)entered. Sampling is
skipped while `video.readyState < 2`.

## How-to cards and privacy

An HTML panel: a Creepster heading, step dots 1/2/3, one card at a time (emoji +
sentence), Back / Next (last: "Let's play!") / Skip buttons, and the privacy
line in a `<p class="privacy">` under every screen. Copy lives in
`onboarding.ts` constants (`PRIVACY_LINE`, `HOWTO_STEPS`, `GUIDE_TEXT`) so tests
assert the exact wording.

## Camera denied

`classifyCameraError(err)` → `'blocked' | 'unavailable'` from `err.name`.
`showCameraDenied(kind, onRetry)` renders the existing `.screen-error` container
with a heading, kind-specific lead, an `<ol>` of instructions, the privacy line
and a Try again button. Text built with `textContent`; no anchors or URLs.
It replaces `showWebcamError`/`hideWebcamError` in `screens.ts`.

## Font

```css
@font-face {
  font-family: 'Creepster';
  src: url('./assets/fonts/Creepster-Regular.ttf') format('truetype');
  font-display: swap;
}
```
Vite resolves the relative URL and emits a hashed local asset. Canvas text only
uses a web font once it is loaded, so `main.ts` awaits `loadTitleFont()`
(`document.fonts.load("48px Creepster")`, local file, time-boxed to 1.5 s and
failure-tolerant) before the first frame. Fallback stack:
`'Creepster', 'Chalkboard SE', 'Comic Sans MS', 'Arial Rounded MT Bold', fantasy`.

Creepster has a single weight, so `bold` is dropped for title text (avoids
synthetic bold).

## Camera loss and input latch

`runOnboarding` resolves `'done'` or `'cameraLost'` (video track `ended`);
`main.ts` keeps one module-level onboarding state, so `cameraDenied` →
`showCameraDenied` → `retry` → `boot()` resumes the same step (R1.4, R5). The
font load runs in parallel with `getUserMedia`. Space is ignored by the global
start handler when a button is the target, `e.repeat` is ignored in the
onboarding key handler, and `startLoop` clears the Space start latch (before and
after calibration). A `noFrame` reducer event resets framing state while the
video has no frame. A track `mute` lasting `MUTE_LOST_MS` (3 s) resolves
`'cameraLost'`. `stopWebcam` stops tracks and nulls `srcObject` before a retry
(and inside `initWebcam` when setup fails). The panel remembers the last
activated button so Back keeps focus; the button row is `position: sticky`.
`isSkin` (`r > 95`) is deliberately conservative: `too-close` is advisory and may
not fire for darker skin tones or dim light; Skip/Next are never blocked.

## Testing

- `src/game/onboarding.test.ts`, `onboarding.property.test.ts`
- `src/webcam/framing.test.ts`, `framing.property.test.ts`
- `src/ui/onboarding.run.test.ts`: fake-DOM wiring: keyboard (Enter/Space/Escape, repeat, button target, listener removal), focus, mute, stall, camera loss
- `src/game/loop.latch.test.ts`: start latch before/during calibration
- `src/ui/onboarding.test.ts`: `guideGeometry` bounds, `classifyCameraError`, denied copy link-free (pure helpers only; no DOM in the node test env)
- `tools/fonts.test.mjs`: sources scanned for `http(s)` in font references.
