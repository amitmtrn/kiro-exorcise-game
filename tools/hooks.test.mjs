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
          expect(TRIGGERS.has(h.trigger)).toBe(true)
          if (h.matcher !== undefined) expect(() => new RegExp(h.matcher)).not.toThrow()
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
    expect(m().test('/abs/repo/src/ui/hud.test.ts')).toBe(true)
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
