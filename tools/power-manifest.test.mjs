// judge-docs R3: the local exorcise-motion-harness power (Agent Plugins format).
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = '.kiro/powers/exorcise-motion-harness'
const read = (p) => readFileSync(join(root, p), 'utf8')
const manifest = JSON.parse(read(`${dir}/plugin.json`))
const mcpText = read(`${dir}/mcp.json`)
const mcp = JSON.parse(mcpText)
const settings = JSON.parse(read('.kiro/settings/mcp.json'))
const keys = (v) =>
  v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...keys(x)]) : []

describe('plugin.json', () => {
  it('uses the Agent Plugins schema and required fields', () => {
    expect(manifest.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')
    expect(manifest.name).toBe('exorcise-motion-harness')
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(typeof manifest.description).toBe('string')
    expect(manifest.description.length).toBeGreaterThan(20)
    expect(manifest.author).toEqual({ name: 'Amit Mtrn' })
  })
  it('has keywords including harness, motion, balance, webcam', () => {
    expect(Array.isArray(manifest.keywords)).toBe(true)
    for (const k of ['harness', 'motion', 'balance', 'webcam']) expect(manifest.keywords).toContain(k)
  })
})

describe('skills', () => {
  for (const name of ['run-harness', 'balance-stage']) {
    it(`${name}/SKILL.md has front matter with matching name and a description`, () => {
      const p = `${dir}/skills/${name}/SKILL.md`
      expect(existsSync(join(root, p))).toBe(true)
      const m = read(p).match(/^---\n([\s\S]*?)\n---\n/)
      expect(m).not.toBeNull()
      expect(m[1]).toMatch(new RegExp(`^name: ${name}$`, 'm'))
      expect(m[1]).toMatch(/^description: .{20,}/m)
    })
  }
})

describe('mcp.json is local-only', () => {
  const entry = mcp.mcpServers['motion-harness']
  it('declares only the motion-harness stdio server', () => {
    expect(Object.keys(mcp.mcpServers)).toEqual(['motion-harness'])
    expect(entry.command).toBe('node')
  })
  it('has no URL, transport type, env or headers keys', () => {
    for (const k of ['url', 'type', 'env', 'headers']) expect(entry[k]).toBeUndefined()
    expect(keys(mcp).filter((k) => /url|env|header|token|secret|key/i.test(k))).toEqual([])
  })
  it('uses relative paths inside the repo only', () => {
    expect(entry.args).toEqual(['tools/motion-harness/mcp-server.mjs'])
    for (const a of entry.args) {
      expect(a.startsWith('/')).toBe(false)
      expect(a).not.toMatch(/^[A-Za-z]:[\\/]/)
      expect(a).not.toContain('..')
      expect(existsSync(join(root, a))).toBe(true)
    }
    expect(mcpText).not.toMatch(/https?:\/\//)
  })
  it('equals the entry in .kiro/settings/mcp.json', () => {
    expect(entry).toEqual(settings.mcpServers['motion-harness'])
  })
})
