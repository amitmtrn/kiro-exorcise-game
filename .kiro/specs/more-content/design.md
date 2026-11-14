# More Content — Design

## State additions

`EnemyType` gains `'wisp' | 'mirror' | 'blink'`. `Enemy` gains variant fields
(defaults in `makeEnemy`, so every existing literal keeps working):

```ts
type VariantState =
  | 'idle' | 'lit' | 'merging'                 // wisp
  | 'shield' | 'cracking' | 'open' | 'closing' // mirror
  | 'solid' | 'warnOut' | 'ethereal' | 'warnIn' // blink

interface Enemy {
  // ... existing ...
  vState: VariantState   // current state ('idle' for every non-variant enemy)
  vTimerMs: number       // ms spent in vState (counts up, carries overshoot)
  vHits: number          // mirror: absorbed hits counted toward the crack
  absorbMs: number       // mirror: ms of "clink" feedback left; also the absorb cool-down
  pairId?: string        // wisp: shared by the two wisps of a pair
  finale: boolean        // boss only: the Hollow King
}
```

`GameState` gains `variantIndex: number` (next scripted variant event, like
`waveIndex`) and `seenVariants: string[]` (types whose tip call-out has shown this
stage). Both are reset on stage entry.

## Module `src/game/enemies/variants.ts` (pure)

Constants (all balance numbers in one table):

| | value |
|---|---|
| `MIN_TELEGRAPH_MS` | 400 (rule), `TELEGRAPH_MS` = 500 (used) |
| wisp | `TWIN_WINDOW_MS` 2000 (lit 1500 + merging 500), travel 5.0 s |
| mirror | `SHIELD_MAX_MS` 1500, `SHIELD_BREAK_HITS` 2, `ABSORB_COOLDOWN_MS` 300, cracking 500, `OPEN_MS` 1300, closing 500, travel 6.5 s |
| blink | `SOLID_MS` 1600, warnOut 500, `ETHEREAL_MS` 1400, warnIn 500, travel 6.0 s |
| shared | `MIN_WINDOW_MS` 1200, `MAX_WAIT_MS` 2000, `MIN_TRAVEL_MS` 4500 |

```ts
export function stepVariant(e: Enemy, deltaMs: number): Enemy        // timers + transitions, carries overshoot
export function isVariantHittable(e: Enemy): boolean                 // blink: solid|warnOut; mirror: open|closing; wisp: true
export function telegraphLeftMs(e: Enemy): number                    // 0 outside a telegraph state
export function nextState(type, state): VariantState                 // the state a timer expiry moves to
export function stateSchedule(type): Array<{ state, ms }>            // the cycle, used by tests
export function onMirrorAbsorb(e: Enemy): { enemy: Enemy; absorbed: boolean; cracked: boolean }
export function lightWisp(e: Enemy): Enemy                           // idle→lit (lit and merging unchanged)
export function createWispPair / createMirror / createBlink(...)     // spawn helpers
```

`stepVariant` advances `vTimerMs` by `deltaMs` and loops while the state's duration
is exceeded (carry), so a 1 ms and a 100 ms tick sequence give identical states
at identical game time (property test). The cycles:

```
blink:   solid ─1600→ warnOut ─500→ ethereal ─1400→ warnIn ─500→ solid
mirror:  shield ─(1500 ms | 2 absorbed hits)→ cracking ─500→ open ─1300→ closing ─500→ shield
wisp:    idle ─(hit)→ lit ─1500→ merging ─500→ idle        (a hit on the partner in lit|merging banishes both)
```

Every transition that changes vulnerability (into `ethereal`, `solid`, `open`
or `shield`) leaves a telegraph state (`warnOut`, `warnIn`, `cracking`, `closing`)
that lasted at least 500 ms (≥ `MIN_TELEGRAPH_MS`). The other transitions are
either the start of a telegraph (`solid → warnOut`, `shield → cracking`, `open →
closing`, `lit → merging`) or caused by the player (a wisp hit, an absorbed hit).
Property: for every reachable transition `a → b` with `b` in the first list, `a` is
a telegraph state and its dwell time was ≥ 400 ms.

### Fairness numbers

- Blink: vulnerable 0–2100 ms from spawn, then every 4000 ms for 2100 ms. Max wait
  after grace: 0.
