import { describe, it, expect } from 'vitest'
import { winnerText, drawDivider, drawSeatOverlay, resetFinalScreen, resetSummaryScreen } from './splitscreen'

function recorder(w = 1280, h = 720) {
  const calls: Array<[string, unknown[]]> = []
  const props: Record<string, unknown> = {}
  const ctx = new Proxy({ canvas: { width: w, height: h } } as Record<string, unknown>, {
    get(t, k: string) {
      if (k in t) return t[k]
      return (...a: unknown[]) => { calls.push([k, a]) }
    },
    set(t, k: string, v) { props[k] = v; t[k] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls, props }
}

describe('winnerText (two-player R5.1)', () => {
  it('names the winner or declares a tie', () => {
    expect(winnerText(0)).toBe('PLAYER 1 WINS!')
    expect(winnerText(1)).toBe('PLAYER 2 WINS!')
    expect(winnerText('tie')).toBe("IT'S A TIE!")
  })
})

describe('drawDivider (R1.5)', () => {
  it('draws one vertical line at W/2 from top to bottom in pumpkin orange', () => {
    const { ctx, calls, props } = recorder(1000, 600)
    drawDivider(ctx)
    const move = calls.find(([n]) => n === 'moveTo')!
    const line = calls.find(([n]) => n === 'lineTo')!
    expect(move[1]).toEqual([500, 0])
    expect(line[1]).toEqual([500, 600])
    expect(props.strokeStyle).toBe('#ff6b1a')
  })
})

describe('drawSeatOverlay (R4.1, R4.2)', () => {
  it('shows OUT with the final score for an out seat', () => {
    const { ctx, calls } = recorder(640, 720)
    drawSeatOverlay(ctx, 'out', 1234, 0)
    const texts = calls.filter(([n]) => n === 'fillText').map(([, a]) => a[0])
    expect(texts).toContain('OUT')
    expect(texts).toContain('Score: 1234')
  })

  it('shows CLEARED for a seat whose boss fell', () => {
    const { ctx, calls } = recorder(640, 720)
    drawSeatOverlay(ctx, 'cleared', 5000, 0)
    expect(calls.filter(([n]) => n === 'fillText').map(([, a]) => a[0])).toContain('CLEARED')
  })
})

describe('divider and resets (review fixes)', () => {
  it('drawDivider uses an explicit integer x for odd widths', () => {
    const { ctx, calls } = recorder(1001, 600)
    drawDivider(ctx, 500)
    expect(calls.find(([n]) => n === 'moveTo')![1]).toEqual([500, 0])
  })
  it('screen resets are safe to call repeatedly', () => {
    expect(() => { resetFinalScreen(); resetFinalScreen(); resetSummaryScreen() }).not.toThrow()
  })
})
