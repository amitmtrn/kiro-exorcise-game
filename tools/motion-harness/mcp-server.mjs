#!/usr/bin/env node
// Local stdio MCP server for the motion harness (balancer spec).
// Plain Node >= 22, no dependencies. Newline-delimited JSON-RPC 2.0 on
// stdin/stdout; logs go to stderr. No network listeners, no fetches.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  if (!MODES.includes(a.mode)) throw new ArgError(`mode must be one of ${MODES.join(', ')}`)
  const seconds = a.seconds === undefined ? DEFAULT_SECONDS : a.seconds
  if (!Number.isInteger(seconds) || seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
    throw new ArgError(`seconds must be an integer between ${MIN_SECONDS} and ${MAX_SECONDS}`)
  }
  return { mode: a.mode, seconds }
}

// ----------------------------------------------------------- R2 stage config

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
  const run = (code, requireFn) => {
    const module = { exports: {} }
    vm.runInNewContext(code, { module, exports: module.exports, require: requireFn }, { timeout: 2000 })
    return module.exports
  }
  const waves = run(compile('waves.ts'), (id) => { throw new Error(`blocked require: ${id}`) })
  const stages = run(compile('stages.ts'), (id) => {
    if (id === './waves') return waves
    throw new Error(`blocked require: ${id}`)
  })
  return JSON.parse(JSON.stringify({ stages: stages.STAGES, bonusRound: waves.BONUS_ROUND }))
}
