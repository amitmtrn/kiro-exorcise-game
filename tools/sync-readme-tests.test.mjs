import { describe, it, expect } from 'vitest'
import { updateReadmeCount } from './sync-readme-tests.mjs'

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