- Mirror: protected while `shield` and `cracking` (the crack telegraph still
  absorbs), so it is vulnerable from 2000 ms after spawn for 1800 ms; two absorbed
  swipes shorten the wait. Max wait after the 300 ms grace: 1700 ms ≤ `MAX_WAIT_MS`.
- Wisp: no protection at all; the lit window gives 2000 ms for the partner.
- Travel: `speedFor(type, dist)` = `(dist − CENTER_THRESHOLD) / H / travelSec`
  canvas heights per second, so the travel time is exactly the table value at any
  canvas size. 4500 ms ≥ 2000 + 1200.

## Movement and hitboxes

`movement.ts`: the three types use the ghost wobble (`GHOST_WOBBLE_*`, half the
amplitude for blink). `moveSingle` also calls `stepVariant`. `hitboxFor` handles
the new types (wisp 0.8 × `GHOST_SIZE`). `isThreat` already treats unknown types as
threats; wisps are deduplicated per pair in `reach.ts` (`splitReached`: the first
wisp of a pair to arrive costs one life and removes its partner).

## Hit rules (`collision.ts`)

1. `isHittable(e)` (vulnerability.ts) delegates to `isVariantHittable`, so the
   demo driver and the gate skip protected ghosts.
2. **Mirror**: before `isHittable`, a shielded or cracking mirror runs the normal
   2-frame gate; a confirmed hit calls `onMirrorAbsorb` (counts only when
   `absorbMs ≤ 0`), plays `sfxShield`, emits spark particles, resets the gate and
   keeps the enemy. An `open` / `closing` mirror banishes like a ghost.
3. **Wisp**: the first confirmed hit calls `lightWisp` (`sfxWispLink`, no score).
   A confirmed hit while the partner is `lit | merging` banishes both: 2 × 150 ×
   combo, `incrementCombo` twice, a banish effect each. A hit on a lit wisp does
   nothing.
4. **Blink**: normal ghost banish when `isVariantHittable`, else the gate resets.

## Spawning (`variantSpawn.ts`)

Pure functions taking a `rand` (default `Math.random`): `pickSpawn(W, H,
skulls, rand, span = 0)` returns an edge point at least `SKULL_CLEARANCE` from every live skull (for a wisp pair, `span` = half the pair gap: both members must clear it, not only the midpoint),
trying the four edges in a random order, else `null` (the event is deferred and
retried the next tick). Spawned ghosts head for the exact centre. `tickSpawners`
consumes `stageCfg.variantEvents` (`{ atMs, kind }`) like `waveEvents` (clock =
elapsed stage time; a wisp pair needs two free slots, anything else one). An event
that waits for a slot or a safe point is dropped once it is more than
`VARIANT_DEFER_MAX_MS` (3 s) late, so nothing scripted arrives near the boss
entrance. A blocked event never holds back the other due events: it is skipped
and retried each tick, and `variantDone` records events that fired out of order
(`variantIndex` is the first event not yet done).

## Stage 6 and the finale

### Choice: append stage 6, do not restructure

| Option | For | Against |
|---|---|---|
| Append stage 6 after the stage-5 boss | keeps every stage-5 test, balance and card; the stage-5 boss becomes a mid-game boss with a normal summary and the bonus-free path; ramp is 4 → boss → harder finale | the game is one stage longer (about 5 minutes total, one more 60 s) |
| Make stage 5 the finale and merge | shorter | stage 5 would have to host the new ghosts *and* the boss in 60 s; the stage-5 boss spec (`boss-phases`) and its tests would change; no breathing room between boss and finale |

Append wins: it changes one constant (`STAGES.length`), keeps stage 5 as a
checkpoint (retry restarts the stage), and the difficulty ramp stays monotone
(stage 5 = one boss alone, stage 6 = new ghosts then a boss that summons them).

```ts
{ id: 6, name: 'Stage 6', subtitle: 'The Midnight Finale', durationMs: 60_000,
  enemyMix: { ghost: false, bat: false, skull: true, lunger: false, pumpkin: false, boss: true },
  spawnIntervalMs: { skull: 9000, others 99999 }, speedMultiplier: 1.0, maxEnemies: 5,
  variantEvents: [ {2000,'wisp'}, {6500,'mirror'}, {11000,'blink'}, {14000,'wisp'}, {14000,'blink'}, {16500,'mirror'} ],
  finale: { bossAtMs: 22_000, tips: {...}, hints: [...] } }
```

