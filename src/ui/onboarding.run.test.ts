import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../webcam/capture', () => ({ drawWebcamFrame: vi.fn() }))
vi.mock('../game/atmosphere', () => ({ drawWebcamTint: vi.fn() }))

import { runOnboarding, deniedInstructions, DENIED_INSTRUCTIONS, DENIED_INSTRUCTIONS_UNAVAILABLE } from './onboarding'
import { createOnboarding, onboardingReducer, type OnboardingState } from '../game/onboarding'

// ─── Minimal fake DOM (tests run in the node environment) ─────────────────────
class FakeEl {
  className = ''; textContent = ''; hidden = false; type = ''
  dataset: Record<string, string> = {}
  children: FakeEl[] = []
  attrs: Record<string, string> = {}
  listeners: Record<string, Array<(e: unknown) => void>> = {}
  removed = false
  width = 0; height = 0
  setAttribute(k: string, v: string) { this.attrs[k] = v }
  append(...c: FakeEl[]) { this.children.push(...c) }
  appendChild(c: FakeEl) { this.children.push(c); return c }
  addEventListener(t: string, f: (e: unknown) => void) { (this.listeners[t] ??= []).push(f) }
  focus() {}
  remove() { this.removed = true }
  getContext() { return { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(64 * 36 * 4), width: 64, height: 36 }) } }
  find(text: string): FakeEl | undefined {
    if (this.textContent === text) return this
    for (const c of this.children) { const f = c.find(text); if (f) return f }
    return undefined
  }
  click() { for (const f of this.listeners.click ?? []) f({}) }
}

class FakeTrack {
  readyState: 'live' | 'ended' = 'live'
  fns: Array<() => void> = []
  addEventListener(_t: string, f: () => void) { this.fns.push(f) }
  removeEventListener(_t: string, f: () => void) { this.fns = this.fns.filter((x) => x !== f) }
  end() { this.readyState = 'ended'; this.fns.slice().forEach((f) => f()) }
}
class FakeStream { constructor(public tracks: FakeTrack[]) {} getVideoTracks() { return this.tracks } }

let ui: FakeEl
let rafQueue: Array<(ts: number) => void>
let winListeners: Record<string, Array<(e: unknown) => void>>

beforeEach(() => {
  ui = new FakeEl()
  rafQueue = []
  winListeners = {}
  vi.stubGlobal('MediaStream', FakeStream)
  vi.stubGlobal('document', {
    getElementById: () => ui,
    createElement: () => new FakeEl(),
  })
  vi.stubGlobal('window', {
    addEventListener: (t: string, f: (e: unknown) => void) => { (winListeners[t] ??= []).push(f) },
    removeEventListener: (t: string, f: (e: unknown) => void) => { winListeners[t] = (winListeners[t] ?? []).filter((x) => x !== f) },
  })
  vi.stubGlobal('requestAnimationFrame', (f: (ts: number) => void) => { rafQueue.push(f); return rafQueue.length })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => { vi.unstubAllGlobals() })

function ctx(): CanvasRenderingContext2D {
  return {
    canvas: { width: 800, height: 600 }, clearRect() {}, save() {}, restore() {}, beginPath() {}, ellipse() {}, arc() {},
    lineTo() {}, closePath() {}, fill() {}, stroke() {}, setLineDash() {},
  } as unknown as CanvasRenderingContext2D
}
function video(track: FakeTrack, readyState = 4): HTMLVideoElement {
  return { srcObject: new FakeStream([track]), readyState } as unknown as HTMLVideoElement
}
function step(ts: number) { const q = rafQueue; rafQueue = []; q.forEach((f) => f(ts)) }

describe('runOnboarding wiring', () => {
  it('reports every state change so the caller resumes the same step after camera loss (R8.2)', async () => {
    const track = new FakeTrack()
    let shared: OnboardingState = createOnboarding(false)
    const p = runOnboarding(video(track), ctx(), ctx(), null, shared, (s) => { shared = s })
    const panel = ui.children[0]
    panel.find('Next')!.click()   // guide → howto 0
    panel.find('Next')!.click()   // → howto 1
    expect(shared.step).toBe('howto'); expect(shared.howtoIndex).toBe(1)
    track.end()
    expect(await p).toBe('cameraLost')
    const resumed = onboardingReducer(onboardingReducer(shared, { type: 'cameraDenied' }), { type: 'retry' })
    expect(resumed.step).toBe('howto'); expect(resumed.howtoIndex).toBe(1)
    expect(panel.removed).toBe(true)
  })

  it('starts from the supplied state (resumed card is rendered)', async () => {
    let s = onboardingReducer(createOnboarding(false), { type: 'next' })
    s = onboardingReducer(s, { type: 'next' })
    const p = runOnboarding(video(new FakeTrack()), ctx(), ctx(), null, s)
    const panel = ui.children[0]
    expect(panel.find('Next')).toBeDefined()
    expect(panel.children[0].textContent).toBe('How to play 2/3')
    panel.find('Skip')!.click()
    expect(await p).toBe('done')
  })

  it('resolves cameraLost when the track had already ended before listening (nit 3)', async () => {
    const track = new FakeTrack(); track.readyState = 'ended'
    expect(await runOnboarding(video(track), ctx(), ctx(), null)).toBe('cameraLost')
    expect(ui.children[0].removed).toBe(true)
  })

  it('does not bank time while the video has no frame, so ok-time is observed only (nit 4)', async () => {
    const track = new FakeTrack()
    const v = video(track, 0)
    let shared: OnboardingState = createOnboarding(false)
    const p = runOnboarding(v, ctx(), ctx(), null, shared, (s) => { shared = s })
    // 3 s stalled: no samples, no state.
    for (let t = 0; t <= 3000; t += 100) step(t)
    expect(shared.framing).toBeNull()
    // First tick with a frame must not credit the stalled gap in one sample.
    ;(v as unknown as { readyState: number }).readyState = 4
    step(3100)
    expect(shared.framingOkMs).toBeLessThan(500)
    ui.children[0].find('Skip')!.click()
    await p
  })
})

describe('denied instructions by kind (nit 8)', () => {
  it('leads with the device check when no camera exists, and keeps Try again last', () => {
    expect(deniedInstructions('blocked')).toBe(DENIED_INSTRUCTIONS)
    expect(deniedInstructions('unavailable')).toBe(DENIED_INSTRUCTIONS_UNAVAILABLE)
    expect(DENIED_INSTRUCTIONS_UNAVAILABLE[0]).not.toMatch(/lock icon|address bar/i)
    expect(DENIED_INSTRUCTIONS_UNAVAILABLE.join(' ')).not.toMatch(/https?:|chrome:|href/i)
    expect(DENIED_INSTRUCTIONS_UNAVAILABLE[DENIED_INSTRUCTIONS_UNAVAILABLE.length - 1]).toMatch(/Try again/)
  })
})
