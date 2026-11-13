import { describe, it, expect, vi } from 'vitest'
import { createSnapshotStore } from './snapshotStore'

const combo2 = { kind: 'combo' as const, rank: 20 }
const combo4 = { kind: 'combo' as const, rank: 40 }
const boss = { kind: 'boss' as const, rank: 100 }
const end = { kind: 'end' as const, rank: 0 }

describe('snapshot store lifecycle', () => {
  it('starts empty', () => {
    const s = createSnapshotStore<string>()
    expect(s.has()).toBe(false)
    expect(s.get()).toBeNull()
    expect(s.moment()).toBeNull()
  })

  it('takes a snapshot for the first moment', () => {
    const s = createSnapshotStore<string>()
    expect(s.offer(combo2, () => 'a')).toBe(true)
    expect(s.get()).toBe('a')
    expect(s.moment()).toEqual(combo2)
  })

  it('replaces it with a strictly better moment and releases the old one', () => {
    const release = vi.fn()
    const s = createSnapshotStore<string>(release)
    s.offer(combo2, () => 'a')
    expect(s.offer(combo4, () => 'b')).toBe(true)
    expect(s.get()).toBe('b')
    expect(release).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledWith('a')
    expect(s.offer(boss, () => 'c')).toBe(true)
    expect(s.get()).toBe('c')
  })

  it('keeps the stored one for equal or worse moments and never reads the camera for them', () => {
    const s = createSnapshotStore<string>()
    s.offer(combo4, () => 'a')
    const grab = vi.fn(() => 'x')
    expect(s.offer(combo4, grab)).toBe(false)
    expect(s.offer(combo2, grab)).toBe(false)
    expect(s.offer(end, grab)).toBe(false)
    expect(grab).not.toHaveBeenCalled()
    expect(s.get()).toBe('a')
  })

  it('uses the end-of-game moment as a fallback when empty', () => {
    const s = createSnapshotStore<string>()
    expect(s.offer(end, () => 'fallback')).toBe(true)
    expect(s.get()).toBe('fallback')
  })

  it('discard (retry / menu) clears and releases it; a later offer works again', () => {
    const release = vi.fn()
    const s = createSnapshotStore<string>(release)
    s.offer(boss, () => 'a')
    s.discard()
    expect(s.has()).toBe(false)
    expect(s.get()).toBeNull()
    expect(release).toHaveBeenCalledWith('a')
    s.discard() // idempotent
    expect(release).toHaveBeenCalledTimes(1)
    expect(s.offer(end, () => 'b')).toBe(true)
  })

  it('survives a throwing release', () => {
    const s = createSnapshotStore<string>(() => { throw new Error('boom') })
    s.offer(combo2, () => 'a')
    expect(() => s.discard()).not.toThrow()
    expect(s.has()).toBe(false)
  })
})
