// onboarding R2.5 / R5: stylesheet guards (src/ has no Node types, so this lives in tools/).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')

describe('onboarding stylesheet', () => {
  it('caps the panel at 40vh so it stays clear of the hand targets (R2.5)', () => {
    expect(css).toMatch(/\.onboarding \{[^}]*max-height:\s*40vh/)
  })
  it('keeps the privacy line styled on the denied screen', () => {
    expect(css).toMatch(/\.screen-error \.privacy/)
    expect(css).not.toMatch(/\.screen-error p \{/)
  })
})
