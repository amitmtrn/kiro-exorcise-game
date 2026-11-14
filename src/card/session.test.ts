import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CardSession } from './session'
import type { SessionState } from './session'
import type { CardData } from './layout'

const S = (o: Partial<SessionState> = {}): SessionState => ({
  phase: 'playing', stage: 1, stageBanished: 0, combo: 1, score: 0, ...o,
})

function make() {
  let n = 0
  const grab = vi.fn(() => `snap${++n}`)
  const releaseSnapshot = vi.fn()
  const compose = vi.fn((d: CardData, p: string | null) => ({ d, p }))
  const releaseCard = vi.fn()
  const download = vi.fn(async () => true)
  const session = new CardSession<string, { d: CardData; p: string | null }>({
    grab, releaseSnapshot, compose, releaseCard, download,
  })
  return { session, grab, releaseSnapshot, compose, releaseCard, download }
}

describe('CardSession snapshots', () => {
  let t: ReturnType<typeof make>
  beforeEach(() => { t = make() })

  it('never reads the camera or composes anything during normal play', () => {
    t.session.observe(S(), 640, 480)
    t.session.observe(S({ stageBanished: 4 }), 640, 480)
    expect(t.grab).not.toHaveBeenCalled()
    expect(t.compose).not.toHaveBeenCalled()
    expect(t.download).not.toHaveBeenCalled()
  })

  it('takes a snapshot at a combo moment and replaces it with a better one', () => {
    t.session.observe(S(), 640, 480)
    t.session.observe(S({ combo: 2 }), 640, 480)
    expect(t.grab).toHaveBeenCalledTimes(1)
    t.session.observe(S({ combo: 2 }), 640, 480)
    expect(t.grab).toHaveBeenCalledTimes(1)
    t.session.observe(S({ combo: 3 }), 640, 480)
    expect(t.grab).toHaveBeenCalledTimes(2)
    expect(t.releaseSnapshot).toHaveBeenCalledWith('snap1')
  })

  it('falls back to a snapshot at game end when nothing better exists', () => {
    t.session.observe(S(), 640, 480)
    t.session.observe(S({ phase: 'gameover', score: 300 }), 640, 480)
    expect(t.grab).toHaveBeenCalledTimes(1)
    expect(t.session.hasPhoto).toBe(true)
  })

  it('keeps a combo snapshot at game over instead of replacing it with the fallback', () => {
    t.session.observe(S({ combo: 4 }), 640, 480)
    t.session.observe(S({ phase: 'gameover' }), 640, 480)
    expect(t.grab).toHaveBeenCalledTimes(1)
  })

  it('the boss defeat replaces a combo snapshot', () => {
    t.session.observe(S({ stage: 5, combo: 3 }), 640, 480)
    t.session.observe(S({ stage: 5, phase: 'victory' }), 640, 480)
    expect(t.grab).toHaveBeenCalledTimes(2)
  })

  it('passes the display size to grab', () => {
    t.session.observe(S({ combo: 2 }), 1280, 720)
    expect(t.grab).toHaveBeenCalledWith(1280, 720)
  })
})

describe('CardSession lifecycle', () => {
  it('is discarded on retry (leaving game over) and the run stats restart', () => {
    const t = make()
    t.session.observe(S({ combo: 3, stageBanished: 9 }), 640, 480)
    t.session.observe(S({ phase: 'gameover', combo: 1, stageBanished: 9, score: 500 }), 640, 480)
    expect(t.session.hasPhoto).toBe(true)
    t.session.observe(S({ phase: 'stageTitle', stageBanished: 0 }), 640, 480)
    expect(t.session.hasPhoto).toBe(false)
    expect(t.releaseSnapshot).toHaveBeenCalledWith('snap1')
    expect(t.session.runStats.bestCombo).toBe(1)
  })

  it('is discarded on menu (start screen) and closes an open preview', () => {
    const t = make()
    t.session.observe(S({ phase: 'gameover' }), 640, 480)
    t.session.open()
    expect(t.session.isOpen).toBe(true)
    t.session.observe(S({ phase: 'start' }), 640, 480)
    expect(t.session.hasPhoto).toBe(false)
    expect(t.session.isOpen).toBe(false)
    expect(t.releaseCard).toHaveBeenCalledTimes(1)
  })

  it('is discarded when Play Again leaves the victory screen', () => {
    const t = make()
    t.session.observe(S({ phase: 'victory', stage: 5 }), 640, 480)
    t.session.observe(S({ phase: 'stageTitle', stage: 1 }), 640, 480)
    expect(t.session.hasPhoto).toBe(false)
  })

  it('survives stage changes inside one run', () => {
    const t = make()
    t.session.observe(S({ combo: 3, stageBanished: 5 }), 640, 480)
    t.session.observe(S({ phase: 'summary', combo: 1, stageBanished: 5 }), 640, 480)
    t.session.observe(S({ phase: 'stageTitle', stage: 2, stageBanished: 0 }), 640, 480)
    expect(t.session.hasPhoto).toBe(true)
  })

  it('a fresh run after retry takes a new snapshot', () => {
    const t = make()
    t.session.observe(S({ phase: 'gameover' }), 640, 480)
    t.session.observe(S({ phase: 'stageTitle' }), 640, 480)
    t.session.observe(S({ combo: 2 }), 640, 480)
    expect(t.grab).toHaveBeenCalledTimes(2)
    expect(t.session.hasPhoto).toBe(true)
  })
})

