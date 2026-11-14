/**
 * Entry point in demo mode (demo-mode R1, R2): `main.ts` is imported against a stub DOM.
 * `?demo=1` never asks for the camera, never runs onboarding and makes no network request;
 * any key or click leaves demo for the normal flow; `G` on the normal title screen enters it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const m = vi.hoisted(() => ({
  initWebcam: vi.fn(),
  stopWebcam: vi.fn(),
  runOnboarding: vi.fn(),
  showCameraDenied: vi.fn(),
  toggleMute: vi.fn(),
}))

vi.mock('../webcam/capture', () => ({ initWebcam: m.initWebcam, stopWebcam: m.stopWebcam, drawWebcamFrame: vi.fn() }))
vi.mock('../webcam/diff', async (orig) => ({
  ...(await orig<typeof import('../webcam/diff')>()),
  calibrateDiffThreshold: async () => 30,
  captureFrame: vi.fn(),
}))
vi.mock('../ui/onboarding', () => ({
  runOnboarding: m.runOnboarding, showCameraDenied: m.showCameraDenied, classifyCameraError: () => 'denied',
}))
vi.mock('../audio/index', () => ({
  sfxLifeLost: vi.fn(), sfxStageClear: vi.fn(), startMusic: vi.fn(), startTitleMusic: vi.fn(), stopMusic: vi.fn(),
  setMusicCombo: vi.fn(), isMuted: () => false, toggleMute: m.toggleMute,
  getAudioContext: () => { throw new Error('no audio in tests') },
}))
vi.mock('../audio/sfx', () => ({
  sfxGhostHit: vi.fn(), sfxBatHit: vi.fn(), sfxBossHit: vi.fn(), sfxBossDefeated: vi.fn(), sfxCombo: vi.fn(), sfxSkullHit: vi.fn(),
}))

const W = 1280, H = 720

interface Listener { type: string; fn: (e: unknown) => void; capture: boolean }

function setup(search: string) {
  const drawn: string[] = []
  const docL: Listener[] = []
  const winL: Listener[] = []
  const canvasL: Listener[] = []
  let raf: Array<(ts: number) => void> = []
  const storage = { getItem: vi.fn((k: string) => (k === 'exorcise.onboarding.v1' ? '1' : null)), setItem: vi.fn() }
  const net = { fetch: vi.fn(), xhr: vi.fn(), beacon: vi.fn(), gum: vi.fn(() => new Promise(() => {})) }

  function ctx2d(canvas: { width: number; height: number }, record: boolean): unknown {
    const base: Record<string, unknown> = {
      canvas,
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    }
    return new Proxy(base, {
      get: (t, k: string) => {
        if (k in t) return t[k]
        if (record && k === 'fillText') return (s: string) => { drawn.push(s) }
        return () => ({ addColorStop() {} })
      },
      set: (t, k: string, v) => { t[k] = v; return true },
    })
  }
  function el(tag: string, record = false, listeners?: Listener[]) {
    const e: Record<string, unknown> = {
      tagName: tag.toUpperCase(), style: {}, hidden: false, width: W, height: H, className: '', textContent: '',
      setAttribute() {}, appendChild() {}, remove() {},
      addEventListener: (type: string, fn: (e: unknown) => void, capture = false) => { listeners?.push({ type, fn, capture: !!capture }) },
    }
    let c: unknown = null
    e.getContext = () => (c ??= ctx2d(e as { width: number; height: number }, record))
    return e
  }
  const webcamCanvas = el('canvas')
  const gameCanvas = el('canvas', true, canvasL)
  const ui = el('div')
  const loc = { search, pathname: '/kiro-exorcise-game/', hash: '', get href() { return `http://127.0.0.1${loc.pathname}${loc.search}` } }

  vi.stubGlobal('document', {
    getElementById: (id: string) => (id === 'webcam-canvas' ? webcamCanvas : id === 'game-canvas' ? gameCanvas : ui),
    createElement: (tag: string) => el(tag),
    addEventListener: (type: string, fn: (e: unknown) => void, capture = false) => { docL.push({ type, fn, capture: !!capture }) },
  })
  vi.stubGlobal('window', {
    innerWidth: W, innerHeight: H,
    addEventListener: (type: string, fn: (e: unknown) => void, capture = false) => { winL.push({ type, fn, capture: !!capture }) },
    removeEventListener: () => {},
  })
  vi.stubGlobal('location', loc)
  vi.stubGlobal('history', { replaceState: vi.fn((_s: unknown, _t: string, url: string) => { loc.search = new URL(url, 'http://127.0.0.1').search }) })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: net.gum }, sendBeacon: net.beacon })
  vi.stubGlobal('fetch', net.fetch)
  vi.stubGlobal('XMLHttpRequest', function XHR() { net.xhr() })
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('performance', { now: () => 5000 })
  vi.stubGlobal('requestAnimationFrame', (f: (ts: number) => void) => { raf.push(f); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => { raf = [] })

  let ts = 0
  const frames = (n: number) => { for (let i = 0; i < n; i++) { ts += 1000 / 60; const q = raf; raf = []; q.forEach((f) => f(ts)) } }
  /** Fires a key at the document listeners in registration order (what a browser does). */
  const key = (k: string, repeat = false) => {
    const ev = { key: k, code: '', repeat, ctrlKey: false, metaKey: false, altKey: false, target: null, preventDefault: vi.fn() }
    for (const l of docL.filter((x) => x.type === 'keydown')) l.fn(ev)
    return ev
  }
  const keyWith = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }>) => {
    const ev = { key: k, code: '', repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...mods, target: null, preventDefault: vi.fn() }
    for (const l of docL.filter((x) => x.type === 'keydown')) l.fn(ev)
    return ev
  }
  /** A click: window capture listeners first; stopPropagation stops the canvas handler. */
  const click = (x: number, y: number) => {
    let stopped = false
    const ev = { clientX: x, clientY: y, stopPropagation: () => { stopped = true } }
    for (const l of winL.filter((x) => x.type === 'pointerdown' && x.capture)) l.fn(ev)
    if (!stopped) for (const l of canvasL.filter((x) => x.type === 'pointerdown')) l.fn(ev)
    return stopped
  }
  return { drawn, storage, net, frames, key, keyWith, click, loc, gameCanvas }
}

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const origRandom = Math.random

