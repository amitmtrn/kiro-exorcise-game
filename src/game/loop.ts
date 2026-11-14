/**
 * Game loop — drives all phases via requestAnimationFrame.
 */

import { drawWebcamFrame } from '../webcam/capture'
import { drawWebcamTint } from './atmosphere'
import { captureFrame, calibrateDiffThreshold, computeMotionMask } from '../webcam/diff'
import { getMotionGrid, setMotionGrid, resetMotionGrid, gridForLevel } from '../webcam/grid'
import {
  createFrameBudget, stepFrameBudget, getQuality, setQualityLevel, setQualityAvg, getQualityInfo, resetQuality,
} from './quality'
import {
  createInitialState,
  tickTimer,
  setParticles,
  setScoreLabels,
  saveHighScore,
} from './state'
import type { GameState } from './state'
import { stepSimulation, tickEffects } from './step'
import { resolveHits, updateMotionPixels, lastMotionPixels } from './collision'
import { resetHitGates } from './hitGate'
import { tickParticles, tickScoreLabels } from './particles'
import { tickKnocks } from './knock'
import { splitHitStop } from './hitstop'
import { tickCallouts } from './callouts'
import { renderFrame } from './render'
import { renderHUD, hudFontSize, HUD_FONT_FAMILY, createHudPulse, drawMuteButton, muteButtonRect2P } from '../ui/hud'
import type { HudPulse } from '../ui/hud'
import { drawDivider, drawSeatOverlay, renderTwoPlayerSummary, renderTwoPlayerFinal, resetFinalScreen, resetSummaryScreen, FINAL_INPUT_DELAY_MS } from '../ui/splitscreen'
import { createTwoPlayer, tickTwoPlayer, advanceSession, seatStatus, winnerOf } from './twoPlayer'
import type { TwoPlayerState } from './twoPlayer'
import { SEATS, halfOffset, halfWidth, displayPointsInHalf } from './halves'
import type { Seat } from './halves'
import {
  renderStartScreen,
  renderStageTitle,
  renderSummary,
  renderGameOver,
  renderVictory,
  resetVictoryScreen,
  resetStartScreen,
  resetGameOverScreen,
} from '../ui/screens'
import {
  tickRound,
  startGame,
  retryStage,
  advanceToNextStage,
} from './round'
import { isPanelOpen, closePanel, renderSettingsPanel } from '../ui/settingsPanel'
import { resolveStartRequest, setPlayerMode } from './playerMode'
import type { PlayerMode, StartRequest } from './playerMode'
import { CardSession } from '../card/session'
import { grabMirroredSnapshot, releaseSnapshot } from '../card/snapshot'
import { grabHalfSnapshot } from '../card/halfSnapshot'
import { badgeFor, cardFileName, seatLabel } from '../card/twoPlayerCard'
import { composeCard } from '../card/draw'
import { downloadCanvasPng } from '../card/download'
import { CardPreview, cardKeyAction, offerHit, lockEndButtons } from '../ui/cardScreen'
import { SeatCard, routeSeatClick, sharedButtonsLive } from '../ui/seatCard'
import type { CardAction } from '../ui/cardScreen'
import { sfxStageClear, startMusic, startTitleMusic, stopMusic, setMusicCombo } from '../audio/index'
import type { DemoRuntime } from '../demo/runtime'
import type { DemoView } from '../demo/driver'
import { handRadius } from '../demo/driver'
import { drawDemoBackdrop, drawDemoBadge, drawGhostHand, grabDemoPortrait } from '../demo/overlay'

let rafId = 0

/** True while the title screen of a 1P game is showing (main.ts: the `G` demo toggle works only there). */
let titleVisible = false
export function isStartScreenVisible(): boolean { return titleVisible }

/** True while a two-player game is on screen (main.ts uses it to place the mute tap target). */
let twoPlayerActive = false
export function isTwoPlayerActive(): boolean { return twoPlayerActive }

// Keyboard fallback for the motion START button — the start screen says
// "Press Space". main.ts calls requestStart(); the start branch consumes it.
let startRequest: StartRequest | null = null
/** Space starts in the remembered mode; keys 1 / 2 pick the mode (two-player R6.2). */
export function requestStart(req: StartRequest = 'last'): void { startRequest = req }

