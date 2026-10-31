# Stages — Design (P1)

## State additions

```ts
interface GameState {
  // ... existing ...
  stage: number            // 1–5
  stagePhase: 'title' | 'playing' | 'summary' | 'boss'
  stageClearMs: number     // countdown for title card / summary auto-advance
  combo: number
  bestCombo: number
  stageMissed: number      // enemies that reached center this stage
  stageBanished: number
  highScore: number        // loaded from localStorage on init
}
```

## Stage config file

`src/game/stages.ts` — a plain `StageConfig[]` export. The loop reads
`STAGES[state.stage - 1]` to know spawn rates, durations, and enemy mix.

## Routing / phase machine

```
start-screen
  → (motion on pumpkin) → stage-title (stage 1)
      → (3 s) → playing
          → (timer 0 or lives 0) → summary or game-over
              → (next) → stage-title (stage + 1) or boss
game-over → start-screen or retry-stage
```

Handled in `src/game/round.ts` (new module, replaces inline loop phase checks).

## Lunging enemy

New `EnemyType: 'lunger'`. Movement state machine:
- `'approach'` — moves to a hold point 200 px from edge, then transitions to `'windup'`.
- `'windup'` — stationary for 500 ms, plays a "wind up" scale-up animation.
- `'lunge'` — moves at `speed * 2.5` toward the center.

Stored as `enemy.movePhase: 'approach' | 'windup' | 'lunge'` and
`enemy.phaseTimer: number`.

## Pumpkin enemy

New `EnemyType: 'pumpkin'`. `enemy.hitsNeeded: 2`, `enemy.hitsReceived: 0`.
On first hit: flash + shrink (render handles this via `hitsReceived`).
On second hit: banish with particle puff.

## Motion buttons

`src/ui/motionButton.ts` — exports `MotionButton` class:
```ts
class MotionButton {
  constructor(cx: number, cy: number, radius: number, label: string)
  update(motionPixels: MotionPixel[]): 'idle' | 'filling' | 'triggered'
  render(ctx: CanvasRenderingContext2D, fillProgress: number): void
}
```
Uses the existing motion-pixel data from `collision.ts` to detect sustained
motion inside the circle hitbox.

## HUD additions

- Stage name (top-center, small, dimmed).
- Combo multiplier (bottom-right, slime green, hidden at x1).
- Lives now shown as 3 heart icons with a damage-shake animation.
