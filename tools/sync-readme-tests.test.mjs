import { describe, it, expect } from 'vitest'
import { updateReadmeCount, evaluateReport } from './sync-readme-tests.mjs'

const readme = (n) => `# X\n| \`npm test\` | Run all ${n} unit tests (Vitest) |\nOther 12 unit tests text\n`

describe('updateReadmeCount', () => {
  it('replaces the stated number', () => {
    expect(updateReadmeCount(readme(167), 180)).toBe(readme(180))
  })
  it('is idempotent', () => {
    const once = updateReadmeCount(readme(1), 7)
    expect(updateReadmeCount(once, 7)).toBe(once)
  })
  it('leaves other text alone', () => {
    expect(updateReadmeCount(readme(1), 2)).toContain('Other 12 unit tests text')
  })
  it('throws when there is no count line', () => {
    expect(() => updateReadmeCount('# nothing', 3)).toThrow(/no "Run all/)
  })
})

describe('updateReadmeCount validation', () => {
  it('rejects non-integer or non-positive counts', () => {
    for (const n of [undefined, NaN, 1.5, '7', 0, -1, null]) {
      expect(() => updateReadmeCount(readme(1), n)).toThrow(/invalid test count/)
    }
  })
})

describe('evaluateReport', () => {
  it('accepts a normal report', () => {
    expect(evaluateReport({ numTotalTests: 9, numFailedTests: 1, numPendingTests: 2 }))
      .toEqual({ ok: true, total: 9, failed: 1, skipped: 2 })
  })
  it('rejects missing or bad totals', () => {
    for (const r of [null, {}, { numTotalTests: 'x' }, { numTotalTests: 0 }]) {
      expect(evaluateReport(r).ok).toBe(false)
    }
  })
  it('rejects a report where a suite failed to load', () => {
    const r = evaluateReport({ numTotalTests: 5, numFailedTests: 0, numFailedTestSuites: 1 })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/failed to load/)
  })
  it('rejects a load failure even when another file has a failing test', () => {
    const r = evaluateReport({
      numTotalTests: 5, numFailedTests: 1, numFailedTestSuites: 2,
      testResults: [
        { status: 'failed', assertionResults: [{ status: 'failed' }, { status: 'passed' }] },
        { status: 'failed', assertionResults: [] },
      ],
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/failed to load/)
  })
  it('accepts ordinary failures when every file loaded', () => {
    const r = evaluateReport({
      numTotalTests: 5, numFailedTests: 1, numFailedTestSuites: 1,
      testResults: [
        { status: 'failed', assertionResults: [{ status: 'failed' }, { status: 'passed' }] },
        { status: 'passed', assertionResults: [{ status: 'passed' }] },
      ],
    })
    expect(r.ok).toBe(true)
  })
})
