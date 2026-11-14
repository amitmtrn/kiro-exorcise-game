/**
 * Background music (music-v2): 3-voice procedural sequencer on a look-ahead
 * scheduler, combo intensity layers, title and boss themes, 0.5 s crossfades.
 * See src/audio/music/ and .kiro/specs/music-v2/.
 *
 * The engine is created lazily so importing this module never touches the
 * AudioContext (autoplay policy: the game is silent until the first gesture).
 */

import { getAudioContext, getMasterGain } from './context'
import { createMusicEngine, type MusicEngine } from './music/engine'
import { trackForStage, type TrackId } from './music/patterns'
import { MUSIC_GAIN } from './recipes'

let engine: MusicEngine | null = null
let musicBus: GainNode | null = null
let wanted: TrackId | null = null     // last requested track (cheap idempotence check)
let lastCombo = 1
let pausedWanted = typeof document !== 'undefined' && document.hidden

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => setMusicPaused(document.hidden))
}

/** One gain stage in front of the master bus: the music loudness table entry (playtest-polish R6.1). */
function getMusicBus(): GainNode {
  if (!musicBus) {
    musicBus = getAudioContext().createGain()
    musicBus.gain.value = MUSIC_GAIN
    musicBus.connect(getMasterGain())
  }
  return musicBus
}

function getEngine(): MusicEngine {
  if (!engine) {
    engine = createMusicEngine({ ctx: getAudioContext(), destination: getMusicBus() })
    engine.setCombo(lastCombo)
    if (pausedWanted) engine.setPaused(true)
  }
  return engine
}

function request(id: TrackId): void {
  if (wanted === id) return
  wanted = id   // set first: a failing AudioContext must not be retried every frame
  getEngine().play(id)
}

/** Stages 1–4 play their own theme; stage 5 plays the boss theme, stage 6 the finale theme. */
export function startMusic(stage: number): void {
  request(trackForStage(stage))
}

export function startTitleMusic(): void {
  request('title')
}

export function stopMusic(): void {
  wanted = null
  if (engine) engine.stop()
}

/** Combo multiplier (1–4) selects the active layers. */
export function setMusicCombo(combo: number): void {
  if (combo === lastCombo) return
  lastCombo = combo
  if (engine) engine.setCombo(combo)
}

/** Pause/resume the scheduler with tab visibility. */
export function setMusicPaused(p: boolean): void {
  if (engine) engine.setPaused(p)
  pausedWanted = p
}

/** Test hook: forget the engine and request state. */
export function resetMusicForTests(): void {
  if (engine) engine.dispose()
  engine = null
  musicBus = null
  wanted = null
  lastCombo = 1
  pausedWanted = false
}
