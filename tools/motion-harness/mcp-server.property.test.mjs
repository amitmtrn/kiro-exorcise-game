// Property tests (fast-check) for the motion-harness MCP server (balancer spec R1.4, R3.4).
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { parseHarnessOutput, validateRunArgs, ArgError, MIN_SECONDS, MAX_SECONDS, MODES } from './mcp-server.mjs'

const metrics = fc.record({
  frames: fc.nat(), hits: fc.nat(), motionFrames: fc.nat(), maxMotion: fc.nat(), playFrames: fc.nat(),
  firstPlayAtMs: fc.integer({ min: -1, max: 100000 }),
  threshold: fc.double({ min: 0, max: 255, noNaN: true }),
  highScoreSaved: fc.option(fc.string(), { nil: null }),
})
// Noise lines that can never look like a progress line.
const noise = fc.array(fc.string().filter((s) => !/^t\+/.test(s) && !/[\r\n]/.test(s)), { maxLength: 6 })

describe('parseHarnessOutput properties', () => {
  it('round-trips the last progress line through arbitrary noise', () => {
    fc.assert(fc.property(metrics, metrics, noise, noise, noise, (a, b, n1, n2, n3) => {
      const text = [...n1, `t+5s ${JSON.stringify(a)}`, ...n2, `t+10s ${JSON.stringify(b)}`, ...n3].join('\n')
      const r = parseHarnessOutput(text)
      expect(r.ok).toBe(true)
      expect(r.metrics).toEqual(JSON.parse(JSON.stringify(b)))
    }))
  })
  it('never throws and never invents metrics from arbitrary text', () => {
    fc.assert(fc.property(fc.string(), (s) => {
      const r = parseHarnessOutput(s)
      if (!r.ok) expect(typeof r.error).toBe('string')
      else expect(Object.keys(r.metrics).length).toBe(8)
    }))
  })
})

describe('validateRunArgs properties', () => {
  it('accepts exactly mode in MODES and integer seconds in range', () => {
    fc.assert(fc.property(fc.anything(), fc.anything(), (mode, seconds) => {
      const valid = MODES.includes(mode) && (seconds === undefined || (Number.isInteger(seconds) && seconds >= MIN_SECONDS && seconds <= MAX_SECONDS))
      let ok = true
      try { validateRunArgs({ mode, seconds }) } catch (e) { ok = false; expect(e).toBeInstanceOf(ArgError) }
      expect(ok).toBe(valid)
    }), { numRuns: 500 })
  })
  it('accepted values are always safe argv tokens', () => {
    fc.assert(fc.property(fc.constantFrom(...MODES), fc.integer({ min: MIN_SECONDS, max: MAX_SECONDS }), (mode, seconds) => {
      const r = validateRunArgs({ mode, seconds })
      expect(r.mode).toMatch(/^[a-z]+$/)
      expect(String(r.seconds)).toMatch(/^\d+$/)
    }))
  })
})
