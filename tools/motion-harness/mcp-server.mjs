#!/usr/bin/env node
// Local stdio MCP server for the motion harness (balancer spec).
// Plain Node >= 22, no dependencies. Newline-delimited JSON-RPC 2.0 on
// stdin/stdout; logs go to stderr. No network listeners, no fetches.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(HERE, '..', '..')

export const MIN_SECONDS = 5
export const MAX_SECONDS = 120
export const DEFAULT_SECONDS = 30
export const MODES = ['sweep', 'wave']

export class ArgError extends Error {}

// ---------------------------------------------------------------- R1 parsing

const PROGRESS_RE = /^t\+\d+s (\{.*\})\s*$/
const NUMERIC_FIELDS = ['frames', 'hits', 'motionFrames', 'maxMotion', 'playFrames', 'firstPlayAtMs', 'threshold']

/** Validate one parsed metrics object. Returns the cleaned object or null. */
function cleanMetrics(o) {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return null
  const out = {}
  for (const k of NUMERIC_FIELDS) {
    if (typeof o[k] !== 'number' || !Number.isFinite(o[k])) return null
    out[k] = o[k]
  }
  if (o.highScoreSaved !== null && typeof o.highScoreSaved !== 'string') return null
  out.highScoreSaved = o.highScoreSaved
  return out
}

/**
 * Metrics of the LAST valid progress line printed by drive.mjs (`t+5s {json}`).
 * Returns { ok: true, metrics } or { ok: false, error }.
 */
export function parseHarnessOutput(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = PROGRESS_RE.exec(lines[i])
    if (!m) continue
    let obj
    try { obj = JSON.parse(m[1]) } catch { continue }
    const metrics = cleanMetrics(obj)
    if (metrics) return { ok: true, metrics }
  }
  const tail = String(text ?? '').slice(-400)
  return { ok: false, error: `no valid metrics line in harness output. Tail: ${tail}` }
}

/** R3.4: validate tool arguments; returns { mode, seconds } or throws ArgError. */
export function validateRunArgs(args) {
  const a = args ?? {}
  if (typeof a !== 'object' || Array.isArray(a)) throw new ArgError('arguments must be an object')
  const extra = Object.keys(a).filter((k) => k !== 'mode' && k !== 'seconds')
  if (extra.length) throw new ArgError(`unknown argument(s): ${extra.map((k) => JSON.stringify(k)).join(', ')}`)
  if (!MODES.includes(a.mode)) throw new ArgError(`mode must be one of ${MODES.join(', ')}`)
  const seconds = a.seconds === undefined ? DEFAULT_SECONDS : a.seconds
  if (!Number.isInteger(seconds) || seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
    throw new ArgError(`seconds must be an integer between ${MIN_SECONDS} and ${MAX_SECONDS}`)
  }
  return { mode: a.mode, seconds }
}

// ----------------------------------------------------------- R2 stage config

/**
 * Evaluate CommonJS `code` in a fresh vm context. `require`, `module` and
 * `exports` are created inside the context, so no host object or host
 * `Function` is reachable from the evaluated code. `table` maps the module ids
 * `require` may resolve; everything else throws.
 */
export function evalSandboxed(code, table = {}) {
  const makeRequire = vm.runInNewContext(
    '(function (table) { return function require(id) {' +
    ' if (Object.prototype.hasOwnProperty.call(table, id)) return table[id];' +
    ' throw new Error("blocked require: " + id) } })',
  )
  const sandbox = { __require: makeRequire(table) }
  return vm.runInNewContext(
    `var module = { exports: {} }; var exports = module.exports; var require = __require;\n${code}\n;module.exports`,
    sandbox,
    { timeout: 2000 },
  )
}

/**
 * Current tuning from src/game/stages.ts + waves.ts, read at call time.
 * The two files are transpiled with the repo's own `typescript` and evaluated
 * in an empty vm context (no process / fetch / fs, only ./waves resolvable).
 */