// Exorcist Card input (exorcist-card R1): keys and clicks are queued by main.ts and
// consumed on the game-over / victory screens only, so a stray key does nothing.
type CardInput = { kind: 'key'; key: string } | { kind: 'click'; x: number; y: number }
let cardInputs: CardInput[] = []
let onEndScreen = false
let cardOpen = false

/** Forwards a key; returns true when the card flow wants it (caller may preventDefault). */
export function handleCardKey(key: string, repeat = false): boolean {
  if (repeat) return onEndScreen && cardKeyAction(key, cardOpen) !== null // held key: swallow, never re-trigger
  if (!onEndScreen || cardKeyAction(key, cardOpen) === null) return false
  cardInputs.push({ kind: 'key', key })
  return true
}

/** True while the card preview covers the end screen. */
export function isCardPreviewOpen(): boolean { return cardOpen }

/** Forwards a click / tap in canvas pixels; returns true when it was queued. */
export function handleCardPointer(x: number, y: number): boolean {
  if (!onEndScreen) return false
  cardInputs.push({ kind: 'click', x, y })
  return true
}

// Two-player cards (two-player-card): clicks on the 2P end screen are routed to the half that contains them.
let seatCardsRef: Array<SeatCard<HTMLCanvasElement>> | null = null
let twoFinal = false
let seatClickW = 0

/** Forwards a click / tap in canvas pixels on the 2P end screen; returns true when it was queued for a half. */
export function handleSeatCardPointer(x: number, y: number): boolean {
  if (!twoFinal || !seatCardsRef || seatClickW <= 0) return false
  const r = routeSeatClick(x, y, seatClickW)
  seatCardsRef[r.seat].queueClick(r.x, r.y)
  return true
}

/** hit-detection-fix T4: tell the player to hold still while we sample noise. */
function drawCalibratingBanner(ctx: CanvasRenderingContext2D): void {
  const { width: W, height: H } = ctx.canvas
  ctx.save()
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(13, 0, 20, 0.6)'
  ctx.fillRect(0, 0, W, H)
  const msg = 'Calibrating… hold still 👻'
  let px = hudFontSize(W)
  ctx.font = `bold ${px}px ${HUD_FONT_FAMILY}`
  const mw = typeof ctx.measureText === 'function' ? (ctx.measureText(msg)?.width ?? 0) : 0
  if (mw > W * 0.9 && mw > 0) { px = Math.max(12, Math.floor(px * W * 0.9 / mw)); ctx.font = `bold ${px}px ${HUD_FONT_FAMILY}` }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffd166'
  ctx.shadowColor = '#ffd166'
  ctx.shadowBlur = 14
  ctx.fillText(msg, W / 2, H / 2)
  ctx.restore()
}

/**
 * `opts.demo` (demo-mode): camera-free run. `video` is then null, no camera frame is read and the motion
 * frames come from the demo runtime; everything after that point is the normal loop.
 */
