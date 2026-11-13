import { describe, it, expect } from 'vitest'
import { handleCardKey, handleCardPointer } from './loop'

describe('card input outside the end screens (exorcist-card R1.2)', () => {
  it('ignores keys and clicks when the game-over / victory screen is not showing', () => {
    for (const k of ['c', 'C', 's', 'Enter', 'n', 'Escape']) expect(handleCardKey(k)).toBe(false)
    expect(handleCardPointer(10, 10)).toBe(false)
  })
})