beforeEach(() => {
  vi.resetModules()
  for (const f of Object.values(m)) f.mockReset()
  m.initWebcam.mockImplementation(() => new Promise(() => {})) // camera prompt stays open
})
afterEach(async () => {
  const loop = await import('../game/loop')
  loop.stopLoop()
  Math.random = origRandom
  vi.unstubAllGlobals()
})

describe('?demo=1 (demo-mode R1.1, R2)', () => {
  it('never requests the camera, skips onboarding, makes no request, and draws the DEMO badge', async () => {
    const env = setup('?demo=1&seed=7')
    await import('../main')
    await flush()
    env.frames(120)
    expect(m.initWebcam).not.toHaveBeenCalled()
    expect(env.net.gum).not.toHaveBeenCalled()
    expect(m.runOnboarding).not.toHaveBeenCalled()
    expect(m.showCameraDenied).not.toHaveBeenCalled()
    expect(env.storage.getItem).not.toHaveBeenCalledWith('exorcise.onboarding.v1')
    expect(env.storage.setItem).not.toHaveBeenCalled()
    expect(env.net.fetch).not.toHaveBeenCalled()
    expect(env.net.xhr).not.toHaveBeenCalled()
    expect(env.net.beacon).not.toHaveBeenCalled()
    expect(env.drawn).toContain('DEMO')
    expect(Math.random).not.toBe(origRandom) // the seeded stream is installed
  })

  it('patches the clock and Math.random only once the font is ready, when the loop (and the badge) can run (R6.1)', async () => {
    const env = setup('?demo=1&seed=7')
    let fontDone!: () => void
    ;(document as unknown as { fonts: unknown }).fonts = { load: () => new Promise<void>((r) => { fontDone = r }) }
    await import('../main')
    await flush()
    expect(Math.random).toBe(origRandom)
    expect(performance.now()).toBe(5000)
    fontDone()
    await flush()
    expect(Math.random).not.toBe(origRandom)
    env.frames(5)
    expect(env.drawn).toContain('DEMO')
  })

  it('M (mute) does not leave demo mode', async () => {
    const env = setup('?demo=1')
    await import('../main')
    await flush()
    env.frames(10)
    env.key('m')
    env.frames(10)
    expect(m.toggleMute).toHaveBeenCalledTimes(1)
    expect(m.initWebcam).not.toHaveBeenCalled()
  })
})

