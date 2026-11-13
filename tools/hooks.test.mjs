// Structural checks for .kiro/hooks/*.json (current Kiro "v1" hook format).
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const hooksDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.kiro', 'hooks')
const TRIGGERS = new Set([
  'PromptSubmit', 'Stop', 'SessionStart', 'SessionEnd', 'PreCompact', 'PostCompact',
  'PreToolUse', 'PostToolUse', 'PostFileCreate', 'PostFileSave', 'PostFileDelete',
  'PreTaskExecution', 'PostTaskExecution',
])

const files = readdirSync(hooksDir).filter((f) => f.endsWith('.json'))
const load = (f) => JSON.parse(readFileSync(join(hooksDir, f), 'utf8'))
const matcherOf = (file, name) =>
  new RegExp(load(file).hooks.find((h) => h.name === name).matcher)

describe('hook files (R1)', () => {
  it('has at least the test-on-save hook', () => {
    expect(files).toContain('test-on-save.json')
  })

  for (const f of files) {
    describe(f, () => {
      const doc = load(f)
      it('declares version v1 and a hooks array', () => {
        expect(doc.version).toBe('v1')
        expect(Array.isArray(doc.hooks)).toBe(true)
        expect(doc.hooks.length).toBeGreaterThan(0)
      })
      it('has valid hooks', () => {
        for (const h of doc.hooks) {
          expect(typeof h.name).toBe('string')
          expect(h.action !== null && typeof h.action === 'object' && !Array.isArray(h.action)).toBe(true)
          if (h.timeout !== undefined) expect(Number.isInteger(h.timeout) && h.timeout > 0).toBe(true)
          if (h.enabled !== undefined) expect(typeof h.enabled).toBe('boolean')
          expect(TRIGGERS.has(h.trigger)).toBe(true)
          if (h.matcher !== undefined) {
            expect(typeof h.matcher).toBe('string')
            expect(() => new RegExp(h.matcher)).not.toThrow()
          }
          if (h.action.type === 'command') expect(h.action.command).toBeTruthy()
          else if (h.action.type === 'agent') expect(h.action.prompt).toBeTruthy()
          else throw new Error(`bad action type ${h.action.type}`)
        }
      })
    })
  }
})

describe('test-on-save matcher (R2)', () => {
  const m = () => matcherOf('test-on-save.json', 'test-on-src-save')
  it('fires for src files', () => {
    expect(m().test('src/game/state.ts')).toBe(true)
    expect(m().test('/abs/repo/src/ui/hud.ts')).toBe(true)
  })
  it('leaves test files to readme-test-count (no double run)', () => {
    expect(m().test('src/ui/hud.test.ts')).toBe(false)
    expect(m().test('/abs/src/ui/hud.test.ts')).toBe(false)
  })
  it('ignores node_modules', () => {
    expect(m().test('node_modules/x/src/a.ts')).toBe(false)
  })
  it('leaves .test.mjs files to readme-test-count too', () => {
    expect(m().test('src/x/a.test.mjs')).toBe(false)
  })
  it('accepts Windows separators', () => {
    expect(m().test('C:\\repo\\src\\game\\state.ts')).toBe(true)
    expect(m().test('C:\\repo\\node_modules\\x\\src\\a.ts')).toBe(false)
  })
  it('ignores other files', () => {
    for (const p of ['README.md', '.kiro/specs/x/tasks.md', 'tools/a.mjs', 'mysrc/a.ts']) {
      expect(m().test(p)).toBe(false)
    }
  })
  it('runs npm test', () => {
    const h = load('test-on-save.json').hooks[0]
    expect(h.trigger).toBe('PostFileSave')
    expect(h.action).toEqual({ type: 'command', command: 'npm test' })
  })
})

describe('spec-drift-check (R3)', () => {
  const h = () => load('spec-drift-check.json').hooks[0]
  it('matches only specs tasks.md', () => {
    const m = matcherOf('spec-drift-check.json', 'spec-drift-check')
    expect(m.test('.kiro/specs/stages/tasks.md')).toBe(true)
    expect(m.test('/abs/repo/.kiro/specs/hooks/tasks.md')).toBe(true)
    expect(m.test('C:\\repo\\.kiro\\specs\\hooks\\tasks.md')).toBe(true)
    for (const p of [
      '.kiro/specs/stages/design.md', '.kiro/specs/stages/requirements.md',
      'src/game/state.ts', 'tasks.md', '.kiro/specs/tasks.md',
    ]) expect(m.test(p)).toBe(false)
  })
  it('is an agent prompt that reports only', () => {
    expect(h().trigger).toBe('PostFileSave')
    expect(h().action.type).toBe('agent')
    const p = h().action.prompt
    expect(p).toMatch(/ticked/)
    expect(p).toMatch(/git log/)
    expect(p).toMatch(/REPORT ONLY/)
    expect(p).toMatch(/do not edit/i)
  })
})

describe('readme-test-count (R4)', () => {
  it('matches test files only', () => {
    const m = matcherOf('readme-test-count.json', 'readme-test-count')
    for (const p of ['src/ui/hud.test.ts', '/abs/tools/sync-readme-tests.test.mjs']) {
      expect(m.test(p)).toBe(true)
    }
    for (const p of [
      'src/game/state.ts', 'README.md', 'tools/sync-readme-tests.mjs',
      'node_modules/x/a.test.ts',
    ]) {
      expect(m.test(p)).toBe(false)
    }
  })
  it('also matches Windows paths', () => {
    const m = matcherOf('readme-test-count.json', 'readme-test-count')
    expect(m.test('C:\\repo\\src\\a.test.ts')).toBe(true)
    expect(m.test('C:\\repo\\node_modules\\x\\a.test.ts')).toBe(false)
  })
  it('re-syncs when a test file is deleted', () => {
    const h = load('readme-test-count.json').hooks.find((x) => x.name === 'readme-test-count-on-delete')
    expect(h.trigger).toBe('PostFileDelete')
    expect(h.action).toEqual({ type: 'command', command: 'node tools/sync-readme-tests.mjs' })
    expect(new RegExp(h.matcher).test('src/a.test.ts')).toBe(true)
    expect(new RegExp(h.matcher).test('src/a.ts')).toBe(false)
  })
  it('syncs when a test file is created', () => {
    const h = load('readme-test-count.json').hooks.find((x) => x.name === 'readme-test-count-on-create')
    expect(h.trigger).toBe('PostFileCreate')
    expect(h.action).toEqual({ type: 'command', command: 'node tools/sync-readme-tests.mjs' })
    expect(new RegExp(h.matcher).test('src/a.test.ts')).toBe(true)
    expect(new RegExp(h.matcher).test('node_modules/x/a.test.ts')).toBe(false)
  })
  it('runs the sync script on save', () => {
    const h = load('readme-test-count.json').hooks[0]
    expect(h.trigger).toBe('PostFileSave')
    expect(h.action).toEqual({ type: 'command', command: 'node tools/sync-readme-tests.mjs' })
  })
})
