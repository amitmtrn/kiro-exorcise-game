/**
 * Stage configuration — all balance values live here.
 * Changing numbers here never requires touching game logic.
 */

import type { WaveScript, BonusRound } from './waves'
import { STAGE_SCRIPTS, BONUS_ROUND } from './waves'
import type { GameState } from './state'
import type { VariantType } from './enemies/variants'

export type EnemyMix = {
  ghost: boolean
  bat: boolean
  skull: boolean
  lunger: boolean
  pumpkin: boolean
  boss: boolean
}

export type SpawnEdges = 'leftRight' | 'all'

/** A scripted spawn of a new ghost (more-content R5.2); `wisp` spawns a pair. */
export interface VariantEvent { atMs: number; kind: VariantType }

/** Finale stage settings (more-content R5, R6). */
export interface FinaleConfig {
  /** Stage clock time the Hollow King enters. */
  bossAtMs: number
  /** The arrival banner shows this long before the boss enters. */
  warnBeforeMs: number
  /** No skulls spawn in the last `skullQuietMs` before the boss. */
  skullQuietMs: number
}

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
  /** Wave script (path mix, scripted events, intensity curve). Absent → original spawner (boss stage). */
  waves?: WaveScript
  /** A bonus round plays after this stage's summary, before the next stage's title card. */
  bonusAfter?: BonusRound
  /** Scripted new-ghost spawns, consumed in order by the spawner like wave events. */
  variantEvents?: VariantEvent[]
  /** Present on the last stage: the finale boss and its timing. */
  finale?: FinaleConfig
  /** Hint lines shown on the stage title card (one per new ghost). */
  hints?: string[]
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
    waves: STAGE_SCRIPTS[1],
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
    waves: STAGE_SCRIPTS[2],
    bonusAfter: BONUS_ROUND,
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
    waves: STAGE_SCRIPTS[3],
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
    waves: STAGE_SCRIPTS[4],
  },
  {
    id: 5,
    name: 'Stage 5',
    subtitle: 'The Boss',
    durationMs: 60_000,
    enemyMix: { ghost: false, bat: false, skull: false, lunger: false, pumpkin: false, boss: true },
    spawnEdges: 'all',
    spawnIntervalMs: { ghost: 99999, bat: 99999, skull: 99999, lunger: 99999, pumpkin: 99999 },
    speedMultiplier: 1.0,
    maxEnemies: 4,
  },
  {
    id: 6,
    name: 'Stage 6',
    subtitle: 'The Midnight Finale',
    durationMs: 60_000,
    enemyMix: { ghost: false, bat: false, skull: true, lunger: false, pumpkin: false, boss: true },
    spawnEdges: 'all',
    spawnIntervalMs: { ghost: 99999, bat: 99999, skull: 9000, lunger: 99999, pumpkin: 99999 },
    speedMultiplier: 1.0,
    maxEnemies: 5,
    variantEvents: [
      { atMs: 2_000, kind: 'wisp' },
      { atMs: 6_500, kind: 'mirror' },
      { atMs: 11_000, kind: 'blink' },
      { atMs: 14_000, kind: 'wisp' },
      { atMs: 14_000, kind: 'blink' },
      { atMs: 16_500, kind: 'mirror' },
    ],
    finale: { bossAtMs: 22_000, warnBeforeMs: 3_000, skullQuietMs: 7_000 },
    hints: [
      '∞  TWIN WISPS: hit both',
      '▮  MIRROR: wave twice, then swat',
      '◆  BLINK: swat while solid',
    ],
  },
]

/** Title-card / HUD label for the current stage, or for the bonus round when `state.bonus` is set. */
export function stageLabel(state: Pick<GameState, 'stage' | 'bonus'>): { name: string; subtitle: string } {
  if (state.bonus) return { name: BONUS_ROUND.name, subtitle: BONUS_ROUND.subtitle }
  const cfg = STAGES[state.stage - 1]
  return { name: cfg.name, subtitle: cfg.subtitle }
}