export function readStageConfig(root = ROOT) {
  const ts = createRequire(join(root, 'package.json'))('typescript')
  const compile = (file) =>
    ts.transpileModule(readFileSync(join(root, 'src', 'game', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
  const waves = evalSandboxed(compile('waves.ts'), {})
  const stages = evalSandboxed(compile('stages.ts'), { './waves': waves })
  return JSON.parse(JSON.stringify({ stages: stages.STAGES, bonusRound: waves.BONUS_ROUND }))
}

// ------------------------------------------------------------ harness runner

export const KILL_GRACE_MS = 3000
const DEFAULT_SCRIPT = join(HERE, 'run.sh')
let running = false
export const LOCK_FILE = join(HERE, 'out', 'harness.lock')

// ---- active run tracking (R3.5b): a killed server must not orphan Vite / Chrome
let activePid = null
export function killActive() {
  if (activePid === null) return
  try { process.kill(-activePid, 'SIGKILL') } catch { /* already gone */ }
  activePid = null
}

/** Cross-process lock for the real harness (fixed ports). Returns a release fn, or throws ArgError. */
export function acquireLock(file = LOCK_FILE) {
  mkdirSync(dirname(file), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(file, 'wx')
      writeSync(fd, String(process.pid))
      closeSync(fd)
      return () => { try { if (readFileSync(file, 'utf8') === String(process.pid)) rmSync(file, { force: true }) } catch { /* gone */ } }
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      const owner = Number(readFileSync(file, 'utf8').trim())
      let alive = Number.isInteger(owner) && owner > 0
      if (alive) { try { process.kill(owner, 0) } catch (err) { alive = err.code === 'EPERM' } }
      if (alive) throw new ArgError(`a harness run is already in progress in another server process (pid ${owner}); try again when it finishes`)
      rmSync(file, { force: true }) // stale lock
    }
  }
  throw new ArgError('could not acquire the harness lock')
}

/**
 * Spawn `bash <script> <mode> <seconds>` (argv array, never a shell string) in
 * its own process group; kill the group on timeout. Resolves { code, output, timedOut }.
 */
export function runScript(script, mode, seconds, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn('bash', [script, mode, String(seconds)], {
      cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    activePid = child.pid
    let output = ''
    let timedOut = false
    const onData = (d) => { output += d; if (output.length > 200_000) output = output.slice(-100_000) }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    const killGroup = (sig) => { try { process.kill(-child.pid, sig) } catch { /* already gone */ } }
    const timer = setTimeout(() => {
      timedOut = true
      killGroup('SIGTERM')
      setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS).unref()
    }, timeoutMs)
    child.on('error', (e) => { clearTimeout(timer); activePid = null; resolveRun({ code: -1, output: output + String(e), timedOut }) })
    child.on('close', (code) => {
      clearTimeout(timer)
      killGroup('SIGKILL') // reap any stragglers left in the group
      activePid = null
      resolveRun({ code, output, timedOut })
    })
  })
}

export async function runHarness(args, env = process.env) {
  const { mode, seconds } = validateRunArgs(args)
  if (running) throw new ArgError('a harness run is already in progress (fixed ports); try again when it finishes')
  const custom = env.EXORCISE_HARNESS_SCRIPT
  const release = custom ? () => {} : acquireLock() // R3.5: lock across server processes
  running = true
  try {
    const script = custom || DEFAULT_SCRIPT
    const override = Number(env.EXORCISE_HARNESS_TIMEOUT_MS)
    const timeoutMs = Number.isFinite(override) && override > 0 ? override : seconds * 1000 + 60_000
    const started = Date.now()
    const r = await runScript(script, mode, seconds, timeoutMs)
    const elapsedMs = Date.now() - started
    if (r.timedOut) throw new Error(`harness timed out after ${Math.round(timeoutMs / 1000)} s and was killed. Tail: ${r.output.slice(-400)}`)
    const parsed = parseHarnessOutput(r.output)
    if (r.code !== 0) throw new Error(`harness exited with code ${r.code} (no metrics returned; a crashed run is not reported as success). Tail: ${r.output.slice(-400)}`)
    if (!parsed.ok) throw new Error(`${parsed.error} (exit code ${r.code})`)
    return { mode, seconds, elapsedMs, exitCode: r.code, ...parsed.metrics }
  } finally {
    running = false
    release()
  }
}

// ------------------------------------------------------------------ JSON-RPC

const SERVER_INFO = { name: 'motion-harness', version: '1.0.0' }
const KNOWN_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

export const TOOLS = [
  {
    name: 'run_harness',
    description:
      'Run the synthetic-webcam motion harness (headless Chrome on the local dev server) and return metrics: ' +
      'frames, hits, motionFrames, maxMotion, playFrames, firstPlayAtMs, threshold, highScoreSaved. ' +
      'sweep = hand sweeps through the enemy path (Space starts); wave = hand waves over START, no keypress. ' +
      'Takes about `seconds` + 10 s. One run at a time.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: MODES, description: 'sweep or wave' },
        seconds: { type: 'integer', minimum: MIN_SECONDS, maximum: MAX_SECONDS, default: DEFAULT_SECONDS, description: 'play time in seconds' },
      },
      required: ['mode'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_stage_config',
    description: 'Return the current stage and wave tuning (stages.ts STAGES and waves.ts BONUS_ROUND, incl. wave scripts) as JSON.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
]

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
const toolResult = (data) => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  structuredContent: data,
  isError: false,
})
const toolError = (message) => ({ content: [{ type: 'text', text: message }], isError: true })

