# Boss Ghost + Combo — Design

## State model changes

Add to `GameState`:

```ts
interface GameState {
  // ... existing fields ...
  combo: number;              // current combo multiplier (min 1)
  phase: 'title' | 'playing' | 'boss' | 'roundclear' | 'gameover';
  bossHits: number;           // 0–3; only meaningful in 'boss' phase
}
```

The `phase` field gains two new values:
- `'boss'` — boss fight in progress (t = 55–60 s or until boss dies/time out).
- `'roundclear'` — boss defeated; showing the round-clear banner.

---

## Combo logic

Combo is tracked as a plain integer in `GameState.combo`. It is:
- Incremented by 1 on each ghost/bat hit (in `resolveHits`).
- Reset to 1 when an enemy reaches center (in the game loop center-check).
- Multiplied into the score at the point of hit: `addScore(state, basePoints * state.combo)`.

New reducers in `state.ts`:
- `incrementCombo(state): GameState` — `combo + 1`.
- `resetCombo(state): GameState` — `combo = 1`.

---

## Boss ghost data model

The boss is a regular `Enemy` with `type: 'boss'` added to the `EnemyType` union:

```ts
type EnemyType = 'ghost' | 'bat' | 'skull' | 'boss'
```

Boss-specific fields are stored in the normal `Enemy` shape; no new interface is needed. `bossHits` in `GameState` tracks how many times it has been hit (the boss does not die on a single hit, so `removeEnemy` is not called until hit 3).

Boss hitbox: 160 × 160 px. Speed: 0.5 px/frame. Spawns from `(canvasW / 2, -160)`.

---

## Boss visual (`src/game/enemies/boss.ts`)

Drawn as a scaled-up ghost with two additions:
1. **Witch hat** — trapezoid brim + taller triangle crown, both filled `#1a0030`, with an orange buckle stripe drawn as a thin `fillRect`.
2. **Health orbs** — rendered in `renderBossHealth(ctx, bossHits)`: 3 circles in a row below the boss. Filled purple (`#7b2fbe`) when healthy, dim grey (`#444`) when spent.

Glow: `shadowColor: #7b2fbe`, `shadowBlur` oscillates 14–24 px.

---

## Round sequencing (`src/game/round.ts`)

New module that handles the phase transitions:

```
playing  →  (t ≤ 5 s remaining)  →  boss
boss     →  (3 hits)              →  roundclear
boss     →  (timer = 0)           →  gameover
roundclear → (3 s elapsed)        →  playing (new round, lives carry, score resets)
```

`tickRound(state, deltaMs): GameState` — called from the game loop instead of inline phase checks. Internally:
- Detects the 55 s threshold and transitions to `'boss'`.
- Clears normal enemies and spawns the boss on transition.
- On `'roundclear'`, ticks a `roundClearTimer` and triggers restart when it expires.

---

## HUD additions

**Combo label (bottom-right):**
- Hidden when `combo === 1`.
- Shows "×N" in slime green (`#39ff14`) with a glow.
- On increment: scale from 1.5 → 1.0 over 200 ms (tracked with a `comboAnimStart` timestamp in HUD state or a canvas `save/restore` + `scale`).

**Mute button (top-right, left of timer):**
- Plain `<button>` in the `#ui` HTML overlay.
- Toggles `audioContext.suspend()` / `audioContext.resume()`.

---

## Audio (`src/audio/sfx.ts`)

All sounds synthesised with Web Audio API. No files loaded.

```ts
export function playComboChime(combo: number): void
export function playBossHit(): void
export function playBossDefeated(): void
export function setMuted(muted: boolean): void
```

`playComboChime` uses an `OscillatorNode` at `220 * combo` Hz (so x2 = 440 Hz, x3 = 660 Hz, etc.) with a short exponential decay gain envelope.

`playBossDefeated` chains three oscillators (C4 = 261.6 Hz, E4 = 329.6 Hz, G4 = 392 Hz) each starting 0.3 s after the previous, with a longer sustain and a smooth fade-out.
