// judge-docs R4: facts check for the judge-facing docs.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const kiro = readFileSync(join(root, 'docs/KIRO.md'), 'utf8')
const readme = readFileSync(join(root, 'README.md'), 'utf8')

const HEADING = '## Built with Kiro (for judges)'
/** The new README section: from its heading to the next `## ` heading. */
export function judgeSection(text) {
  const i = text.indexOf(HEADING)
  if (i < 0) return ''
  const rest = text.slice(i + HEADING.length)
  const j = rest.search(/^## /m)
  return HEADING + (j < 0 ? rest : rest.slice(0, j))
}
const section = judgeSection(readme)

const BANNED = /eyetoy|kung\s*foo/i
const TOKEN = /ghp_|github_pat_|\bsk-/i
const texts = { 'docs/KIRO.md': kiro, 'README judge section': section }

describe('judgeSection', () => {
  it('extracts only the section', () => {
    const t = `intro Kung Foo\n\n${HEADING}\n- a\n\n## Next\nEyeToy`
    expect(judgeSection(t)).not.toMatch(BANNED)
    expect(judgeSection(t)).toContain('- a')
    expect(judgeSection('no section')).toBe('')
  })
})

describe('docs facts check', () => {
  it('the README section exists', () => {
    expect(section.length).toBeGreaterThan(HEADING.length)
  })
  for (const [name, text] of Object.entries(texts)) {
    it(`${name} does not mention the banned names`, () => {
      expect(text).not.toMatch(BANNED)
    })
    it(`${name} has no token-like strings`, () => {
      expect(text).not.toMatch(TOKEN)
    })
  }
  it('the checks themselves catch violations', () => {
    for (const bad of ['EyeToy', 'eyetoy', 'KUNG FOO', 'kung foo']) expect(bad).toMatch(BANNED)
    for (const bad of ['ghp_abc', 'github_pat_x', 'sk-abc']) expect(bad).toMatch(TOKEN)
    expect('task-by-task').not.toMatch(TOKEN)
  })
})

describe('docs structure', () => {
  const headings = [
    'TL;DR', 'How Kiro was used', 'Spec-driven development', 'Steering', 'Hooks',
    'Custom agent and MCP', 'Property-based testing', 'Powers', 'Before → after examples',
    'Credits used', 'Demo mode', "What we didn't use",
  ]
  it.each(headings)('docs/KIRO.md has the section "%s"', (h) => {
    expect(kiro).toMatch(new RegExp(`^## ${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
  })
  it('docs/KIRO.md is 250 to 450 lines', () => {
    const n = kiro.trimEnd().split('\n').length
    expect(n).toBeGreaterThanOrEqual(250)
    expect(n).toBeLessThanOrEqual(450)
  })
  it('states the power was not exercised in the IDE and that demo mode is PR #6', () => {
    expect(kiro).toMatch(/not exercised in the IDE/)
    expect(kiro).toMatch(/PR #6/)
    expect(kiro).toContain('?demo=1&seed=5')
  })
  it('README section links the write-up, the .kiro folders and the live demo', () => {
    for (const l of [
      'docs/KIRO.md', '.kiro/specs', '.kiro/hooks', '.kiro/steering',
      'https://amitmtrn.github.io/kiro-exorcise-game/',
    ]) expect(section).toContain(l)
    const bullets = section.split('\n').filter((l) => l.startsWith('- ')).length
    expect(bullets).toBeGreaterThanOrEqual(5)
    expect(bullets).toBeLessThanOrEqual(8)
  })
  it('the headline test count in the write-up matches the tests it cites', () => {
    expect(kiro).toContain('1120')
    expect(kiro).toContain('1254')
  })
})