Rules in `tickSpawners`: stage 6 events fire when `atMs ≤ elapsed`; the skull
timer is ignored once `elapsed ≥ bossAtMs − 7000`; a second event at the same
time waits for a free slot (cap 5) without blocking the others.

### Finale boss

`createBoss(W, H, finale = true)` sets `finale: true`, `hitsNeeded` stays
`BOSS_HITS_NEEDED`. `bossPhases.ts` selects `FINALE_PARAMS` when `boss.finale`:

| | idle | wind-up | lunge | recover | summon |
|---|---|---|---|---|---|
| Phase 1 | – | – | – | – | 1 blink / 6 s, cap 2 |
| Phase 2 | 3 s | 700 ms | 0.9 H/s | 1.4 s | 1 wisp pair / 8 s, cap 4 |
| Phase 3 | 2 s | 450 ms | 1.3 H/s | 1.35 s | 1 mirror (+ 1 blink on even summons) / 7 s, cap 3 |

Everything else (phase thresholds, shield-while-idle, i-frames, stagger, defeat)
is shared with the stage-5 boss. `paramsFor(boss)` picks the table. In `tickBoss` a
finale summon makes `finaleMinionKinds(phase, n)` (blink / wisp pair / mirror, plus a
blink on every other phase-3 summon) with `spawnVariantAt` beside the boss (`kingSpawnPoint`: 1.1 boss widths toward the centre column, so a minion is readable even at 640×360); a summon is held back (timer stays due) while `skullNear` the spawn point; the
finale boss counts its summons in `vHits` (unused by bosses otherwise). A summon that
would exceed the cap (blink, wisp, mirror and ghost alive; a pair counts 2) falls back to
its first ghost alone (the mirror in phase 3), and is skipped when even that does not fit;
the timer restarts, as for the stage-5 boss.

Fight budget: boss enters at 22 s, 38 s remain. Phase 1 (hits 1–4) needs
4 × 0.4 s i-frames plus swing time ≈ 5 s. A phase-2 cycle is 3 + 0.7 + lunge
(≈ 1.4 s) + 1.4 = 6.5 s with ≥ 3.5 s vulnerable (wind-up + lunge + recover):
3 hits ≈ 1 cycle. Phase 3 cycle 2 + 0.45 + ≈ 1.0 + 1.35 = 4.8 s with 2.8 s
vulnerable (wind-up + recover alone is 1.8 s, R6.4): 3 hits ≈ 1–2 cycles. Total ≈ 5 + 7 + 9 = 21 s, leaving 17 s of slack
(a player who misses every first window still wins). `tests` assert wind-up +
recover ≥ 1800 ms in both attack phases, and a worst-case budget (entry flight
simulated, 4 × i-frames, one cycle per phase-2 hit, two phase-3 cycles) with 2 s of slack.

### Victory flow

`advanceToNextStage` already branches on `STAGES.length`; the boss-defeat branch in
`collision.ts` already uses it; `step.ts` spawns the boss through `bossDue(state)`
(stage 5: at once, stage 6: `elapsed ≥ bossAtMs`). The finale bonus (2000) is
added in the defeat branch when `enemy.finale`. `render.ts`: crown instead of the
hat, aura `#d4a017` / cb palette, label "HOLLOW KING".

### Music

`TrackId` gains `'finale'` (bpm 138, transpose 0, `minTier: 2`, A-minor scale,
original bass / lead: a pedal bass climbing A–C–D–E and a bell-like lead). `trackForStage(n ≥ 6)` returns it; stage 5 stays `boss`.

## Rendering (`render.ts`, procedural)

- **Wisp**: two small ghosts; link line between partners (dashed when idle, solid
  when lit); lit wisp: one ring that shrinks monotonically over the whole `TWIN_WINDOW_MS`
  (`wispRingFraction`: `1 − (vTimerMs + (merging ? lit : 0)) / TWIN_WINDOW_MS`, no refill
  at the merge); only while `merging` the ring blinks at `variantPulseHz()` (1.5 Hz, 0.375 Hz with reduced flashing). Icon: ∞ drawn above.
- **Mirror**: ghost body with a hexagonal shield; closed = filled bar "▮" icon;
  `cracking` = crack lines growing, glow rising; `open` = broken outline; absorb =
  white ring that expands for `absorbMs`.
- **Blink**: solid = filled body + "◆"; ethereal = dashed outline, alpha 0.3, "◇";
  warn states interpolate alpha with a smooth ramp (no strobe).
