# Stages — Requirements (P1)

## R1 — Motion-based UI

**R1.1** The start screen shows a pumpkin icon and the prompt "Wave your hands over the pumpkin to start". Sustained motion (≥ 0.5 s) inside the pumpkin hitbox triggers game start — no mouse or keyboard needed.

**R1.2** The game-over screen shows a "Retry Stage" motion button and a "Main Menu" motion button, each with a 1 s fill-bar visual indicator.

---

## R2 — Stage structure

**R2.1** The game has **5 stages**. Each stage has a title card ("Stage N — Name") with a 3-second countdown before enemies spawn.

**R2.2** Stage definitions live in `src/game/stages.ts` as a typed config array. Changing balance values (speed, spawn rate, duration) requires editing only that file.

**R2.3** Stage config shape:
```ts
interface StageConfig {
  id: number
  name: string
  durationMs: number          // 45 000–60 000
  enemyMix: EnemyMixConfig
  spawnIntervalMs: { min: number; max: number }
  speedMultiplier: number
}
```

**R2.4** The five stages:
1. **The Graveyard** — slow ghosts from left/right only, 45 s.
2. **Haunted Forest** — ghosts + bats from all sides, 50 s.
3. **The Crypt** — adds skulls, faster spawns, 50 s.
4. **Witch's Tower** — adds lunging enemies (pause → lunge behaviour) and pumpkin enemies (2 hits), 55 s.
5. **The Boss** — single giant ghost, ~10 hits, health bar, sends small ghosts, 60 s.

---

## R3 — Between stages

**R3.1** A score summary screen shows: ghosts banished, bats banished, enemies missed, best combo, and a star rating (1–3 stars based on lives remaining and misses).

**R3.2** A "Next Stage" motion button advances after 3 s or immediately on hand motion.

---

## R4 — Combo multiplier

**R4.1** Consecutive hits without an enemy reaching center raise the multiplier: x2 at 3 hits, x3 at 6, x4 at 10+.

**R4.2** The multiplier resets to x1 when an enemy reaches the center.

**R4.3** The current multiplier is displayed in the HUD bottom-right (hidden at x1).

---

## R5 — Lives and progression

**R5.1** Lives carry across stages. Losing all 3 lives → game over (not stage over).

**R5.2** On game over, "Retry Stage" restarts the current stage with 3 lives; "Main Menu" returns to the start screen.

**R5.3** High score (total across all stages cleared) persisted in `localStorage`.

---

## R6 — Pumpkin and lunging enemies (Stage 4+)

**R6.1** A pumpkin enemy requires **2 hits** to banish. After the first hit it flashes orange and shrinks slightly.

**R6.2** A lunging enemy pauses 1 m from the player (screen edge), winds up with a 0.5 s animation, then lunges at double speed toward the center.
