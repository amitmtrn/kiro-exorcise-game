/**
 * Audio unlock: browsers keep an AudioContext suspended until a user gesture.
 * A webcam-only player may start the game with motion buttons and never touch
 * the keyboard or mouse, so the game shows a hint and keeps listening for ANY
 * gesture (pointer, touch, key) until the context is actually running.
 */

export interface UnlockDeps {
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
  /** Returns the (lazily created) context and asks it to resume. */
  getCtx: () => Pick<AudioContext, 'state' | 'resume'> & Partial<Pick<AudioContext, 'addEventListener'>>
  /** Called with true while sound is still locked, false once it is running. */
  onLocked: (locked: boolean) => void
}

const EVENTS = ['pointerdown', 'touchstart', 'keydown', 'click'] as const

/** Returns a disposer. */
export function installAudioUnlock({ target, getCtx, onLocked }: UnlockDeps): () => void {
  let done = false
  const finish = () => {
    if (done) return
    done = true
    for (const e of EVENTS) target.removeEventListener(e, onGesture)
    onLocked(false)
  }
  const check = () => {
    let ctx
    try { ctx = getCtx() } catch { return }
    if (ctx.state === 'running') finish()
  }
  function onGesture(): void {
    let ctx
    try { ctx = getCtx() } catch { return }
    if (ctx.state === 'running') { finish(); return }
    // Stay armed until the context really runs (resume() may be refused).
    ctx.resume().then(check, () => { /* try again on the next gesture */ })
  }
  for (const e of EVENTS) target.addEventListener(e, onGesture)
  try {
    const ctx = getCtx()
    ctx.addEventListener?.('statechange', check)
    if (ctx.state === 'running') finish(); else onLocked(true)
  } catch { onLocked(true) }
  return () => { done = true; for (const e of EVENTS) target.removeEventListener(e, onGesture) }
}
