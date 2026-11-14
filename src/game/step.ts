/**
 * One game-time step of a playing game: boss spawn, spawners, movement, enemies
 * reaching the centre, boss attacks. Extracted from the loop so single-player
 * and every two-player seat run exactly the same simulation.
 * `canvasW` / `canvasH` are the size of the area being played (a seat passes its
 * half: W/2 × H).
 */

import {
  setEnemies, setParticles, setScoreLabels, decrementLife, resetCombo, incrementMissed, tickShake,
} from './state'
import type { GameState } from './state'
import { tickBoss } from './enemies/bossPhases'
import { tickSpawners } from './enemies/spawn'
import { moveEnemies, cullExitedEnemies } from './enemies/movement'
import { splitReached } from './enemies/reach'
import { tickParticles, tickScoreLabels } from './particles'
import { tickKnocks } from './knock'
import { tickCallouts } from './callouts'
import { spawnBoss } from './round'
import { bossDue, withKingWarning } from './finale'
import { sfxLifeLost } from '../audio/index'

/** Advances the simulation by `simMs` of game time (hit-stop already removed). */
export function stepSimulation(state: GameState, simMs: number, displayW: number, displayH: number): GameState {
  // Screen shake counts down with elapsed time (set by resolveHits)
  state = tickShake(state, simMs)

  // Boss stages: spawn the boss once (stage 5 at once, the stage-6 Hollow King at its entrance time)
  state = withKingWarning(state, displayW, displayH)
  if (bossDue(state)) {
    state = spawnBoss(state, displayW, displayH)
  }

  state = tickSpawners(state, simMs, displayW, displayH)

  const movedEnemies = cullExitedEnemies(
    moveEnemies(state.enemies, simMs, displayW, displayH),
    displayW,
    displayH,
  )
  state = setEnemies(state, movedEnemies)

  // Enemies reaching their target cost a life (never in the bonus round, never flybys)
  const { survivors, missed: missedCount } = splitReached(state.enemies, state.bonus, displayW, displayH)
  state = setEnemies(state, survivors)
  for (let i = 0; i < missedCount; i++) {
    if (state.phase === 'gameover') break // nothing else happens after the last life
    state = decrementLife(state)
    state = resetCombo(state)
    state = incrementMissed(state)
    try { sfxLifeLost() } catch { /* audio not ready */ }
  }

  // Boss attacks: a lunge that lands costs a life (tickBoss resets the combo)
  const livesBeforeBoss = state.lives
  state = tickBoss(state, displayW, displayH)
  if (state.lives < livesBeforeBoss) {
    try { sfxLifeLost() } catch { /* audio not ready */ }
  }
  return state
}

/** Keeps shake, particles, knocks, call-outs and labels expiring on screens where the simulation is not running. */
export function tickEffects(s: GameState, ms: number): GameState {
  s = tickShake(s, ms)
  s = setParticles(s, tickParticles(s.particles, ms))
  s = { ...s, knocks: tickKnocks(s.knocks, ms), callouts: tickCallouts(s.callouts, ms) }
  return setScoreLabels(s, tickScoreLabels(s.scoreLabels, ms))
}