describe('browser keys keep demo mode (R1.4)', () => {
  it('F5, F11, F12 and Ctrl / Cmd chords neither leave demo nor are swallowed', async () => {
    const env = setup('?demo=1&seed=7&stage=2')
    await import('../main')
    await flush()
    env.frames(10)
    const chords: Array<[string, Partial<{ ctrlKey: boolean; metaKey: boolean }>]> = [
      ['F5', {}], ['F11', {}], ['F12', {}], ['r', { ctrlKey: true }], ['r', { metaKey: true }], ['1', { ctrlKey: true }],
    ]
    for (const [k, mods] of chords) {
      const ev = env.keyWith(k, mods)
      expect(ev.preventDefault, `${k} ${JSON.stringify(mods)}`).not.toHaveBeenCalled()
    }
    await flush()
    env.frames(10)
    expect(env.loc.search).toBe('?demo=1&seed=7&stage=2') // a reload stays in demo
    expect(m.initWebcam).not.toHaveBeenCalled()
    expect(m.toggleMute).not.toHaveBeenCalled()
    env.drawn.length = 0
    env.frames(5)
    expect(env.drawn).toContain('DEMO')
  })
})

describe('leaving demo mode (R1.3, R1.5)', () => {
  it('stops the demo music', async () => {
    const env = setup('?demo=1')
    await import('../main')
    await flush()
    env.frames(10)
    const audio = await import('../audio/index')
    vi.mocked(audio.stopMusic).mockClear()
    env.key('x')
    await flush()
    expect(audio.stopMusic).toHaveBeenCalled()
  })

  it('leaves for good even when history.replaceState fails', async () => {
    const env = setup('?demo=1&seed=7')
    ;(history.replaceState as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('denied') })
    await import('../main')
    await flush()
    env.frames(10)
    env.key('x')
    await flush()
    expect(env.loc.search).toBe('?demo=1&seed=7') // the URL is unchanged...
    expect(m.initWebcam).toHaveBeenCalledTimes(1) // ...but the normal flow runs
    env.drawn.length = 0
    env.frames(10)
    expect(env.drawn).not.toContain('DEMO')
  })

  it('any other key leaves: the key is used up, the clock and Math.random are restored, the normal flow asks for the camera', async () => {
    const env = setup('?demo=1&seed=7')
    await import('../main')
    await flush()
    env.frames(30)
    const ev = env.key(' ')
    await flush()
    expect(ev.preventDefault).toHaveBeenCalled()
    expect(m.initWebcam).toHaveBeenCalledTimes(1)
    expect(performance.now()).toBe(5000)
    expect(Math.random).toBe(origRandom)
    expect(env.loc.search).toBe('') // a reload is the normal game
    env.drawn.length = 0
    env.frames(10)
    expect(env.drawn).not.toContain('DEMO') // the demo loop is stopped
  })

  it('a click leaves too, and does not reach the mute button under it', async () => {
    const env = setup('?demo=1')
    await import('../main')
    await flush()
    env.frames(10)
    const stopped = env.click(W - 20, 20)
    await flush()
    expect(stopped).toBe(true)
    expect(m.toggleMute).not.toHaveBeenCalled()
    expect(m.initWebcam).toHaveBeenCalledTimes(1)
  })

  it('?demo=0 is the normal game', async () => {
    setup('?demo=0')
    await import('../main')
    await flush()
    expect(m.initWebcam).toHaveBeenCalledTimes(1)
  })
})

describe('G on the normal title screen (R1.2)', () => {
  it('releases the camera and starts demo mode; G again leaves it', async () => {
    const video = { srcObject: null }
    m.initWebcam.mockImplementation(async () => video)
    const env = setup('')
    await import('../main')
    await flush()
    env.frames(5) // normal title screen
    expect(env.drawn).not.toContain('DEMO')
    env.key('g')
    await flush()
    expect(m.stopWebcam).toHaveBeenCalledWith(video)
    env.drawn.length = 0
    env.frames(5)
    expect(env.drawn).toContain('DEMO')
    expect(m.initWebcam).toHaveBeenCalledTimes(1)
    env.key('G')
    await flush()
    expect(m.initWebcam).toHaveBeenCalledTimes(2) // back to the normal flow
  })

  it('a held G (auto-repeat) enters demo once and does not leave it again', async () => {
    const video = { srcObject: null }
    m.initWebcam.mockImplementation(async () => video)
    const env = setup('')
    await import('../main')
    await flush()
    env.frames(5)
    env.key('g')
    await flush()
    for (let i = 0; i < 5; i++) { const ev = env.key('g', true); expect(ev.preventDefault).toHaveBeenCalled() }
    await flush()
    env.drawn.length = 0
    env.frames(5)
    expect(env.drawn).toContain('DEMO')
    expect(m.initWebcam).toHaveBeenCalledTimes(1)
  })

  it('G does nothing away from the title screen (no loop running yet: camera prompt open)', async () => {
    const env = setup('')
    await import('../main')
    await flush()
    env.key('g')
    await flush()
    env.frames(5)
    expect(env.drawn).not.toContain('DEMO')
    expect(m.stopWebcam).not.toHaveBeenCalled()
  })
})