- Colours come from the palette (`wisp`, `blink`, `mirror` keys). The `cb`
  palette values are the brute-force result of `palette.property.test.ts`.
- Telegraph pulses all go through `variantPulseHz()` in `renderVariants.ts` (1.5 Hz; a quarter of that with reduced flashing).

## Audio

Two procedural recipes in `recipes.ts` (`wispLink`, `shield`; the blink ghost is silent, its state is visual; all
peak ≤ −3 dBFS, in the loudness table): link = rising two-note chime, shield = short
metallic tick, finale fanfare reuses `bossDefeated`. No files.

## High scores (group C)

### `src/game/highScores.ts` (pure + storage)

```ts
interface ScoreEntry { id: string; name: string; score: number; stage: number; date: string; mode: '1P' | '2P' }
TABLE_SIZE = 10; NAME_MAX = 8; STORAGE_KEY = 'exorcise-highscores'; LEGACY_KEY = 'exorcise-highscore'
sanitizeName(raw), generateName(rand), qualifies(table, score), insertScore(table, entry): { table, rank }
renameEntry(table, id, name), parseTable(json), loadTable(), saveTable(table), recordScore(entry), tableBest()
```

`loadTable` does the migration (R8.4) and returns `[]` when persistence is off. `ensureTable` runs before the first legacy-key write and stores `[]` when there is nothing to migrate.
`state.ts` exports `highScorePersistence()`; `loadHighScore` returns
`max(legacy, tableBest)` (0 with persistence off). `id` is a random token used
to rename the entry later; it is stored but carries no personal data.

### `src/game/nameEntry.ts` (pure)

```ts
interface NameEntry { defaultName: string; text: string; touched: boolean; cursor: number; done: boolean; startedAt: number; lastInputAt: number }
newNameEntry(defaultName, now), pickStep(e, dir, now), confirm(e, now), typeChar(e, ch, now), backspace(e, now),
accept(e, now), tickNameEntry(e, now) /* R9.4 */, finalName(e), nameKey(e, key, now) /* keyboard router */
```

`PICK_LEN` = 3. ◀ / ▶ with `touched = false` sets `text = 'A'`, `cursor = 0`.
OK with `cursor < PICK_LEN − 1` appends `A` and moves on, else done.

### Layout

`ScreenId` gains `'name'` (1P) and `'name2p'` (2P, in `SCREENS_2P`). `areaButtons`:
`stepA` (slot A), `ok` (OK, slot B, same column) and `stepS` (slot S, opposite
column). The step labels follow the geometry: the button further left is ◀, so in
P2's mirrored half (stacked column on the right) `stepA` is ▶. `nameStepOf(button)`
maps a label to −1 / +1. Ids stay the same in both halves, so the existing
"P2 mirrors P1" property holds. The stacked column and single column follow the existing slots so the
reach model, 40 % rule, text rects and mute clearance are the same code paths. The
existing layout property tests iterate the screen lists, so adding the ids covers
them; one test per new id asserts the three labels and order.

### Screens (`ui/nameScreen.ts`)

`renderNameScreen(ctx, entry, now, handlers, opts)` draws the title "NAME YOUR
HUNTER" (fit to the text band), the current name large (cursor underline on the
active letter), a hint line, and the three buttons. 2P: `renderNameScreen2P`
draws the same in a half (each half with its own `ButtonSet` and motion points),
or "Waiting for the other player" once done. Entry lock-out via `EntryLock`.

### Table drawing (`ui/scoreTable.ts`)

`tableRows(table, page, perPage)` and `endRows(table, highlightId)` are pure;
`drawTable(ctx, rows, box, opts)` draws with the text scale and palette. The title
screen alternates pages with `Math.floor((now - enteredAt) / 4000) % pages` (the timer starts when the title is entered); the box is fitted with a 8 px font floor so the rows stay inside the text band, and the text-scale setting applies up to the size the box allows; end screens draw the top 5 plus
the player's own row.

### Loop integration

- At first entry to `gameover` / `victory` (1P, not demo; tracked with
  `gameOverVisible` / `victoryVisible`): `recordScore` with a generated name, remember
  the id, build a `NameEntry`. While it is not done
  the end screen renders the `NameScreen`; then the normal end screen with the
  table and a fresh lock-out. Keyboard: `main.ts` forwards keys through
  `handleNameKey` before its other key handling, so M / D / C type letters while the
  name screen is open (the mute button still works); card keys and card clicks wait.
  Clicks / taps are queued (`nameClicks`) and hit-tested by `NameScreen.pointerAction`
  against the same button circles; in 2P `handleSeatCardPointer` routes them to the half.