export async function startLoop(
  video: HTMLVideoElement | null,
  webcamCtx: CanvasRenderingContext2D,
  gameCtx: CanvasRenderingContext2D,
  initialStage = 1,
  opts: { demo?: DemoRuntime } = {},
): Promise<() => void> {
  const demo = opts.demo ?? null
  activeDemo = demo
  twoPlayerActive = false
  startRequest = null // a Space pressed during permission/onboarding must not skip the title
  // Demo mode is always full quality and the full 320 × 180 grid, so seeded runs replay identically (R3.2).
  if (demo) { resetQuality(); resetMotionGrid() } else setMotionGrid(gridForLevel(getQuality()))
  const grid0 = getMotionGrid()
  const currentCanvas = document.createElement('canvas')
  currentCanvas.width = grid0.w; currentCanvas.height = grid0.h
  const currentCtx = currentCanvas.getContext('2d')!

  const prevCanvas = document.createElement('canvas')
  prevCanvas.width = grid0.w; prevCanvas.height = grid0.h
  const prevCtx = prevCanvas.getContext('2d')!

  // Show the first webcam frame + a banner while the 1 s noise calibration runs (no camera in demo mode)
  if (!demo) {
    drawWebcamFrame(webcamCtx, video!)
    drawWebcamTint(webcamCtx)
    drawCalibratingBanner(gameCtx)
    await calibrateDiffThreshold(currentCtx, video!, 1000)
    captureFrame(prevCtx, video!)
  }
  startRequest = null // ...nor one pressed during the 1 s calibration above

  let state: GameState = createInitialState(initialStage)

  // Exorcist Card: snapshot + run stats live in memory only and die with the screen.
  // Demo mode: a procedural placeholder portrait instead of a camera snapshot, a DEMO chip on the card,
  // and a download that writes nothing (demo-mode R6.3).
  const session = new CardSession<HTMLCanvasElement, HTMLCanvasElement>({
    grab: demo ? (w, h) => grabDemoPortrait(w, h) : (w, h) => grabMirroredSnapshot(video!, w, h),
    releaseSnapshot,
    compose: (data, photo) => composeCard(
      data,
      photo ? { source: photo, width: photo.width, height: photo.height } : null,
    ),
    releaseCard: releaseSnapshot,
    // demo: nothing is written, so the save must never report "saved"
    download: demo ? async () => false : (c) => downloadCanvasPng(c),
    ...(demo ? { extra: () => ({ badge: 'DEMO' }) } : {}),
  })
  const preview = new CardPreview()

  // Two-player cards: one session, preview and offer per seat. Each sees only its own seat's state,
  // its own half of the camera and its own half of the motion points. Memory only.
  let twoNow: TwoPlayerState | null = null
  const seatPoints: Array<ReturnType<typeof displayPointsInHalf>> = [[], []]
  const seatSessions = SEATS.map((seat) => new CardSession<HTMLCanvasElement, HTMLCanvasElement>({
    grab: (w, h) => grabHalfSnapshot(video!, seat, w, h),
    releaseSnapshot,
    compose: (data, photo) => composeCard(
      data,
      photo ? { source: photo, width: photo.width, height: photo.height } : null,
    ),
    releaseCard: releaseSnapshot,
    download: (c) => downloadCanvasPng(c, cardFileName(seat)),
    extra: () => ({ playerLabel: seatLabel(seat), badge: twoNow ? badgeFor(winnerOf(twoNow), seat) : undefined }),
  }))
  const seatCards = SEATS.map((seat) => new SeatCard<HTMLCanvasElement>(seat, seatSessions[seat], () => seatPoints[seat]))
  const cardCanvases: HTMLCanvasElement[] = []
  /** Each half's motion points for its own copies of the shared buttons. */
  const seatSources: [() => typeof seatPoints[0], () => typeof seatPoints[0]] = [() => seatPoints[0], () => seatPoints[1]]
  let finalAt = 0
  /** Per seat: a boss was on that seat's field at the previous tick (so its disappearance means it was defeated). */
  const seatHadBoss: [boolean, boolean] = [false, false]
  seatCardsRef = seatCards
  twoFinal = false

  /** Drops every 2P card: snapshots, run stats, previews, queued clicks. */
  function resetSeatCards(): void {
    for (const c of seatCards) c.reset()
    for (const s of seatSessions) s.reset()
    seatHadBoss[0] = seatHadBoss[1] = false
    twoFinal = false
  }
  cardInputs = []
  cardOpen = false
  onEndScreen = false

  function runCardAction(a: CardAction | 'open', now: number): void {
    if (a === 'open') { if (session.open()) { preview.open(now); lockEndButtons(now) } }
    else if (a === 'close') { session.close(); lockEndButtons(now) }
    else if (a === 'toggle') session.togglePhoto()
    else void session.save()
  }

  /** Applies queued keys / clicks. Returns nothing; state lives in `session`. */
  function drainCardInputs(now: number): void {
    const queue = cardInputs
    cardInputs = []
    for (const inp of queue) {
      if (inp.kind === 'key') {
        const a = cardKeyAction(inp.key, session.isOpen)
        if (a) runCardAction(a, now)
      } else if (session.isOpen) {
        const a = preview.hit(inp.x, inp.y)
        if (a) runCardAction(a, now)
      } else if (offerHit(inp.x, inp.y)) {
        runCardAction('open', now)
      }
    }
    const st = session.takeStatus()
    if (st) preview.setStatus(st === 'saved' ? 'Download started!' : "Couldn't save the card", now)
  }

  /** Renders the card preview over the end screen; true while it is open. */
  function renderCardPreview(now: number): boolean {
    if (!session.isOpen || !session.card) return false
    const a = preview.render(gameCtx, now, session.card, session.noPhoto, session.hasPhoto)
    if (a) runCardAction(a, now)
    return true
  }
  let lastTimestamp = 0
  let budget = createFrameBudget(getQuality())
  let prevPhase = state.phase

  // ── Two-player session (two-player spec). `two` is non-null while a 2P game is on screen. ──
  let two: TwoPlayerState | null = null
  let prevTwoPhase: TwoPlayerState['phase'] | null = null
  const halfCanvases: HTMLCanvasElement[] = []
  const pulses: HudPulse[] = [] // created on first use per seat
  const hudCanvases: HTMLCanvasElement[] = [] // transparent per-seat HUD layers, drawn above the divider
  /** True while the start screen is the visible screen (entry detection for its lock-out). */
  let startVisible = false
  /** The settings panel was open on the previous title tick (closing restarts the buttons' lock-out). */
  let panelWasOpen = false
  /** True while the game-over screen is the visible screen (entry detection for its lock-out). */
  let gameOverVisible = false
  /** Action requested by a 2P screen button during a tick; applied after the tick returns (so it is not overwritten). */
  let twoAction: 'next' | 'again' | 'menu' | null = null

  /** Start a game in `mode` (remembered for the session). */
  function begin(requested: PlayerMode): void {
    const mode: PlayerMode = demo ? 1 : requested // the attract mode has no camera for a 2P split: always one player
    if (!demo) setPlayerMode(mode) // the attract mode must not overwrite the session's remembered mode (R7.1)
    gameOverVisible = false
    if (mode === 2) {
      two = createTwoPlayer()
      prevTwoPhase = null
      twoPlayerActive = true // mute tap target switches immediately, not on the first 2P tick
    } else if (demo) {
      demo.onRunStart() // every loop of the attract mode replays the same game
      state = { ...startGame(state), stage: demo.startStage }
    } else {
      state = startGame(state)
    }
  }

  /** True once the 2 PLAYERS button (or key) created a session this tick. */
  function twoStarted(): boolean { return two !== null }

  /** Back to the title screen from the two-player end screen. */
  function toMenu(): void {
    resetSeatCards()
    gameOverVisible = false
    two = null
    prevTwoPhase = null
    state = createInitialState(1)
    prevPhase = state.phase
    try { stopMusic() } catch { /* ignore */ }
  }

  function halfCtx(seat: Seat, w: number, h: number): CanvasRenderingContext2D {
    let c = halfCanvases[seat]
    if (!c) { c = document.createElement('canvas'); halfCanvases[seat] = c }
    if (c.width !== w) c.width = w
    if (c.height !== h) c.height = h
    return c.getContext('2d')!
  }

  function hudCtx(seat: Seat, w: number, h: number): CanvasRenderingContext2D {
    let c = hudCanvases[seat]
    if (!c) { c = document.createElement('canvas'); hudCanvases[seat] = c }
    if (c.width !== w) c.width = w
    if (c.height !== h) c.height = h
    const x = c.getContext('2d')!
    x.clearRect(0, 0, w, h)
    return x
  }

  /** One tick of a two-player game: simulate both seats, then draw the halves, divider and overlays. */
  function tickTwo(t: TwoPlayerState, deltaMs: number, now: number, W: number, H: number,
    cur: ImageData, prev: ImageData, frameIsNew: boolean): TwoPlayerState {
    const motion = t.phase === 'playing' ? { cur, prev, frameIsNew, now } : null
    t = tickTwoPlayer(t, deltaMs, W, H, motion)
    twoNow = t

    // Phase hooks (music / sfx), once per transition
    if (prevTwoPhase !== t.phase) {
      if (t.phase === 'final') finalAt = now // before any audio call, so a throwing one cannot leave the lock-out stale
      try {
        if (t.phase === 'playing') startMusic(t.stage)
        else if (t.phase === 'summary') { resetSummaryScreen(); sfxStageClear(); stopMusic() }
        else if (t.phase === 'final') {
          resetFinalScreen(); stopMusic()
          if (t.seats.some((s) => s.phase !== 'gameover')) sfxStageClear() // no jingle when both are out
        }
      } catch { /* ignore */ }
      prevTwoPhase = t.phase
    }
    if (t.phase === 'playing') {
      try { setMusicCombo(Math.max(...t.seats.filter((s) => s.phase === 'playing').map((s) => s.combo), 1)) } catch { /* ignore */ }
    }

    gameCtx.clearRect(0, 0, W, H)
    const hw = halfWidth(W)
    const huds: Array<[CanvasRenderingContext2D, Seat]> = []
    for (const seat of SEATS) {
      const s = t.seats[seat]
      const hctx = halfCtx(seat, hw, H)
      renderFrame(hctx, s, now, {
        banished: t.banished[seat],
        motionPixels: displayPointsInHalf(lastMotionPixels, seat, W),
      })
      const pulse = (pulses[seat] ??= createHudPulse())
      if (s.phase === 'playing') {
        const hud = hudCtx(seat, hw, H)
        renderHUD(hud, s, now, { pulse, showMute: false, label: `P${seat + 1}` })
        huds.push([hud, seat])
      } else pulse.lastCombo = 1
      if (t.phase === 'stageTitle' && s.phase === 'stageTitle') renderStageTitle(hctx, s)
      const status = seatStatus(t, seat)
      if (t.phase !== 'final' && (status === 'out' || status === 'cleared')) drawSeatOverlay(hctx, status, s.score, now)
      gameCtx.drawImage(hctx.canvas, halfOffset(seat, W), 0)
    }
    drawDivider(gameCtx, hw) // below the HUD text (R1.5)
    for (const [hud, seat] of huds) gameCtx.drawImage(hud.canvas, halfOffset(seat, W), 0)

    if (t.phase === 'summary') {
      renderTwoPlayerSummary(gameCtx, t, now, () => { twoAction = 'next' }, seatSources)
    } else if (t.phase === 'final') {
      // Per-player cards (two-player-card): each half draws its own offer / preview layer first, so the
      // shared buttons can be gated by what the cards are doing; the layers are composited above the overlay.
      twoFinal = true
      seatClickW = W
      const live = now - finalAt >= FINAL_INPUT_DELAY_MS
      for (const seat of SEATS) {
        const c = (cardCanvases[seat] ??= document.createElement('canvas'))
        if (c.width !== hw) c.width = hw
        if (c.height !== H) c.height = H
        const cctx = c.getContext('2d')!
        cctx.clearRect(0, 0, hw, H)
        seatCards[seat].render(cctx, now, live)
      }
      // A half's shared buttons wait for its own preview (open or just changed); the other half's open preview holds
      // them for at most PREVIEW_LOCK_MAX_MS, so one player cannot lock the other out (motion-ui-ergonomics R4.3).
      const buttonsLive = sharedButtonsLive([seatCards[0], seatCards[1]], now)
      renderTwoPlayerFinal(gameCtx, t, now,
        () => { twoAction = 'again' },
        () => { twoAction = 'menu' },
        buttonsLive,
        seatSources,
      )
      for (const seat of SEATS) gameCtx.drawImage(cardCanvases[seat], halfOffset(seat, W), 0)
      if (seatCards.some((c) => c.isOpen)) drawDivider(gameCtx, hw)
    }
    if (t.phase !== 'final') {
      twoFinal = false
      for (const c of seatCards) c.closePreview() // previews exist only on the end screen
    }
    drawMuteButton(gameCtx, muteButtonRect2P(W, hudFontSize(W))) // above the overlays so it stays visible
    return t
  }

  /** What the demo driver may see: the state at the top of the tick, like the screens (demo-mode design). */
  function demoView(now: number, w: number, h: number): DemoView {
    return {
      phase: state.phase, stage: state.stage, bonus: state.bonus, enemies: state.enemies, w, h, now,
      cardOpen: session.isOpen, hasPhoto: session.hasPhoto, noPhoto: session.noPhoto,
    }
  }

  /** Normal mode: the plain tick. Demo mode: fixed scaled step, then the ghost hand and the DEMO badge on top. */
  function tick(timestamp: number): void {
    if (!demo) { tickBody(timestamp); return }
    const step = demo.beginTick(timestamp)
    if (!step) { rafId = requestAnimationFrame(tick); return } // too soon after the last processed frame
    try {
      tickBody(timestamp, step.deltaMs)
      drawGhostHand(gameCtx, demo.hand, demo.trail, handRadius(gameCtx.canvas.height), performance.now())
      drawDemoBadge(gameCtx) // last: above the game, the card preview and the hand, in every phase
    } catch (err) {
      stopLoop() // also restores the patched clock, Math.random and score persistence
      throw err
    }
  }

  function tickBody(timestamp: number, forcedDeltaMs?: number): void {
    const deltaMs = forcedDeltaMs ?? (lastTimestamp === 0 ? 16 : Math.min(timestamp - lastTimestamp, 100))
    const rawMs = lastTimestamp === 0 ? 0 : timestamp - lastTimestamp
    lastTimestamp = timestamp
    titleVisible = state.phase === 'start' && !two
    const now = performance.now()
    const displayW = webcamCtx.canvas.width
    const displayH = webcamCtx.canvas.height

    // Exorcist Card bookkeeping: run stats, snapshots at fun moments, discard when
    // leaving the end screens (retry / menu / play again). Memory only.
    // The 1P session is not fed in two-player mode: each seat has its own card session (see two-player-card).
    if (two) {
      onEndScreen = false
      cardInputs = []
      cardOpen = false
    } else {
      session.observe(state, displayW, displayH)
      onEndScreen = state.phase === 'gameover' || state.phase === 'victory'
      if (onEndScreen) drainCardInputs(now)
      else cardInputs = []
      cardOpen = session.isOpen
    }

    // Adaptive quality (playtest-polish R1, R2.3): never in demo mode. In auto mode the monitor decides;
    // a pinned level (?quality=) never moves. A new grid size runs the change protocol below.
    let gridChanged = false
    if (!demo) {
      // The average is tracked in every mode (the debug overlay shows it); only auto mode applies the level.
      const next = stepFrameBudget({ ...budget, level: getQuality() }, rawMs)
      if (getQualityInfo().mode === 'auto') {
        budget = next
        setQualityLevel(budget.level)
      } else budget = { ...next, level: budget.level }
      setQualityAvg(budget.avgMs)
      if (setMotionGrid(gridForLevel(getQuality()))) {
        const g = getMotionGrid()
        currentCanvas.width = g.w; currentCanvas.height = g.h
        prevCanvas.width = g.w; prevCanvas.height = g.h // resizing blanks both canvases
        captureFrame(prevCtx, video!)
        updateMotionPixels({ points: [], sampled: 0, moved: 0, changed: true }, displayW, displayH) // drop points of the old grid
        state = resetHitGates(state)
        if (two) two = { ...two, seats: [resetHitGates(two.seats[0]), resetHitGates(two.seats[1])] }
        gridChanged = true
      }
    }
    const grid = getMotionGrid()

    let currentData: ImageData
    let prevData: ImageData
    if (demo) {
      // Demo mode: a procedural backdrop and the scripted hand's frames stand in for the camera.
      drawDemoBackdrop(webcamCtx)
      drawWebcamTint(webcamCtx)
      const f = demo.frame(demoView(now, displayW, displayH))
      currentData = f.cur
      prevData = f.prev
    } else {
      // Always draw webcam feed, then the haunted purple tint (spooky-skin R1.1)
      drawWebcamFrame(webcamCtx, video!)
      drawWebcamTint(webcamCtx)

      // Capture motion frame every tick for motion buttons to work on all screens
      captureFrame(currentCtx, video!)
      currentData = currentCtx.getImageData(0, 0, grid.w, grid.h)
      prevData = prevCtx.getImageData(0, 0, grid.w, grid.h)
    }

    // Whole-frame motion mask: drives the motion buttons + debug overlay, and
    // tells us whether the camera actually delivered a new frame this tick.
    const mask = computeMotionMask(currentData, prevData, grid.w, grid.h)
    // On the tick of a grid change the previous frame was just re-captured: no new camera frame (R2.3).
    const frameIsNew = mask.changed && !gridChanged
    updateMotionPixels(gridChanged ? { ...mask, changed: false } : mask, displayW, displayH)

    // ── Two-player game (own state machine; the 1P branches below are untouched) ──
    if (two) {
      startVisible = false
      twoPlayerActive = true
      twoAction = null
      // Per-player highlights: each seat's own state feeds only that seat's card session.
      for (const seat of SEATS) {
        seatPoints[seat] = displayPointsInHalf(lastMotionPixels, seat, displayW)
        const ss = two.seats[seat]
        // Boss defeated in this half on the previous tick: snapshot now, while the player is still in front of the camera.
        const bossDefeated = seatHadBoss[seat] && (ss.phase === 'summary' || ss.phase === 'victory')
        seatHadBoss[seat] = ss.enemies.some((e) => e.type === 'boss')
        seatSessions[seat].observe(bossDefeated ? { ...ss, bossDefeated } : ss, displayW, displayH)
      }
      two = tickTwo(two, deltaMs, now, displayW, displayH, currentData, prevData, frameIsNew)
      // Apply a button pressed during this tick *after* the tick result is stored.
      const action: typeof twoAction = twoAction
      twoAction = null
      if (action === 'next' && two.phase === 'summary') two = advanceSession(two, displayW, displayH)
      else if (action === 'again') { resetSeatCards(); two = createTwoPlayer(); prevTwoPhase = null }
      else if (action === 'menu') toMenu()
      if (!two) twoPlayerActive = false
      startRequest = null // keys pressed during a 2P game must not leak to the start screen (R6.2)
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    // ── Start screen ──────────────────────────────────────────────────────────
    if (state.phase === 'start') {
      if (!startVisible) { resetStartScreen(); startVisible = true; closePanel() } // explicit entry: lock-out + fresh buttons
      try { startTitleMusic() } catch { /* ignore */ }
      renderFrame(gameCtx, state, now)
      if (isPanelOpen()) {
        // Settings panel (playtest-polish R7.2): the motion buttons get no update, Space / 1 / 2 do nothing.
        panelWasOpen = true
        renderSettingsPanel(gameCtx)
        startRequest = null
        prevCtx.drawImage(currentCanvas, 0, 0)
        rafId = requestAnimationFrame(tick)
        return
      }
      if (panelWasOpen) { resetStartScreen(); panelWasOpen = false } // wave that closed nothing must not press a button
      renderStartScreen(gameCtx, state, now, (mode) => { begin(mode) }, { gear: !demo })
      // Space / 1 / 2 fallback (only honoured while actually on the start screen)
      if (startRequest !== null && state.phase === 'start' && !twoStarted()) begin(resolveStartRequest(startRequest))
      startRequest = null
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    startVisible = false
    startRequest = null // a stray key outside the start screen is ignored
    if (state.phase !== 'gameover') gameOverVisible = false

    // ── Stage title card ──────────────────────────────────────────────────────
    if (state.phase === 'stageTitle') {
      state = tickRound(state, deltaMs, displayW, displayH)
      renderFrame(gameCtx, state, now)
      renderStageTitle(gameCtx, state)
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    if (state.phase === 'summary') {
      saveHighScore(state.highScore)
      state = tickRound(state, deltaMs, displayW, displayH)
      state = tickEffects(state, deltaMs)
      renderFrame(gameCtx, state, now)
      state = resolveHits(state, currentData, prevData, displayW, displayH, now, frameIsNew, deltaMs)
      // tickRound may just have auto-advanced (e.g. into the bonus title card):
      // only offer NEXT while the summary is still showing, so it cannot skip a stage.
      if (state.phase === 'summary') {
        renderSummary(gameCtx, state, now, () => {
          if (state.phase === 'summary') state = advanceToNextStage(state, displayW, displayH)
        })
      }
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    // ── Game Over ─────────────────────────────────────────────────────────────
    if (state.phase === 'gameover') {
      if (!gameOverVisible) { resetGameOverScreen(); gameOverVisible = true } // explicit entry: lock-out + fresh buttons
      saveHighScore(state.highScore)
      state = tickEffects(state, deltaMs)
      renderFrame(gameCtx, state, now)
      if (!renderCardPreview(now)) {
        renderGameOver(gameCtx, state, now,
          () => { state = retryStage(state) },
          () => { state = createInitialState(1) },
          () => runCardAction('open', now),
        )
      }
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    // ── Victory (boss-phases R6.3) ────────────────────────────────────────────
    if (state.phase === 'victory') {
      saveHighScore(state.highScore)
      if (prevPhase !== 'victory') {
        // Entry hooks live here so every route into victory gets the lockout reset.
        resetVictoryScreen()
        try { sfxStageClear(); stopMusic() } catch { /* ignore */ }
        prevPhase = 'victory'
      }
      state = tickEffects(state, deltaMs)
      renderFrame(gameCtx, state, now)
      if (!renderCardPreview(now)) {
        renderVictory(gameCtx, state, now,
          () => {
            if (demo) { state = createInitialState(1); begin(1) } // seeded run at the demo stage, like any other start
            else state = startGame(createInitialState(1))
          },
          () => { state = createInitialState(1) },
          () => runCardAction('open', now),
        )
      }
      prevCtx.drawImage(currentCanvas, 0, 0)
      rafId = requestAnimationFrame(tick)
      return
    }

    // ── Playing ───────────────────────────────────────────────────────────────

    // Hit-stop (juice R3): game time freezes for a beat after a banish. The camera,
    // motion capture and hit detection keep running on the real delta; only the
    // simulation uses `simMs`, so the freeze lasts HITSTOP_MS at any frame rate.
    const hs = splitHitStop(state.hitStopMs, deltaMs)
    state = { ...state, hitStopMs: hs.remainingMs }
    const simMs = hs.liveMs

    if (simMs > 0) state = stepSimulation(state, simMs, displayW, displayH)

    // Age effects *before* resolveHits so ones spawned this tick start at age 0
    // (identical pose through the freeze at any frame rate).
    if (simMs > 0) {
      state = { ...state, knocks: tickKnocks(state.knocks, simMs), callouts: tickCallouts(state.callouts, simMs) }
    }

    state = resolveHits(state, currentData, prevData, displayW, displayH, now, frameIsNew, deltaMs)

    if (simMs > 0) {
      state = tickTimer(state, simMs)
      state = setParticles(state, tickParticles(state.particles, simMs))
      state = setScoreLabels(state, tickScoreLabels(state.scoreLabels, simMs))
    }

    renderFrame(gameCtx, state, now)
    renderHUD(gameCtx, state, now)

    // Music intensity follows the combo tier (cheap when unchanged)
    if (state.phase === 'playing') {
      try { setMusicCombo(state.combo) } catch { /* ignore */ }
    }

    // Phase transition hooks
    if (prevPhase !== state.phase) {
      if (state.phase === 'playing') {
        try { startMusic(state.stage) } catch { /* ignore */ }
      } else if (state.phase === 'summary') {
        try { sfxStageClear(); stopMusic() } catch { /* ignore */ }
      } else if (state.phase === 'gameover') {
        try { stopMusic() } catch { /* ignore */ }
      }
      // 'victory' is handled at the top of its own branch next frame.
      if (state.phase !== 'victory') prevPhase = state.phase
    }

    prevCtx.drawImage(currentCanvas, 0, 0)
    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)

  resetSession = () => { session.reset(); resetSeatCards(); seatCardsRef = null }
  return stopLoop
}

let resetSession: (() => void) | null = null
/** The demo runtime of the running loop; `stopLoop` disposes it so the patched globals never outlive the loop. */
let activeDemo: DemoRuntime | null = null

export function stopLoop(): void {
  resetSession?.(); resetSession = null // the snapshot must not outlive the loop
  activeDemo?.dispose(); activeDemo = null
  onEndScreen = false
  cardOpen = false
  twoPlayerActive = false
  titleVisible = false
  twoFinal = false
  closePanel()
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
}
