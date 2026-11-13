import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { downloadCanvasPng, defaultDownloadDeps, REVOKE_DELAY_MS, CARD_FILENAME } from './download'
import type { DownloadDeps } from './download'

interface FakeAnchor {
  href: string; download: string; rel: string; style: { display: string }
  click: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>
}

function setup(opts: { blob?: Blob | null; clickThrows?: boolean; toBlobThrows?: boolean } = {}) {
  const blob = opts.blob === undefined ? ({ size: 3 } as Blob) : opts.blob
  const anchors: FakeAnchor[] = []
  const appended: unknown[] = []
  const order: string[] = []
  const createObjectURL = vi.fn((_b: Blob) => { order.push('create'); return 'blob:local/abc' })
  const revokeObjectURL = vi.fn((_u: string) => { order.push('revoke') })
  const deps: DownloadDeps = {
    URL: { createObjectURL, revokeObjectURL },
    document: {
      createElement: vi.fn(() => {
        const a: FakeAnchor = {
          href: '', download: '', rel: '', style: { display: '' },
          click: vi.fn(() => { order.push('click'); if (opts.clickThrows) throw new Error('blocked') }),
          remove: vi.fn(() => { order.push('remove') }),
        }
        anchors.push(a)
        return a as unknown as HTMLAnchorElement
      }),
      body: { appendChild: vi.fn((n: unknown) => { appended.push(n); return n }) } as unknown as HTMLElement,
    } as unknown as DownloadDeps['document'],
    schedule: (fn) => fn(),
  }
  const toBlob = vi.fn((cb: BlobCallback, type?: string) => {
    if (opts.toBlobThrows) throw new Error('tainted')
    void type
    cb(blob)
  })
  const canvas = { toBlob } as unknown as HTMLCanvasElement
  return { deps, canvas, toBlob, createObjectURL, revokeObjectURL, anchors, appended, order }
}

describe('downloadCanvasPng', () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  let xhrSend: ReturnType<typeof vi.fn>
  let beacon: ReturnType<typeof vi.fn>
  let wsCtor: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn(); xhrSend = vi.fn(); beacon = vi.fn(); wsCtor = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('XMLHttpRequest', function () { return { open: vi.fn(), send: xhrSend } })
    vi.stubGlobal('navigator', { sendBeacon: beacon })
    vi.stubGlobal('WebSocket', wsCtor)
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  const expectNoNetwork = () => {
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhrSend).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
    expect(wsCtor).not.toHaveBeenCalled()
  }

  it('exports PNG through toBlob, a download link and an object URL', async () => {
    const t = setup()
    await expect(downloadCanvasPng(t.canvas, 'card.png', t.deps)).resolves.toBe(true)
    expect(t.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png')
    expect(t.createObjectURL).toHaveBeenCalledTimes(1)
    const a = t.anchors[0]
    expect(a.href).toBe('blob:local/abc')
    expect(a.download).toBe('card.png')
    expect(a.click).toHaveBeenCalledTimes(1)
    expectNoNetwork()
  })

  it('revokes the object URL after the click and removes the link', async () => {
    const t = setup()
    await downloadCanvasPng(t.canvas, CARD_FILENAME, t.deps)
    expect(t.revokeObjectURL).toHaveBeenCalledWith('blob:local/abc')
    expect(t.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(t.order).toEqual(['create', 'click', 'remove', 'revoke'])
    expect(t.anchors[0].remove).toHaveBeenCalled()
    expect(t.appended).toEqual([t.anchors[0]])
  })

  it('still revokes when the click throws, and reports failure', async () => {
    const t = setup({ clickThrows: true })
    await expect(downloadCanvasPng(t.canvas, CARD_FILENAME, t.deps)).resolves.toBe(false)
    expect(t.revokeObjectURL).toHaveBeenCalledWith('blob:local/abc')
    expectNoNetwork()
  })

  it('creates no URL (so nothing leaks) when toBlob yields null or throws', async () => {
    for (const o of [{ blob: null }, { toBlobThrows: true }]) {
      const t = setup(o)
      await expect(downloadCanvasPng(t.canvas, CARD_FILENAME, t.deps)).resolves.toBe(false)
      expect(t.createObjectURL).not.toHaveBeenCalled()
      expect(t.anchors).toHaveLength(0)
    }
    expectNoNetwork()
  })

  it('the default scheduler revokes after a delay, not before the click is handled', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('document', {})
    const t = setup()
    const deps: DownloadDeps = { ...t.deps, schedule: defaultDownloadDeps().schedule }
    await downloadCanvasPng(t.canvas, CARD_FILENAME, deps)
    expect(t.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(REVOKE_DELAY_MS)
    expect(t.revokeObjectURL).toHaveBeenCalledWith('blob:local/abc')
  })

  it('does not touch storage', async () => {
    const store = { setItem: vi.fn(), getItem: vi.fn() }
    vi.stubGlobal('localStorage', store)
    vi.stubGlobal('indexedDB', { open: vi.fn() })
    const t = setup()
    await downloadCanvasPng(t.canvas, CARD_FILENAME, t.deps)
    expect(store.setItem).not.toHaveBeenCalled()
    expect((globalThis as unknown as { indexedDB: { open: ReturnType<typeof vi.fn> } }).indexedDB.open).not.toHaveBeenCalled()
  })
})
