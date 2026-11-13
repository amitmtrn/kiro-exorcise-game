# Exorcist Card — Design

## Modules

| File | Pure? | Purpose |
|---|---|---|
| `src/game/rank.ts` | yes | `RANKS`, `rankForScore(score)` |
| `src/game/runStats.ts` | yes | `RunStats`, `createRunStats`, `observeRun(stats, state)` → `{ stats, moment }`, `momentRank` |
| `src/card/snapshotStore.ts` | yes (generic) | `createSnapshotStore<T>(release?)`: `offer(moment, grab)`, `get()`, `has()`, `discard()` |
| `src/card/layout.ts` | yes | `layoutCard(w, h, texts)`, `fitText`, `coverRect`, `scaleToFit` |
| `src/card/draw.ts` | canvas | `drawCard(ctx, w, h, data, photo)`; procedural frame, silhouette |
| `src/card/snapshot.ts` | canvas | `grabMirroredSnapshot` (same mirrored draw as the live view), `releaseSnapshot` |
| `src/card/session.ts` | yes (deps injected) | `CardSession`: run stats + snapshot store + preview state + lifecycle (observe / open / toggle / save / reset) |
| `src/card/download.ts` | DOM, deps injected | `downloadCanvasPng(canvas, filename, deps)` |
| `src/ui/cardScreen.ts` | canvas | preview overlay + 3 motion buttons + hit test |
| `src/game/loop.ts` | – | wiring: observe each tick, snapshot grab, card flow, lifecycle |
| `src/main.ts` | – | `C` key and `pointerdown` forwarded to the loop |

## Run stats and moments

```ts
interface RunStats { banked: number; lastStageBanished: number; bestCombo: number; stage: number; phase: GamePhase }
type MomentKind = 'boss' | 'combo' | 'end'
interface Moment { kind: MomentKind; rank: number }   // boss 100, combo tier×10 (20/30/40), end 0
```

`observeRun` is called once per tick with the state at the top of the tick.
- `banked` adds `lastStageBanished` whenever `stageBanished` drops (a new stage
  resets it); `banished = banked + lastStageBanished`.
- `bestCombo = max(bestCombo, state.combo)`, `stage = max(stage, state.stage)`.
- Moment: phase became `victory` → boss; `state.combo` exceeded the run's previous
  best and is ≥ 2 → combo; phase became `gameover` → end; victory/gameover is also
  the fallback `end` (rank 0) when nothing better is stored.

## Snapshot store

`offer(moment, grab)` calls `grab()` only when `moment.rank > current.rank` (or the
store is empty); the replaced value goes through `release`. `discard()` releases
and clears. The grab in the loop draws the video with `drawWebcamFrame` (the same
mirror transform as the live view) into an off-screen canvas sized by `scaleToFit`
(≤ 640 px wide). Memory only — nothing is serialised.

## Layout (card 600 × 840 by default, any size ≥ 200 × 280)

`layoutCard(w, h, texts)` returns rectangles and `TextBox { text, x, y, px, align, maxW }`:

```
margin = 0.05 · min(w, h); bands are fractions of the content height
┌───────────────────────┐ frame (inset margin)
│  EXORCIST   (title)   │ 0–0.10
│ ┌───────────────────┐ │
│ │      photo        │ │ 0.11–0.54  (rect, inside inner frame)
│ └───────────────────┘ │
│   Rank title          │ 0.56–0.64
│ Score        12,345   │ 4 rows, 0.67–0.91
│ Best combo       x4   │
│ Stage reached   5 / 5 │
│ Banished          87  │
│ made on your device   │ footer
└───────────────────────┘
```

`fitText(text, maxW, basePx, minPx)` estimates width as `chars × px × 0.62`,
shrinks to `minPx`, then truncates with "…" so the estimate fits. The extent of a
box is `[x - w, x]`, `[x - w/2, x + w/2]` or `[x, x + w]` by alignment; the property
test asserts all extents and rects lie in `[0,w] × [0,h]`.
`coverRect(srcW, srcH, dstW, dstH)` returns the centred source crop with the
destination aspect ratio.

## Drawing