describe('CardSession card flow', () => {
  it('is created only on an explicit open, only on game over / victory', () => {
    const t = make()
    t.session.observe(S({ combo: 2 }), 640, 480)
    expect(t.session.open()).toBe(false)
    expect(t.compose).not.toHaveBeenCalled()
    t.session.observe(S({ phase: 'gameover', score: 4200, stage: 3, stageBanished: 20, combo: 1 }), 640, 480)
    expect(t.compose).not.toHaveBeenCalled() // reaching game over alone makes no card
    expect(t.session.open()).toBe(true)
    expect(t.compose).toHaveBeenCalledTimes(1)
    const [data, photo] = t.compose.mock.calls[0]
    expect(photo).toBe('snap1')
    expect(data).toMatchObject({ score: 4200, stage: 3, banished: 20, bestCombo: 2, rank: 'Haunt Hunter', stageCount: 6 })
  })

  it('banished counts the whole run across stages', () => {
    const t = make()
    t.session.observe(S({ stageBanished: 10 }), 640, 480)
    t.session.observe(S({ phase: 'stageTitle', stage: 2, stageBanished: 0 }), 640, 480)
    t.session.observe(S({ stage: 2, stageBanished: 7 }), 640, 480)
    t.session.observe(S({ phase: 'gameover', stage: 2, stageBanished: 7 }), 640, 480)
    t.session.open()
    expect(t.compose.mock.calls[0][0].banished).toBe(17)
    expect(t.compose.mock.calls[0][0].stage).toBe(2)
  })

  it('toggles between photo and silhouette and releases the replaced card', () => {
    const t = make()
    t.session.observe(S({ phase: 'gameover' }), 640, 480)
    t.session.open()
    expect(t.session.noPhoto).toBe(false)
    t.session.togglePhoto()
    expect(t.compose.mock.calls[1][1]).toBeNull()
    expect(t.session.noPhoto).toBe(true)
    expect(t.releaseCard).toHaveBeenCalledTimes(1)
    t.session.togglePhoto()
    expect(t.compose.mock.calls[2][1]).toBe('snap1')
  })

  it('falls back to the silhouette when the camera read fails', () => {
    const t = make()
    t.grab.mockImplementation(() => { throw new Error('camera gone') })
    t.session.observe(S({ phase: 'gameover' }), 640, 480)
    expect(t.session.hasPhoto).toBe(false)
    expect(t.session.open()).toBe(true)
    expect(t.compose.mock.calls[0][1]).toBeNull()
    expect(t.session.noPhoto).toBe(true)
    t.session.togglePhoto() // nothing to toggle to
    expect(t.compose).toHaveBeenCalledTimes(1)
  })

  it('close drops the card but keeps the snapshot until the screen is left', () => {
    const t = make()
    t.session.observe(S({ phase: 'gameover' }), 640, 480)
    t.session.open()
    t.session.close()
    expect(t.session.isOpen).toBe(false)
    expect(t.releaseCard).toHaveBeenCalledTimes(1)
    expect(t.session.hasPhoto).toBe(true)
  })

  it('save downloads only the open card and reports the result once', async () => {
    const t = make()
    t.session.observe(S({ phase: 'gameover' }), 640, 480)
    await t.session.save()
    expect(t.download).not.toHaveBeenCalled() // nothing chosen, nothing saved
    t.session.open()
    await t.session.save()
    expect(t.download).toHaveBeenCalledTimes(1)
    expect(t.session.takeStatus()).toBe('saved')
    expect(t.session.takeStatus()).toBeNull()
  })

  it('reports failure when the download fails or throws', async () => {
    const t = make()
    t.download.mockResolvedValueOnce(false)
    t.session.observe(S({ phase: 'gameover' }), 640, 480)
    t.session.open()
    await t.session.save()
    expect(t.session.takeStatus()).toBe('failed')
    t.download.mockRejectedValueOnce(new Error('x'))
    await t.session.save()
    expect(t.session.takeStatus()).toBe('failed')
  })
})

describe('CardSession extra card fields (two-player-card)', () => {
  it('merges extra() into the card data each time the card is built', () => {
    let badge: string | undefined = 'WINNER'
    const compose = vi.fn((d: CardData, p: string | null) => ({ d, p }))
    const session = new CardSession<string, { d: CardData; p: string | null }>({
      grab: () => 's', releaseSnapshot: vi.fn(), compose, releaseCard: vi.fn(), download: async () => true,
      extra: () => ({ playerLabel: 'P2', badge }),
    })
    session.observe(S({ phase: 'gameover', score: 40 }), 640, 480)
    session.open()
    expect(compose.mock.calls[0][0]).toMatchObject({ playerLabel: 'P2', badge: 'WINNER', score: 40 })
    badge = undefined
    session.close(); session.open()
    expect(compose.mock.calls[1][0].badge).toBeUndefined()
  })

  it('two sessions are independent (one player\'s combo gives the other nothing)', () => {
    const mk = () => {
      const grab = vi.fn(() => 'x')
      return { grab, s: new CardSession<string, string>({ grab, releaseSnapshot: vi.fn(), compose: () => 'c', releaseCard: vi.fn(), download: async () => true }) }
    }
    const a = mk(), b = mk()
    a.s.observe(S(), 640, 480); b.s.observe(S(), 640, 480)
    a.s.observe(S({ combo: 3 }), 640, 480); b.s.observe(S(), 640, 480)
    expect(a.grab).toHaveBeenCalledTimes(1)
    expect(b.grab).not.toHaveBeenCalled()
    expect(b.s.hasPhoto).toBe(false)
  })
})