- 2P `final`: on entry (`onTwoPlayerEnd`) both seats are recorded; each qualifying
  seat gets its own `NameEntry` and `NameScreen(seat, seatSources[seat])`, drawn into
  that half's card layer (`runSeatNames`). A seat with nothing to name shows "Waiting
  for the other player…". The cards and `renderTwoPlayerFinal` appear once both are
  done, with a fresh lock-out (`finalAt`, `resetFinalScreen`). Seat-card clicks are
  ignored meanwhile.
- Retry / Play again / Menu clear the pending entry.
- Demo: `begin()` already switches persistence off; the recording call is a
  no-op and the name screen is not shown when `demo` is set.

## Demo mode

**Default seed.** The default stays **5** (the operator brief names `?demo=1&seed=5`, and
every doc uses it). With stage 6 the first build lost its last life to a phase-3 lunge at
960×540, so the default moved to 6 for a while. After the review fixes (finale blink parity
counted per phase, skull spawns kept clear of new ghosts) seed 5 plays a clean run at
960×540, 1280×720, 1366×768, 1440×900 and 1920×1080, at speeds 1, 2 and 3; the sim tests
assert this. README, `docs/KIRO.md`, the harness README, `run.sh` and the specs all say 5.
No game tuning was changed to get there.

The driver reads `isHittable`, so blink ghosts in `ethereal | warnIn` and shielded
mirror ghosts are not targets. For wisps it targets the lit wisp's partner first.
`timeToThreatMs` handles variants through the shared straight-line rule. The demo
default stage stays 1: a full run now ends after stage 6. Seed 5 is re-checked at the
tested sizes after T9; the default changes only if it fails.

## Balancer

The balancer agent is report-only: it reads `stages.ts` / `waves.ts` through the
motion-harness MCP. Stage 6 uses `variantEvents` and `finale`, which the harness
reports as data; no balancer rule changes.

**Balance check (T9).** `read_stage_config` returns all six stages with the new
fields; a 20 s `run_harness` sweep is unchanged in kind (1021 play frames, 4 hits,
no high score saved). The stage-6 numbers come from the headless demo simulation
(the ghost hand plays through the real loop): demo stage 6 started fresh, seeds 1–10
at 1280×720, 960×540 and 1920×1080 (30 runs). The Hollow King entered at 22.0 s in
every run and fell between 34.3 s and 40.5 s of stage time (12–18.5 s of fighting,
of 38 s available); 29 runs lost no life in stage 6, one lost one. No tuning change
was needed. The balancer agent was not run: it edits nothing, and its harness mode
plays stage 1 only.

## Tests

| File | Covers |
|---|---|
| `enemies/variants.test.ts` | every cycle, timings, overshoot carry, absorb counting and cool-down, wisp link |
| `enemies/variants.property.test.ts` | telegraph precedes protection changes, hit possible in window, frame-rate independence, travel time ≥ 4500 ms |
| `enemies/variantSpawn.test.ts` + property | clearance, 2P half bounds, pair never spans the divider, grace |
| `collision.variants.test.ts` | absorb, link, both-hit, blink gate, scoring, 2P seat |
| `round.test.ts` / `finale.test.ts` | stage 6, victory only after stage 6, finale params, minion kinds, king tips, telegraph ≥ 400 ms, vulnerable fraction |
| `audio/music/patterns.test.ts` | `finale` track valid and distinct |
| `ui/palette.property.test.ts` | new keys keep ΔE ≥ 12; the cb crown (`bossCrown`, purple) stays apart from the boss body, pumpkin and bat eyes |
| `render.variants.test.ts` | drawing runs for every state in default and cb palettes, reduced flash rate |
| `game/highScores.test.ts` + property | storage, migration, validation, ordering, demo off |
| `game/nameEntry.test.ts` + property | picker closure, keyboard, timeouts |
| `game/nameEntry.test.ts`, `ui/layout*.test.ts` | name buttons in 1P and per half |
| `ui/scoreTable.test.ts`, `ui/nameScreen.test.ts`, `game/loop.names*.test.ts` | rows, highlight, drawing |
| `demo/demo.sim.test.ts` | full run through stage 6, nothing saved |
