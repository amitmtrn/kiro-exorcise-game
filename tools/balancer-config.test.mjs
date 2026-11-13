// Config checks for the balancer spec: MCP registration, harness hygiene (R4, R5), agent (R6).
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const mcpText = read('.kiro/settings/mcp.json')
const mcp = JSON.parse(mcpText)
const REMOTE_LAUNCHERS = /\b(npx|npm|pnpm|yarn|bunx|uvx|pipx|docker|curl|wget|deno)\b/

/** Every string in a JSON value. */
const strings = (v) =>
  typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []
const keys = (v) =>
  v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...keys(x)]) : []

/** R5.2: applies to the MCP config and to every agent config's server entries. */
function checkServerEntry(name, e) {
  expect(e.command, name).toBe('node')
  expect(e.url, name).toBeUndefined()
  expect(e.type, name).toBeUndefined()
  expect(e.env, name).toBeUndefined()
  expect(e.headers, name).toBeUndefined()
  expect(e.oauth, name).toBeUndefined()
  for (const a of e.args) {
    expect(a, name).not.toMatch(/^\/|^[A-Za-z]:[\\/]|^~|\.\.|:\/\//)
    expect(a, name).not.toMatch(REMOTE_LAUNCHERS)
    expect(existsSync(join(root, a)), `${name}: ${a} exists`).toBe(true)
  }
}

describe('workspace MCP config (R5)', () => {
  it('registers motion-harness as a local stdio node server with a relative path', () => {
    expect(Object.keys(mcp.mcpServers)).toEqual(['motion-harness'])
    const e = mcp.mcpServers['motion-harness']
    checkServerEntry('mcp.json', e)
    expect(e.args).toEqual(['tools/motion-harness/mcp-server.mjs'])
    // Which field Kiro treats as the per-request limit is unconfirmed: both must exceed the longest run.
    expect(e.requestTimeout).toBeGreaterThan(120_000 + 60_000) // > longest run (120 s + 60 s grace)
    expect(e.timeout).toBeGreaterThan(120_000 + 60_000)
  })
  it('has no secrets, urls, tokens or env', () => {
    const all = [...strings(mcp), ...keys(mcp)].join('\n')
    expect(all).not.toMatch(/https?:\/\/|sse|token|secret|password|api[_-]?key|authorization|bearer|\$\{/i)
    expect(keys(mcp)).not.toContain('env')
  })
  it('.kiro is not git-ignored (R5.3)', () => {
    expect(read('.gitignore')).not.toMatch(/^\s*\/?\.kiro\b/m)
  })
})

describe('mcp-server.mjs is local-only (R3.6)', () => {
  const src = read('tools/motion-harness/mcp-server.mjs')
  it('opens no network listener and makes no requests', () => {
    expect(src).not.toMatch(/node:(http|https|net|dgram|tls|http2)\b|\bfetch\s*\(|WebSocket|\.listen\s*\(/)
  })
})

describe('run.sh hygiene (R4)', () => {
  const sh = read('tools/motion-harness/run.sh')
  it('limits Chrome to loopback', () => {
    expect(sh).toContain('--host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"')
    const urls = sh.match(/https?:\/\/[^\s"']+/g) ?? []
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) expect(u).toMatch(/^https?:\/\/127\.0\.0\.1[:/]/)
  })
  it('never fetches packages at runtime (npx --no-install)', () => {
    for (const l of sh.split('\n').filter((x) => /\bnpx\b/.test(x) && !x.trim().startsWith('#'))) expect(l).toContain('npx --no-install')
  })
  it('cleans up Vite and Chrome (and children) on EXIT', () => {
    expect(sh).toMatch(/trap cleanup EXIT/)
    expect(sh).toMatch(/kill_tree "\$CHROME_PID"/)
    expect(sh).toMatch(/kill_tree "\$VITE"/)
  })
})

const agentsDir = join(root, '.kiro', 'agents')
const agentFiles = existsSync(agentsDir) ? readdirSync(agentsDir).filter((f) => f.endsWith('.json')) : []

describe('agent configs (R5.2, R6.5)', () => {
  it('balancer.json exists (a missing file fails, not skips)', () => {
    expect(agentFiles).toContain('balancer.json')
  })
  it.each(agentFiles)('%s has only local, relative, non-fetching MCP servers', (f) => {
    const a = JSON.parse(read(`.kiro/agents/${f}`))
    for (const [n, e] of Object.entries(a.mcpServers ?? {})) checkServerEntry(`${f}:${n}`, e)
    expect(keys(a.mcpServers ?? {})).not.toContain('env')
  })
})

describe('balancer agent (R6)', () => {
  const agent = () => JSON.parse(read('.kiro/agents/balancer.json'))

  it('is named balancer and has a real prompt', () => {
    expect(agent().name).toBe('balancer')
    expect(agent().prompt.length).toBeGreaterThan(500)
    expect(agent().description).toBeTruthy()
  })
  it('declares the same local MCP server as the workspace config, without includeMcpJson', () => {
    expect(agent().includeMcpJson).toBe(false)
    expect(agent().mcpServers).toEqual(mcp.mcpServers)
    for (const [n, e] of Object.entries(agent().mcpServers)) checkServerEntry(`agent:${n}`, e)
  })
  it('has a restricted tool set: no shell, web, subagent, wildcard or builtin-all', () => {
    expect(agent().tools).toEqual(['read', 'write', '@motion-harness'])
  })
  it('can only write the report file; src, .kiro, package files and .gitignore are denied', () => {
    const rules = agent().permissions.rules
    const writes = rules.filter((r) => r.capability === 'fs_write')
    const allow = writes.filter((r) => r.effect === 'allow').flatMap((r) => r.match)
    const deny = writes.filter((r) => r.effect === 'deny').flatMap((r) => r.match)
    expect(allow).toEqual(['tools/motion-harness/out/balancer-report.md'])
    for (const p of ['src/**', '.kiro/**', '.git/**', 'package*.json', '.gitignore', 'README.md', 'index.html', 'vite.config.ts', 'tools/*.mjs', 'tools/motion-harness/*.*']) expect(deny).toContain(p)
    expect(deny).not.toContain('tools/**') // would shadow the report path under tools/motion-harness/out/
    expect(rules.some((r) => r.capability === 'shell' && r.effect === 'allow')).toBe(false)
    expect(rules.some((r) => r.effect === 'allow' && /^(all|builtin|filesystem)$/.test(r.capability))).toBe(false)
  })
  it('prompt says highScoreSaved null is expected for short runs (R6.4)', () => {
    expect(agent().prompt).toMatch(/highScoreSaved[^.]*null[^.]*(expected|not a failure)/i)
  })
  it('report path is git-ignored', () => {
    expect(read('.gitignore')).toMatch(/tools\/motion-harness\/out\//)
  })
  it('resources point at steering docs and the stages / waves specs, and they exist', () => {
    const res = agent().resources
    for (const f of ['steering/product.md', 'steering/tech.md', 'steering/design.md', 'specs/stages/requirements.md', 'specs/waves/requirements.md']) {
      expect(res.some((r) => r.includes(f) || r.includes(f.replace(/[^/]+$/, '*.md')))).toBe(true)
    }
    for (const r of res) {
      expect(r).toMatch(/^file:\/\/(?![\/~])(?!.*\.\.)/) // relative, no absolute or parent paths
      const base = r.replace('file://', '').replace(/\*.*$/, '')
      expect(existsSync(join(root, base)), r).toBe(true)
    }
  })
  it('contains no secrets, urls or absolute paths', () => {
    const { prompt, description, welcomeMessage, ...config } = agent() // prose may *mention* secrets ("never write secrets")
    const all = strings(config).join('\n')
    expect(all).not.toMatch(/https?:\/\/|token|secret|password|api[_-]?key|bearer/i)
    expect(keys(config)).not.toContain('env')
    for (const text of [all, prompt, description, welcomeMessage]) {
      expect(text).not.toMatch(/https?:\/\//)
      expect(text).not.toMatch(/(^|\s)\/(home|Users|root|etc|tmp)\//)
    }
  })
})
