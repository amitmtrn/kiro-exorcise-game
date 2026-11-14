/**
 * Exorcist Card session (exorcist-card R1, R2, R3.3): owns the run stats, the
 * single in-memory snapshot and the preview state, and enforces the lifecycle:
 * the snapshot is dropped when the player leaves the game-over / victory
 * screen (retry, menu, play again), on a new game, and never survives a run.
 *
 * Generic over the snapshot (`P`) and card (`C`) types, with all canvas, camera
 * and download work injected, so it is unit-testable without a DOM.
 */

import type { GamePhase } from '../game/state'
import { createRunStats, observeRun, totalBanished } from '../game/runStats'
import type { RunStats } from '../game/runStats'
import { rankForScore } from '../game/rank'
import { STAGES } from '../game/stages'
import { createSnapshotStore } from './snapshotStore'
import type { SnapshotStore } from './snapshotStore'
import type { CardData } from './layout'

export interface SessionState {
  phase: GamePhase
  stage: number
  stageBanished: number
  combo: number
  score: number
}

export interface SessionDeps<P, C> {
  /** Reads the camera into a new snapshot. Called only when a moment is accepted. */
  grab: (displayW: number, displayH: number) => P
  releaseSnapshot: (p: P) => void
  /** Builds the card image; `photo === null` draws the silhouette. */
  compose: (data: CardData, photo: P | null) => C
  releaseCard: (c: C) => void
  /** Saves the card locally; resolves true on success. */
  download: (c: C) => Promise<boolean>
  /** Extra card fields read each time the card is built (two-player label and badge). */
  extra?: () => Partial<CardData>
}

export type SaveStatus = 'saved' | 'failed'

const isEndScreen = (p: GamePhase | null) => p === 'gameover' || p === 'victory'

export class CardSession<P, C> {
  private store: SnapshotStore<P>
  private stats: RunStats = createRunStats()
  private phase: GamePhase | null = null
  private last: SessionState | null = null
  private cardImage: C | null = null
  private photoOff = false
  private saving = false
  private status: SaveStatus | null = null

  constructor(private deps: SessionDeps<P, C>) {
    this.store = createSnapshotStore<P>(deps.releaseSnapshot)
  }

  get isOpen(): boolean { return this.cardImage !== null }
  get hasPhoto(): boolean { return this.store.has() }
  /** True when the silhouette variant is showing (chosen, or no snapshot exists). */
  get noPhoto(): boolean { return this.photoOff || !this.store.has() }
  get card(): C | null { return this.cardImage }
  get runStats(): RunStats { return this.stats }

  /** Call once per tick with the state at the top of the tick. */
  observe(s: SessionState, displayW: number, displayH: number): void {
    const leftEndScreen = isEndScreen(this.phase) && s.phase !== this.phase
    if (s.phase === 'start' || leftEndScreen) this.reset()
    this.phase = s.phase
    if (s.phase === 'start') { this.last = null; return }

    const { stats, moment } = observeRun(this.stats, s)
    this.stats = stats
    if (moment) {
      // A failed camera read must never break the game; the card then uses the silhouette.
      try { this.store.offer(moment, () => this.deps.grab(displayW, displayH)) } catch { /* ignore */ }
    }
    this.last = s
  }

  /** The player chose the card (button, click or key). Ignored outside the end screens. */
  open(): boolean {
    if (!this.last || !isEndScreen(this.last.phase)) return false
    if (this.cardImage !== null) return true
    this.photoOff = false
    this.build()
    return true
  }

  close(): void {
    this.dropCard()
  }

  togglePhoto(): void {
    if (!this.isOpen || !this.store.has()) return
    this.photoOff = !this.photoOff
    this.build()
  }

  /** Saves the open card locally. Never called automatically. */
  async save(): Promise<void> {
    const c = this.cardImage
    if (c === null || this.saving) return
    this.saving = true
    try {
      this.status = (await this.deps.download(c)) ? 'saved' : 'failed'
    } catch {
      this.status = 'failed'
    } finally {
      this.saving = false
    }
  }

  /** One-shot result of the last save, for the UI toast. */
  takeStatus(): SaveStatus | null {
    const s = this.status
    this.status = null
    return s
  }

  /** Drops the snapshot, the card and the run stats (retry / menu / new game). */
  reset(): void {
    this.store.discard()
    this.dropCard()
    this.stats = createRunStats()
    this.status = null
  }

  private dropCard(): void {
    if (this.cardImage !== null) {
      const old = this.cardImage
      this.cardImage = null
      try { this.deps.releaseCard(old) } catch { /* ignore */ }
    }
    this.photoOff = false
  }

  private build(): void {
    const s = this.last
    if (!s) return
    const old = this.cardImage
    const photo = this.photoOff ? null : this.store.get()
    const data: CardData = {
      score: s.score,
      bestCombo: this.stats.bestCombo,
      stage: this.stats.stage,
      stageCount: STAGES.length,
      banished: totalBanished(this.stats),
      rank: rankForScore(s.score),
      ...(this.deps.extra?.() ?? {}),
    }
    this.cardImage = this.deps.compose(data, photo)
    if (old !== null) { try { this.deps.releaseCard(old) } catch { /* ignore */ } }
  }
}