Background vertical gradient `#0d0014` (top) `→ #2a0845` (bottom); outer frame `#ff6b1a` (4 px) and
inner `#ffd166` (1.5 px) rounded rects; corner cobwebs (arcs and lines), a moon,
two bats (path shapes, ghost white so they show on the dark band). Title: Creepster with orange glow. Numbers
`#ffd166`, combo `#39ff14`. Silhouette: circle head + rounded shoulders in
`#2a0845` on a purple gradient; shapes only, no text.

## Download

```ts
interface DownloadDeps { URL: Pick<typeof URL,'createObjectURL'|'revokeObjectURL'>; document: Document;
  schedule: (fn: () => void) => void }
downloadCanvasPng(canvas, filename, deps): Promise<boolean>
```
`toBlob` (PNG) → null ⇒ resolves false. Else `createObjectURL(blob)`, create `<a download href>`,
append, `click()`, remove, and revoke via `schedule` (default `setTimeout(…, 1000)`;
tests pass a synchronous scheduler). A `try/finally` guarantees revoke even if the
click throws. No other global is touched.

## Screen flow (loop)

```
gameover/victory ──[CARD btn / click / C]──► preview (card canvas built once per photo-mode)
preview ──SAVE / S / Enter──► downloadCanvasPng        preview ──CLOSE / Esc──► back
preview ──NO PHOTO / N──► rebuild card with silhouette
```

- `main.ts` forwards keys (`handleCardKey(key, repeat)`, auto-repeat swallowed) and
  `pointerdown` (`handleCardPointer`) into a `cardInputs` queue in `loop.ts`, which
  the tick drains only on gameover/victory (like `requestStart`). Clicks are
  hit-tested against the button circles; while the preview is open `main.ts`
  skips the mute-button click.
- The card, snapshot and run stats live in `CardSession` (`card/session.ts`).
- `MotionButton` fires once per wave: after `triggered` it stays idle until the
  motion has left the circle (`awaitRelease`); `updateGated(now, live)` holds a
  button while not live. Preview buttons are gated for `PREVIEW_INPUT_DELAY_MS`.
- While `preview` is open the retry/menu/play-again buttons are not rendered/updated.
  On open and on close `lockEndButtons(now)` resets their fill and gates them (and
  the offer button) for 0.8 s, so a CLOSE wave cannot fall through to MENU / RETRY.
- Accepted: on victory `C` / a click on the offer button work during the victory
  input lockout; it is an explicit choice, not a wave.
- **Lifecycle:** when the phase leaves gameover/victory (or a new game starts) the
  loop calls `session.reset()` (discard snapshot, close card, reset `RunStats`);
  `stopLoop()` and the cleanup returned by `startLoop` do the same. Retry
  Stage is a new run for card purposes (its score also restarts at 0).

## Privacy

No storage API is used for the image; no network API is referenced in `src/card/`
(a test greps the module sources for `fetch`, `XMLHttpRequest`, `sendBeacon`,
`WebSocket`, `localStorage`, `indexedDB`). `PRIVACY_LINE` is untouched.

## Tests

| File | Covers |
|---|---|
| `game/rank.test.ts`, `rank.property.test.ts` | thresholds, bad input, monotone |
| `game/runStats.test.ts`, `.property.test.ts` | banked across stages, best combo, moments, banished never decreases |
| `card/snapshotStore.test.ts` | taken, replaced by better, equal not replaced, grab lazily, discarded + released |
| `card/layout.test.ts`, `layout.property.test.ts` | positions, fitText, coverRect, inside card for any sizes/lengths |
| `card/download.test.ts` | toBlob/URL mocked, revoked (also on error / null blob), `<a download>`, no fetch/XHR/sendBeacon/WebSocket |
| `card/privacy.test.ts` | `src/card/*.ts`, `ui/cardScreen.ts`, `game/rank.ts`, `game/runStats.ts` contain no network/storage API |
| `card/snapshot.test.ts` | snapshot grab is mirrored |
| `ui/cardScreen.test.ts` | button hit test, key mapping, end-button lockout, narrow-canvas radius |
| `ui/motionButton.test.ts` | one wave = one trigger, gated update, reset |
| `game/loop.card.test.ts` | keys/clicks ignored off the end screens, accepted on them, repeat swallowed, `stopLoop` closes |