async function callTool(name, args, env) {
  try {
    if (name === 'run_harness') return toolResult(await runHarness(args, env))
    if (name === 'read_stage_config') return toolResult(readStageConfig())
  } catch (e) {
    return toolError(e instanceof Error ? e.message : String(e))
  }
  return null
}

/** One JSON-RPC message → response object, or null for notifications. */
export async function handleMessage(msg, env = process.env) {
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.method !== 'string') {
    return rpcError(msg && typeof msg === 'object' ? msg.id : null, -32600, 'Invalid Request')
  }
  const { id, method, params } = msg
  const isNotification = id === undefined || id === null
  if (isNotification) return null // notifications/initialized, notifications/cancelled, ...
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: KNOWN_VERSIONS.includes(asked) ? asked : KNOWN_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        },
      }
    }
    case 'ping': return { jsonrpc: '2.0', id, result: {} }
    case 'tools/list': return { jsonrpc: '2.0', id, result: { tools: TOOLS } }
    case 'tools/call': {
      if (!params || typeof params.name !== 'string') return rpcError(id, -32602, 'tools/call requires a tool name')
      const result = await callTool(params.name, params.arguments, env)
      if (!result) return rpcError(id, -32602, `Unknown tool: ${params.name}`)
      return { jsonrpc: '2.0', id, result }
    }
    default: return rpcError(id, -32601, `Method not found: ${method}`)
  }
}

/** Newline-delimited JSON-RPC over the given streams. Requests are handled concurrently. */
export function startServer(input, output, env = process.env) {
  const send = (obj) => output.write(JSON.stringify(obj) + '\n')
  const rl = createInterface({ input })
  rl.on('line', (text) => {
    if (!text.trim()) return
    let msg
    try { msg = JSON.parse(text) } catch { send(rpcError(null, -32700, 'Parse error')); return }
    handleMessage(msg, env).then(
      (res) => { if (res) send(res) },
      (e) => { console.error('motion-harness mcp: internal error', e); send(rpcError(msg?.id, -32603, 'Internal error')) },
    )
  })
  return rl
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer(process.stdin, process.stdout)
  process.on('exit', killActive)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { killActive(); process.exit(0) })
  process.stdin.on('end', killActive) // client went away: stop the run; the process ends once stdin is drained
  console.error('motion-harness MCP server ready (stdio)')
}
