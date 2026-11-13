import { describe, it, expect, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseHarnessOutput, lastProgressSeconds, handleMessage, validateRunArgs, readStageConfig, evalSandboxed, acquireLock, killActive, runHarness, ArgError } from './mcp-server.mjs'

const SERVER = join(dirname(fileURLToPath(import.meta.url)), 'mcp-server.mjs')
const tmp = mkdtempSync(join(tmpdir(), 'mcp-test-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const M = { frames: 1800, hits: 12, motionFrames: 400, maxMotion: 900, playFrames: 1500, firstPlayAtMs: 120, threshold: 24, highScoreSaved: '4200' }
const line = (m, t = 5) => `t+${t}s ${JSON.stringify(m)}`

describe('parseHarnessOutput (R1)', () => {
  it('parses a progress line', () => {
    expect(parseHarnessOutput(line(M))).toEqual({ ok: true, metrics: M, atSeconds: 5 })
  })
  it('last valid line wins, noise ignored', () => {
    const out = ['page: http://x/kiro-exorcise-game/', 'monitor: ok threshold=24', line({ ...M, hits: 1 }, 5), 'space: sent', '', line({ ...M, hits: 7 }, 10), 'garbage'].join('\n')
    expect(parseHarnessOutput(out).metrics.hits).toBe(7)
  })
  it('accepts null highScoreSaved and CRLF', () => {
    const r = parseHarnessOutput(line({ ...M, highScoreSaved: null }) + '\r\n')
    expect(r.ok).toBe(true)
    expect(r.metrics.highScoreSaved).toBeNull()
  })
  it('skips a later invalid line and falls back to the previous valid one', () => {
    const out = [line(M, 5), line({ ...M, hits: 'many' }, 10), 't+15s {"frames":'].join('\n')
    expect(parseHarnessOutput(out)).toEqual({ ok: true, metrics: M, atSeconds: 5 })
  })
  it('rejects wrongly typed or missing fields (no coercion)', () => {
    expect(parseHarnessOutput(line({ ...M, hits: '12' })).ok).toBe(false)
    expect(parseHarnessOutput(line({ ...M, highScoreSaved: 42 })).ok).toBe(false)
    const { threshold, ...rest } = M
    expect(parseHarnessOutput(line(rest)).ok).toBe(false)
    expect(parseHarnessOutput('t+5s [1,2]').ok).toBe(false)
  })
  it('reports an error with the output tail when there are no metrics', () => {
    const r = parseHarnessOutput('no page target')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('no page target')
    expect(parseHarnessOutput('').ok).toBe(false)
    expect(parseHarnessOutput(undefined).ok).toBe(false)
  })
})

describe('validateRunArgs (R3.4)', () => {
  it('defaults seconds to 30', () => expect(validateRunArgs({ mode: 'sweep' })).toEqual({ mode: 'sweep', seconds: 30 }))
  it('accepts the boundaries', () => {
    expect(validateRunArgs({ mode: 'wave', seconds: 5 }).seconds).toBe(5)
    expect(validateRunArgs({ mode: 'wave', seconds: 120 }).seconds).toBe(120)
  })
  it.each([
    [{}], [{ mode: 'bogus' }], [{ mode: 'sweep; rm -rf /' }], [{ mode: 'sweep', seconds: 4 }],
    [{ mode: 'sweep', seconds: 121 }], [{ mode: 'sweep', seconds: 1.5 }], [{ mode: 'sweep', seconds: '30' }],
    [{ mode: 'sweep', seconds: NaN }], [[]], ['sweep'],
    [{ mode: 'sweep', extra: '; rm -rf /' }], [{ mode: 'wave', seconds: 10, cmd: 'x' }],
  ])('rejects %j', (args) => expect(() => validateRunArgs(args)).toThrow(ArgError))
})

describe('lastProgressSeconds (R1.5)', () => {
  it('reads the t+N of the last progress line, valid or not', () => {
    expect(lastProgressSeconds([line(M, 5), 't+10s ERR boom'].join('\n'))).toBe(10)
    expect(lastProgressSeconds([line(M, 5), 't+10s undefined', ''].join('\n'))).toBe(10)
    expect(lastProgressSeconds('page: x\nmonitor: ok')).toBeNull()
  })
  it('parseHarnessOutput reports which t+N the metrics came from', () => {
    expect(parseHarnessOutput([line(M, 5), 't+10s ERR x'].join('\n')).atSeconds).toBe(5)
  })
})

describe('handleMessage (R3.2)', () => {
  it('ignores client responses (id + result/error, no method) and still rejects junk', async () => {
    expect(await handleMessage({ jsonrpc: '2.0', id: 3, result: {} })).toBeNull()
    expect(await handleMessage({ jsonrpc: '2.0', id: 3, error: { code: -1, message: 'x' } })).toBeNull()
    expect((await handleMessage({ jsonrpc: '2.0', id: 4 })).error.code).toBe(-32600)
  })
})

describe('evalSandboxed (R2.3)', () => {
  it('returns module.exports and resolves only the table', () => {
    expect(evalSandboxed('exports.a = require("./w").b + 1', { './w': { b: 1 } })).toEqual({ a: 2 })
  })
  it('has no process, fetch, fs or arbitrary require', () => {
    expect(evalSandboxed('exports.t = [typeof process, typeof fetch, typeof setTimeout, typeof Buffer]')).toEqual({ t: ['undefined', 'undefined', 'undefined', 'undefined'] })
    expect(() => evalSandboxed('require("fs")')).toThrow(/blocked require/)
    expect(() => evalSandboxed('require("node:child_process")')).toThrow(/blocked require/)
    expect(() => evalSandboxed('require("constructor")')).toThrow(/blocked require/)
  })
  it('cannot escape through host constructors', () => {
    expect(() => evalSandboxed('exports.p = require.constructor("return process")()')).toThrow(/process is not defined/)
    expect(() => evalSandboxed('exports.p = module.constructor.constructor("return process")()')).toThrow(/process is not defined/)
    expect(() => evalSandboxed('exports.p = exports.constructor.constructor("return process")()')).toThrow(/process is not defined/)
  })
  it('cannot reach the host Function through the global object', () => {
    for (const expr of ['this.constructor.constructor("return process")()', 'constructor.constructor("return process")()', 'globalThis.constructor.constructor("return process")()']) {
      expect(() => evalSandboxed(`exports.p = ${expr}`), expr).toThrow(/process is not defined/)
    }
  })
  it('times out a runaway script', () => {
    expect(() => evalSandboxed('while (true) {}')).toThrow(/timed out/)
  })
})

describe('acquireLock (R3.5)', () => {
  const lock = join(tmp, 'locks', 'h.lock')
  it('is exclusive, released, and replaces a stale lock', () => {
    const release = acquireLock(lock)
    expect(readFileSync(lock, 'utf8')).toBe(String(process.pid))
    expect(() => acquireLock(lock)).toThrow(/already in progress/)
    release()
    expect(existsSync(lock)).toBe(false)
    writeFileSync(lock, '2147483646') // no such pid
    const again = acquireLock(lock)
    expect(readFileSync(lock, 'utf8')).toBe(String(process.pid))
    again()
  })
  it('treats an unparsable fresh lock as held, an old one as stale', () => {
    writeFileSync(lock, '')
    expect(() => acquireLock(lock)).toThrow(/already in progress/)
    const old = new Date(Date.now() - 60_000)
    utimesSync(lock, old, old)
    acquireLock(lock)()
  })
  it('is held while another server process owns it, and free after that process dies', async () => {
    const holder = spawn(process.execPath, ['--input-type=module', '-e',
      `import { acquireLock } from ${JSON.stringify(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'mcp-server.mjs')).href)};` +
      `acquireLock(${JSON.stringify(lock)}); console.log('held'); setInterval(() => {}, 1000)`], { stdio: ['ignore', 'pipe', 'inherit'] })
    await new Promise((res) => holder.stdout.once('data', res))
    expect(() => acquireLock(lock)).toThrow(new RegExp(`pid ${holder.pid}`))
    holder.kill('SIGKILL')
    await new Promise((res) => holder.once('exit', res))
    acquireLock(lock)() // dead owner: stale, replaced
  })
})

describe('lock release by killActive (R3.5b)', () => {
  it('kills the run group and releases the lock', async () => {
    const lock = join(tmp, 'ka', 'h.lock')
    const marker = join(tmp, 'ka.pid')
    const script = mockScript('ka.sh', `sleep 30 &\necho $! > "${marker}"\nwait`)
    const run = runHarness({ mode: 'sweep', seconds: 10 }, { EXORCISE_HARNESS_SCRIPT: script, EXORCISE_HARNESS_LOCK: lock }).catch((e) => e)
    for (let i = 0; i < 50 && !existsSync(marker); i++) await new Promise((r) => setTimeout(r, 100))
    expect(readFileSync(lock, 'utf8')).toBe(String(process.pid))
    killActive()
    expect(existsSync(lock)).toBe(false) // released synchronously, before the run settles
    expect(await run).toBeInstanceOf(Error)
    const pid = Number(readFileSync(marker, 'utf8').trim())
    await new Promise((r) => setTimeout(r, 200))
    expect(() => process.kill(pid, 0)).toThrow()
  })
})

describe('readStageConfig (R2)', () => {
  const cfg = readStageConfig()
  it('has the five stages with tuning fields', () => {
    expect(cfg.stages.map((s) => s.id)).toEqual([1, 2, 3, 4, 5])
    for (const s of cfg.stages) {
      expect(s.durationMs).toBeGreaterThan(0)
      expect(s.maxEnemies).toBeGreaterThan(0)
      expect(s.speedMultiplier).toBeGreaterThan(0)
      expect(Object.keys(s.spawnIntervalMs).sort()).toEqual(['bat', 'ghost', 'lunger', 'pumpkin', 'skull'])
    }
  })
  it('includes wave scripts for stages 1-4 only, and the bonus round', () => {
    expect(cfg.stages.slice(0, 4).every((s) => s.waves && s.waves.events.length > 0)).toBe(true)
    expect(cfg.stages[4].waves).toBeUndefined()
    expect(cfg.bonusRound.name).toBeTypeOf('string')
  })
  it('wave events are sorted by atMs and the data holds no function values', () => {
    for (const w of [...cfg.stages.map((s) => s.waves).filter(Boolean), cfg.bonusRound.script]) {
      const t = w.events.map((e) => e.atMs)
      expect(t).toEqual([...t].sort((a, b) => a - b))
    }
    const walk = (v) => {
      expect(typeof v).not.toBe('function')
      if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(cfg)
  })
  it('is plain JSON data matching the source constants', async () => {
    expect(JSON.parse(JSON.stringify(cfg))).toEqual(cfg)
    expect(cfg.stages[0].durationMs).toBe(45_000)
  })
})

// ---------------------------------------------------------- spawned server (R3)

function mockScript(name, body) {
  const p = join(tmp, name)
  writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`)
  chmodSync(p, 0o755)
  return p
}
const OK_SCRIPT = mockScript('ok.sh', `echo "page: http://127.0.0.1/kiro-exorcise-game/"\necho "args: $1 $2"\necho 't+5s ${JSON.stringify(M)}'`)

/** Start the real server as a child process with a mock harness script. */
function client(env = {}) {
  const child = spawn('node', [SERVER], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
  let buf = ''
  const raw = []
  const waiters = new Map()
  let stderr = ''
  child.stderr.on('data', (d) => { stderr += d })
  child.stdout.on('data', (d) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i); buf = buf.slice(i + 1)
      raw.push(l)
      const m = JSON.parse(l) // stdout purity: every line must be JSON
      waiters.get(m.id)?.(m)
    }
  })
  let next = 1
  const request = (method, params) => new Promise((res) => {
    const id = next++
    waiters.set(id, res)
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  return { child, raw, request, stderr: () => stderr, write: (s) => child.stdin.write(s), close: () => child.kill() }
}

/** Start a hanging mock run through a spawned server; resolves once its grandchild is up. */
async function startHang(tag) {
  const marker = join(tmp, `hang-${tag}.pid`)
  const script = mockScript(`hang-${tag}.sh`, `sleep 30 &\necho $! > "${marker}"\nwait`)
  const c = client({ EXORCISE_HARNESS_SCRIPT: script })
  c.request('tools/call', { name: 'run_harness', arguments: { mode: 'sweep', seconds: 10 } })
  for (let i = 0; i < 50 && !existsSync(marker); i++) await new Promise((r) => setTimeout(r, 100))
  await new Promise((r) => setTimeout(r, 100))
  const pid = Number(readFileSync(marker, 'utf8').trim())
  expect(() => process.kill(pid, 0)).not.toThrow() // running
  return { pid, c }
}

describe('spawned MCP server', () => {
  it('handshake, tools/list, ping', async () => {
    const c = client()
    const init = await c.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } })
    expect(init.result.protocolVersion).toBe('2025-06-18')
    expect(init.result.serverInfo.name).toBe('motion-harness')
    expect(init.result.capabilities.tools).toBeDefined()
    c.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    expect((await c.request('ping')).result).toEqual({})
    const list = await c.request('tools/list')
    expect(list.result.tools.map((t) => t.name)).toEqual(['run_harness', 'read_stage_config'])
    expect(list.result.tools[0].inputSchema.properties.mode.enum).toEqual(['sweep', 'wave'])
    // the notification produced no response line
    expect(c.raw.length).toBe(3)
    c.close()
  })

  it('unknown protocol version falls back to a known one', async () => {
    const c = client()
    const init = await c.request('initialize', { protocolVersion: '1999-01-01' })
    expect(init.result.protocolVersion).toBe('2025-06-18')
    c.close()
  })

  it('run_harness returns parsed metrics from the mock script', async () => {
    const c = client({ EXORCISE_HARNESS_SCRIPT: OK_SCRIPT })
    const r = await c.request('tools/call', { name: 'run_harness', arguments: { mode: 'wave', seconds: 7 } })
    expect(r.result.isError).toBe(false)
    expect(r.result.structuredContent).toMatchObject({ mode: 'wave', seconds: 7, ...M })
    expect(JSON.parse(r.result.content[0].text).hits).toBe(12)
    c.close()
  })

  it('passes mode and seconds to the script as separate argv entries', async () => {
    const script = mockScript('argv.sh', `echo "t+5s {\\"frames\\":$#,\\"hits\\":0,\\"motionFrames\\":0,\\"maxMotion\\":0,\\"playFrames\\":0,\\"firstPlayAtMs\\":-1,\\"threshold\\":0,\\"highScoreSaved\\":\\"$1/$2\\"}"`)
    const c = client({ EXORCISE_HARNESS_SCRIPT: script })
    const r = await c.request('tools/call', { name: 'run_harness', arguments: { mode: 'sweep' } })
    expect(r.result.structuredContent.frames).toBe(2)
    expect(r.result.structuredContent.highScoreSaved).toBe('sweep/30')
    c.close()
  })

  it('run_harness reports tool errors instead of throwing', async () => {
    const c = client({ EXORCISE_HARNESS_SCRIPT: mockScript('bad.sh', 'echo "no page target"; exit 1') })
    const bad = await c.request('tools/call', { name: 'run_harness', arguments: { mode: 'sweep; echo hi', seconds: 10 } })
    expect(bad.result.isError).toBe(true)
    expect(bad.result.content[0].text).toMatch(/mode must be/)
    const range = await c.request('tools/call', { name: 'run_harness', arguments: { mode: 'sweep', seconds: 9999 } })
    expect(range.result.isError).toBe(true)
    const fail = await c.request('tools/call', { name: 'run_harness', arguments: { mode: 'sweep', seconds: 10 } })
    expect(fail.result.isError).toBe(true)
    expect(fail.result.content[0].text).toContain('no page target')
    expect(fail.result.content[0].text).toContain('code 1')
    c.close()
  })

  it('rejects a concurrent run and still answers other requests meanwhile', async () => {
    const c = client({ EXORCISE_HARNESS_SCRIPT: mockScript('slow.sh', `sleep 1\necho 't+5s ${JSON.stringify(M)}'`) })
    const first = c.request('tools/call', { name: 'run_harness', arguments: { mode: 'sweep', seconds: 10 } })
    await new Promise((r) => setTimeout(r, 200))
    const second = await c.request('tools/call', { name: 'run_harness', arguments: { mode: 'sweep', seconds: 10 } })
    expect(second.result.isError).toBe(true)
    expect(second.result.content[0].text).toMatch(/already in progress/)
    expect((await c.request('ping')).result).toEqual({})
    expect((await first).result.isError).toBe(false)
    c.close()
  })

  it('kills a hung run (whole process group) on timeout', async () => {
    const marker = join(tmp, 'child.pid')
    const script = mockScript('hang.sh', `sleep 30 &\necho $! > "${marker}"\nwait`)
    const c = client({ EXORCISE_HARNESS_SCRIPT: script, EXORCISE_HARNESS_TIMEOUT_MS: '600' })
    const r = await c.request('tools/call', { name: 'run_harness', arguments: { mode: 'sweep', seconds: 10 } })
    expect(r.result.isError).toBe(true)
    expect(r.result.content[0].text).toMatch(/timed out/)
    const pid = Number(readFileSync(marker, 'utf8').trim())
    await new Promise((res) => setTimeout(res, 300))
    expect(() => process.kill(pid, 0)).toThrow() // grandchild is gone
    c.close()
  })

  it('a crash after a valid progress line is an error, not partial metrics (R3.5a)', async () => {
    const c = client({ EXORCISE_HARNESS_SCRIPT: mockScript('crash.sh', `echo 't+5s ${JSON.stringify(M)}'\nexit 3`) })
    const r = await c.request('tools/call', { name: 'run_harness', arguments: { mode: 'sweep', seconds: 10 } })
    expect(r.result.isError).toBe(true)
    expect(r.result.content[0].text).toContain('code 3')
    expect(r.result.structuredContent).toBeUndefined()
    c.close()
  })

  it('rejects unknown properties through the tool call (R3.4)', async () => {
    const c = client({ EXORCISE_HARNESS_SCRIPT: OK_SCRIPT })
    const r = await c.request('tools/call', { name: 'run_harness', arguments: { mode: 'sweep', extra: '; rm -rf /' } })
    expect(r.result.isError).toBe(true)
    expect(r.result.content[0].text).toMatch(/unknown argument/)
    c.close()
  })

  it.each(['SIGTERM', 'SIGINT'])('killing the server with %s kills the running harness group (R3.5b)', async (sig) => {
    const marker = join(tmp, `orphan-${sig}.pid`)
    const script = mockScript(`orphan-${sig}.sh`, `sleep 30 &\necho $! > "${marker}"\nwait`)
    const c = client({ EXORCISE_HARNESS_SCRIPT: script })
    c.request('tools/call', { name: 'run_harness', arguments: { mode: 'sweep', seconds: 10 } })
    for (let i = 0; i < 50 && !existsSync(marker); i++) await new Promise((r) => setTimeout(r, 100))
    await new Promise((r) => setTimeout(r, 100))
    const pid = Number(readFileSync(marker, 'utf8').trim())
    expect(() => process.kill(pid, 0)).not.toThrow() // running
    c.child.kill(sig)
    await new Promise((r) => c.child.once('exit', r))
    await new Promise((r) => setTimeout(r, 300))
    expect(() => process.kill(pid, 0)).toThrow() // gone
  })

  it('a signal sends SIGTERM first so the harness cleanup trap runs (R3.5b)', async () => {
    const mark = join(tmp, 'trap-ran')
    const script = mockScript('trap.sh', `trap 'echo ran > "${mark}"; exit 143' TERM\nsleep 30 &\nwait`)
    const c = client({ EXORCISE_HARNESS_SCRIPT: script })
    c.request('tools/call', { name: 'run_harness', arguments: { mode: 'sweep', seconds: 10 } })
    await new Promise((r) => setTimeout(r, 600))
    c.child.kill('SIGTERM')
    await new Promise((r) => c.child.once('exit', r))
    expect(existsSync(mark)).toBe(true)
  })

  it('SIGKILLs a harness that ignores SIGTERM after the grace period (R3.5b)', async () => {
    const marker = join(tmp, 'stubborn.pid')
    const script = mockScript('stubborn.sh', `trap '' TERM\necho $$ > "${marker}"\nwhile true; do sleep 1; done`)
    const c = client({ EXORCISE_HARNESS_SCRIPT: script })
    c.request('tools/call', { name: 'run_harness', arguments: { mode: 'sweep', seconds: 10 } })
    for (let i = 0; i < 50 && !existsSync(marker); i++) await new Promise((r) => setTimeout(r, 100))
    const pid = Number(readFileSync(marker, 'utf8').trim())
    c.child.kill('SIGTERM')
    await new Promise((r) => c.child.once('exit', r))
    await new Promise((r) => setTimeout(r, 300))
    expect(() => process.kill(pid, 0)).toThrow()
  }, 15_000)

  it('run.sh refuses to start when the DevTools port already answers (R4.1a)', async () => {
    const srv = createServer((_q, res) => res.end('[]'))
    await new Promise((r) => srv.listen(0, '127.0.0.1', r))
    const port = srv.address().port
    const run = spawn('bash', [join(dirname(SERVER), 'run.sh'), 'sweep', '5'], { env: { ...process.env, PORT: String(port), DEV_PORT: '1' }, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    run.stderr.on('data', (d) => { err += d })
    const code = await new Promise((r) => run.once('exit', r))
    srv.close()
    expect(code).toBe(1)
    expect(err).toMatch(/DevTools port \d+ is already in use/)
  }, 30_000)

  it('read_stage_config rejects arguments (R3.3)', async () => {
    const r = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_stage_config', arguments: { x: 1 } } })
    expect(r.result.isError).toBe(true)
    expect(r.result.content[0].text).toMatch(/no arguments/)
    for (const args of [undefined, {}]) {
      const ok = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'read_stage_config', arguments: args } })
      expect(ok.result.isError).toBe(false)
    }
  })

  it('killing the server with SIGHUP kills the running harness group (R3.5b)', async () => {
    const { pid, c } = await startHang('SIGHUP')
    c.child.kill('SIGHUP')
    await new Promise((r) => c.child.once('exit', r))
    await new Promise((r) => setTimeout(r, 300))
    expect(() => process.kill(pid, 0)).toThrow()
  })

  it('closing stdin mid-run (client disconnect) kills the harness group and the server exits (R3.5b)', async () => {
    const { pid, c } = await startHang('stdin')
    c.child.stdin.end()
    await new Promise((r) => c.child.once('exit', r))
    await new Promise((r) => setTimeout(r, 300))
    expect(() => process.kill(pid, 0)).toThrow()
  })

  it('a final progress line that is not valid metrics is an error, not stale numbers (R1.5)', async () => {
    const c = client({ EXORCISE_HARNESS_SCRIPT: mockScript('stale.sh', `echo 't+5s ${JSON.stringify(M)}'\necho 't+10s ERR page reloaded'\nexit 0`) })
    const r = await c.request('tools/call', { name: 'run_harness', arguments: { mode: 'sweep', seconds: 10 } })
    expect(r.result.isError).toBe(true)
    expect(r.result.content[0].text).toMatch(/final progress line \(t\+10s\)/)
    expect(r.result.structuredContent).toBeUndefined()
    c.close()
  })

  it('ignores a client response message without answering it', async () => {
    const c = client()
    c.write('{"jsonrpc":"2.0","id":77,"result":{}}\n')
    const r = await c.request('ping')
    expect(r.result).toEqual({})
    expect(c.raw).toHaveLength(1) // only the ping reply
    c.close()
  })

  it('read_stage_config returns the live tuning', async () => {
    const c = client()
    const r = await c.request('tools/call', { name: 'read_stage_config', arguments: {} })
    expect(r.result.isError).toBe(false)
    expect(r.result.structuredContent.stages).toHaveLength(5)
    expect(r.result.structuredContent.stages[0].durationMs).toBe(45_000)
    c.close()
  })

  it('JSON-RPC errors: unknown tool, unknown method, bad params, malformed JSON, invalid request', async () => {
    const c = client()
    expect((await c.request('tools/call', { name: 'nope' })).error.code).toBe(-32602)
    expect((await c.request('tools/call', {})).error.code).toBe(-32602)
    expect((await c.request('resources/list')).error.code).toBe(-32601)
    const parseErr = new Promise((res) => { c.child.stdout.once('data', (d) => res(JSON.parse(String(d)))) })
    c.write('{not json\n')
    expect((await parseErr).error.code).toBe(-32700)
    const invalid = new Promise((res) => { c.child.stdout.once('data', (d) => res(JSON.parse(String(d)))) })
    c.write('{"jsonrpc":"2.0","id":99}\n')
    expect((await invalid).error.code).toBe(-32600)
    // stdout purity: only JSON lines (client() would have thrown otherwise); logs on stderr
    expect(c.stderr()).toContain('ready')
    c.close()
  })
})
