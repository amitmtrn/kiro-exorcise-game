/**
 * Stage configuration — all balance values live here.
 * Changing numbers here never requires touching game logic.
 */

export type EnemyMix = {
  ghost: boolean
  bat: boolean
  skull: boolean
  lunger: boolean
  pumpkin: boolean
  boss: boolean
}

export type SpawnEdges = 'leftRight' | 'all'

export interface StageConfig {
  id: number
  name: string
  subtitle: string
  durationMs: number
  enemyMix: EnemyMix
  spawnEdges: SpawnEdges
  spawnIntervalMs: { ghost: number; bat: number; skull: number; lunger: number; pumpkin: number }
  speedMultiplier: number
  maxEnemies: number
}

export const STAGES: StageConfig[] = [
  {
    id: 1,
    name: 'Stage 1',
    subtitle: 'The Graveyard',
    durationMs: 45_000,
    enemyMix: { ghost: true, bat: false, skull: false, lunger: false, pumpkin: false, boss: false },
    spawnEdges: 'leftRight',
    spawnIntervalMs: { ghost: 3000, bat: 99999, skull: 99999, lunger: 99999, pumpkin: 99999 },
    speedMultiplier: 0.8,
    maxEnemies: 4,
  },
  {
    id: 2,
    name: 'Stage 2',
    subtitle: 'Haunted Forest',
    durationMs: 50_000,
    enemyMix: { ghost: true, bat: true, skull: false, lunger: false, pumpkin: false, boss: false },
    spawnEdges: 'all',
    spawnIntervalMs: { ghost: 2500, bat: 1500, skull: 99999, lunger: 99999, pumpkin: 99999 },
    speedMultiplier: 1.0,
    maxEnemies: 5,
  },
  {
    id: 3,
    name: 'Stage 3',
    subtitle: 'The Crypt',
    durationMs: 50_000,
    enemyMix: { ghost: true, bat: true, skull: true, lunger: false, pumpkin: false, boss: false },
    spawnEdges: 'all',
    spawnIntervalMs: { ghost: 2000, bat: 1200, skull: 9000, lunger: 99999, pumpkin: 99999 },
    speedMultiplier: 1.2,
    maxEnemies: 6,
  },
  {
    id: 4,
    name: 'Stage 4',
    subtitle: "Witch's Tower",
    durationMs: 55_000,
    enemyMix: { ghost: true, bat: true, skull: true, lunger: true, pumpkin: true, boss: false },
    spawnEdges: 'all',
    spawnIntervalMs: { ghost: 2000, bat: 1000, skull: 8000, lunger: 4000, pumpkin: 5000 },
    speedMultiplier: 1.4,
    maxEnemies: 6,
  },
  {
    id: 5,
    name: 'Stage 5',
    subtitle: 'The Boss',
    durationMs: 60_000,
    enemyMix: { ghost: false, bat: false, skull: false, lunger: false, pumpkin: false, boss: true },
    spawnEdges: 'all',
    spawnIntervalMs: { ghost: 4000, bat: 99999, skull: 99999, lunger: 99999, pumpkin: 99999 },
    speedMultiplier: 1.0,
    maxEnemies: 4,
  },
]
