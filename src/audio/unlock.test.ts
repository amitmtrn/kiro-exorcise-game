import { describe, it, expect } from 'vitest'
import { installAudioUnlock } from './unlock'

function setup(refuseFirst = false) {
  const handlers = new Map<string, () => void>()
  const target = {
    addEventListener: (e: string, h: () => void) => { handlers.set(e, h) },
    removeEventListener: (e: string) => { handlers.delete(e) },
  }
  let refuse = refuseFirst
  const ctx = {
    state: 'suspended' as AudioContextState,
    resume() {
      if (refuse) { refuse = false; return Promise.resolve() }   // still suspended
      ctx.state = 'running'; return Promise.resolve()
    },
  }
  const log: boolean[] = []
  installAudioUnlock({ target, getCtx: () => ctx as unknown as AudioContext, onLocked: l => log.push(l) })
  return { handlers, ctx, log }
}

describe('installAudioUnlock', () => {
  it('shows the hint while suspended and hides it after the first gesture resumes', async () => {
    const { handlers, ctx, log } = setup()
    expect(log).toEqual([true])
    handlers.get('keydown')!()
    await Promise.resolve(); await Promise.resolve()
    expect(ctx.state).toBe('running')
    expect(log).toEqual([true, false])
    expect(handlers.size).toBe(0)
  })

  it('listens for pointer, touch, key and click', () => {
    expect([...setup().handlers.keys()].sort()).toEqual(['click', 'keydown', 'pointerdown', 'touchstart'])
  })

  it('stays armed when the first resume is refused', async () => {
    const { handlers, ctx, log } = setup(true)
    handlers.get('pointerdown')!()
    await Promise.resolve(); await Promise.resolve()
    expect(ctx.state).toBe('suspended')
    expect(handlers.size).toBe(4)
    expect(log).toEqual([true])
    handlers.get('pointerdown')!()
    await Promise.resolve(); await Promise.resolve()
    expect(log).toEqual([true, false])
  })
})
