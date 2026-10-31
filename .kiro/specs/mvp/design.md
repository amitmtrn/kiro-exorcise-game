# MVP Design

## Canvas layout

Two stacked full-viewport canvases, absolutely positioned:
1. `#webcam-canvas` — webcam feed, mirrored.
2. `#game-canvas` — enemies, particles, HUD overlay.

Both are sized to `window.innerWidth × window.innerHeight`. On resize, both canvases update and enemy positions are rescaled proportionally.

---

## Data models

### Enemy

```ts
interface Enemy {
  id: string;           // unique, e.g. crypto.randomUUID()
  type: 'ghost' | 'bat' | 'skull';
  x: number;            // center x, canvas coords
  y: number;            // center y, canvas coords
  targetX: number;
  targetY: number;
  speed: number;        // px per frame at 60 fps
  sineOffset: number;   // phase for ghost wobble / bat zigzag
  hitbox: { x: number; y: number; w: number; h: number }; // axis-aligned, top-left origin
}
```

Enemy hitbox sizes:
| Type | Width | Height |
|---|---|---|
| Ghost | 80 px | 80 px |
| Bat | 48 px | 32 px |
| Skull | 56 px | 56 px |

### Particle

```ts
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;   // 0–1
  decay: number;   // alpha reduction per frame
  color: string;
  radius: number;
}
```

### GameState

```ts
interface GameState {
  phase: 'title' | 'playing' | 'gameover';
  lives: number;          // 0–3
  score: number;
  roundTimeMs: number;    // milliseconds remaining
  enemies: Enemy[];
  particles: Particle[];
  spawnTimers: {
    ghost: number;        // ms until next ghost spawn
    bat: number;
    skull: number;
  };
  flashEndTime: number;   // performance.now() timestamp; 0 = no flash
}
```

---

## Rendering pipeline (each frame)

1. Draw mirrored webcam frame onto `#webcam-canvas`.
2. Clear `#game-canvas`.
3. Tick spawn timers → may add enemies.
4. Move enemies.
5. Check enemies for "reached center" → decrement life, remove.
6. Check frame diff for each enemy → register hits, score, particles.
7. Tick round timer → may set phase to gameover.
8. Tick particles (move, gravity, fade, remove dead).
9. Draw enemies.
10. Draw particles.
11. Draw red flash overlay if active.
12. Draw HUD.
13. Copy `currentFrame` → `prevFrame`.

---

## Enemy visuals (procedural Canvas 2D — no external images in MVP)

### Ghost
- White filled ellipse (body) with a wavy bottom edge drawn with quadratic bezier curves (3 bumps).
- Two dark ellipses for eyes.
- Soft white `shadowBlur` glow (16 px).

### Bat
- Two bezier-curve wings meeting at a small body ellipse.
- Small yellow dots for eyes.
- Dark purple shadow glow.

### Skull
- Rounded-rectangle face + two ellipse eye sockets + ellipse nasal cavity.
- Crack drawn with `lineTo` strokes.
- Pulsing red glow: `shadowBlur` oscillates 10–20 px using `Math.sin(performance.now() / 300)`.

---

## Special effects

### Red flash on skull hit
Full-canvas `fillRect` with `rgba(192,57,43,0.4)` drawn on `#game-canvas` while `performance.now() < state.flashEndTime`. Duration: 300 ms.

### Particle puffs
- Ghost hit: 20 particles, ghost-white to light blue, outward random velocity, gravity 0.15 px/frame², alpha fade ~400 ms.
- Bat hit: 10 particles, orange/yellow, same physics, alpha fade ~350 ms.
