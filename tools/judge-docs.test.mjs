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
function judgeSection(text) {
  const i = text.indexOf(HEADING)
  if (i < 0) return ''
  const rest = text.slice(i + HEADING.length)
  const j = rest.search(/^## /m)
  return HEADING + (j < 0 ? rest : rest.slice(0, j))
}
const section = judgeSection(readme)

// Built by concatenation so this file does not itself contain the names.
const NAME_A = 'Eye' + 'Toy'
const NAME_B = 'Ku' + 'ng' + ' ' + 'F' + 'oo'
const BANNED = new RegExp(`${NAME_A.replace('Toy', '[\\s_-]*Toy')}|${NAME_B.replace(' ', '[\\s_-]*')}`, 'i')
const TOKEN = /ghp_|github_pat_|\bsk-/i
const texts = { 'docs/KIRO.md': kiro, 'README.md (whole file)': readme }

describe('judgeSection', () => {
  it('extracts only the section', () => {
    const t = `intro ${NAME_B}\n\n${HEADING}\n- a\n\n## Next\n${NAME_A}`
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
    for (const bad of [NAME_A, NAME_A.toLowerCase(), NAME_B.toUpperCase(), NAME_B.toLowerCase()]) expect(bad).toMatch(BANNED)
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
  it('states the power was not exercised in the IDE and that demo mode is merged (PR #6)', () => {
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
  it('the TL;DR row and the history table agree on the test counts', () => {
    expect(kiro).toMatch(/\| Unit and property tests \| 1120 passed, 0 failed, 0 skipped at PR #5; 1286 passed, 0 failed, 0 skipped on this branch after merging main/)
    expect(kiro).toMatch(/\| #5 \| motion-ui-ergonomics \| 1120 \|/)
    expect(kiro).toMatch(/\| #6 \| demo-mode \| 1254 \|/)
    expect(kiro).toMatch(/\| #7 \| judge-docs .* \| 1286 \|/)
    expect(kiro).toContain('536.22')
    expect(kiro).not.toContain('534.' + '66')
    expect(kiro).not.toMatch(/open PR #6|not on main|#7 \(open\)/)
  })
  it('the per-spec commit list reconciles with the headline 89', () => {
    expect(kiro).toContain('| 89 |')
    const block = kiro.slice(kiro.indexOf('Task commits per spec'), kiro.indexOf('The older specs'))
      .replace(/\(8 under[\s\S]*?tasks\)/, '').replace(/stages 9/, 'stages 8')
      .replace(/`skin` \(spec `spooky-skin`, `feat\(skin-T1\)` to\s+`feat\(skin-T5\)`\)/, 'skin')
    const tokens = block.split('\n').slice(1).join(' ').split(/[\s,;.]+/).filter(Boolean)
    let names = 0
    let total = 0
    for (const t of tokens) {
      if (/^\d+$/.test(t)) { total += names * Number(t); names = 0 }
      else if (/^[a-z][a-z0-9-]*$/.test(t) && t !== 'and') names++
    }
    expect(total).toBe(89)
    expect(kiro).toMatch(/`skin` \(spec `spooky-skin`/)
    expect(kiro).not.toMatch(/`spooky-skin` and `boss-combo` predate/)
  })
})
