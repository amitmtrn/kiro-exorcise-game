// Drives the game in headless Chrome over CDP and counts hits / motion pixels
// by importing the live Vite module instances (same URLs the bundle uses).
// usage: node drive.mjs <cdpPort> <playMs> <space|wave|demo>
const [PORT = '9333', PLAY_MS = '30000', MODE = 'space'] = process.argv.slice(2)
let failed = false // a progress evaluation failed: exit non-zero so stale metrics are never a success
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let page
for (let i = 0; i < 100 && !page; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
    page = list.find((t) => t.type === 'page' && t.url.includes('kiro-exorcise-game'))
  } catch {}
  if (!page) await sleep(200)
}
if (!page) { console.error('no page target'); process.exit(1) }

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0; const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) return 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text)
  return r.result?.result?.value
}
await send('Runtime.enable')
console.log('page:', page.url)
if (MODE === 'demo') {
  // Count camera and network calls from the very first script, then reload so the counters see the whole boot.
  await send('Page.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const c = window.__demoCalls = { getUserMedia: 0, fetch: 0, xhr: 0, sendBeacon: 0 }
    const md = navigator.mediaDevices
    if (md && md.getUserMedia) { const g = md.getUserMedia.bind(md); md.getUserMedia = (...a) => { c.getUserMedia++; return g(...a) } }
    const f = window.fetch; window.fetch = (...a) => { c.fetch++; return f(...a) }
    const o = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (...a) { c.xhr++; return o.apply(this, a) }
    if (navigator.sendBeacon) { const b = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (...a) => { c.sendBeacon++; return b(...a) } }
  })()` })
  await send('Page.reload', { ignoreCache: true })
}
await sleep(4000) // webcam start + 1 s calibration
// First run shows the onboarding panel; skip it so the start screen is live.
console.log('onboarding:', await ev(`(() => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent === 'Skip'); b?.click(); return b ? 'skipped' : 'none' })()`))
await sleep(1500)

const base = '/kiro-exorcise-game/src/'
console.log('monitor:', await ev(`(async () => {
  // Import the exact module URLs the page loaded (Vite may append ?t= after HMR
  // invalidation; a bare URL would yield a separate module instance).
  const urls = performance.getEntriesByType('resource').map((e) => e.name)
  const pick = (suffix) => urls.find((u) => u.includes(suffix)) ?? '${base}' + suffix
  const diff = await import(pick('src/webcam/diff.ts'))
  const col = await import(pick('src/game/collision.ts'))
  const loop = '${MODE}' === 'demo' ? await import(pick('src/game/loop.ts')) : null
  const gc = document.getElementById('game-canvas').getContext('2d')
  window.__m = { frames: 0, hits: 0, motionFrames: 0, maxMotion: 0, playFrames: 0, firstPlayAt: -1, t0: performance.now(), diff, col,
                 cardAtMs: -1, rt0: Date.now(),
                 urls: [pick('src/webcam/diff.ts'), pick('src/game/collision.ts')] }
  const f = () => {
    const m = window.__m; m.frames++
    if (col.lastBanished && col.lastBanished.length) m.hits += col.lastBanished.length
    const n = col.lastMotionPixels.length
    if (n) m.motionFrames++
    if (n > m.maxMotion) m.maxMotion = n
    // Phase probe: overlay screens paint an opaque dark rect; playing leaves mid-screen transparent.
    const W = gc.canvas.width, H = gc.canvas.height
    const a = [[0.3, 0.5], [0.7, 0.5], [0.5, 0.55]].map(([fx, fy]) => gc.getImageData(Math.round(W * fx), Math.round(H * fy), 1, 1).data[3]).sort((x, y) => x - y)[1]
    if (a < 40) { m.playFrames++; if (m.firstPlayAt < 0) m.firstPlayAt = Math.round(performance.now() - m.t0) }
    // Demo: performance.now runs on the demo clock, so the card time is measured in real ms.
    if (loop && m.cardAtMs < 0 && loop.isCardPreviewOpen()) m.cardAtMs = Date.now() - m.rt0
    requestAnimationFrame(f)
  }
  requestAnimationFrame(f)
  return 'ok threshold=' + diff.DIFF_THRESHOLD + ' urls=' + JSON.stringify(window.__m.urls)
})()`))

if (MODE === 'space') {
  console.log('space:', await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })); 'sent'`))
}

const t0 = Date.now()
while (Date.now() - t0 < Number(PLAY_MS)) {
  await sleep(5000)
  const v = await ev(`JSON.stringify({
    frames: __m.frames, hits: __m.hits, motionFrames: __m.motionFrames, maxMotion: __m.maxMotion,
    playFrames: __m.playFrames, firstPlayAtMs: __m.firstPlayAt,
    threshold: __m.diff.DIFF_THRESHOLD, highScoreSaved: localStorage.getItem('exorcise-highscore'),
    ...(window.__demoCalls ? { cardAtMs: __m.cardAtMs, calls: window.__demoCalls } : {}),
  })`)
  if (typeof v !== 'string' || v.startsWith('ERR ')) failed = true
  console.log(`t+${Math.round((Date.now() - t0) / 1000)}s`, v)
}
ws.close(); process.exit(failed ? 2 : 0)
