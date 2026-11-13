// Unit tests for the motion-harness MCP server (balancer spec). Chrome is never launched.
import { describe, it, expect } from 'vitest'
import { parseHarnessOutput, validateRunArgs, readStageConfig, ArgError } from './mcp-server.mjs'

const M = { frames: 1800, hits: 12, motionFrames: 400, maxMotion: 900, playFrames: 1500, firstPlayAtMs: 120, threshold: 24, highScoreSaved: '4200' }
const line = (m, t = 5) => `t+${t}s ${JSON.stringify(m)}`

describe('parseHarnessOutput (R1)', () => {
  it('parses a progress line', () => {
    expect(parseHarnessOutput(line(M))).toEqual({ ok: true, metrics: M })
  })
  it('last valid line wins, noise ignored', () => {
    const out = ['page: http://x/kiro-exorcise-game/', 'monitor: ok threshold=24', line({ ...M, hits: 1 }, 5), 'space: sent', '', line({ ...M, hits: 7 }, 10), 'garbage'].join('\n')
    expect(parseHarnessOutput(out).metrics.hits).toBe(7)
  })
  it('accepts null highScoreSaved and CRLF', () => {
    const r = parseHarnessOutput(line({ ...M, highScoreSaved: null }) + '\r\n')
    expect(r.ok).toBe(true)
    expect(r.metrics.highScoreSaved).toBeNull()
  })
  it('skips a later invalid line and falls back to the previous valid one', () => {
    const out = [line(M, 5), line({ ...M, hits: 'many' }, 10), 't+15s {"frames":'].join('\n')
    expect(parseHarnessOutput(out)).toEqual({ ok: true, metrics: M })
  })
  it('rejects wrongly typed or missing fields (no coercion)', () => {
    expect(parseHarnessOutput(line({ ...M, hits: '12' })).ok).toBe(false)
    expect(parseHarnessOutput(line({ ...M, highScoreSaved: 42 })).ok).toBe(false)
    const { threshold, ...rest } = M
    expect(parseHarnessOutput(line(rest)).ok).toBe(false)
    expect(parseHarnessOutput('t+5s [1,2]').ok).toBe(false)
  })
  it('reports an error with the output tail when there are no metrics', () => {
    const r = parseHarnessOutput('no page target')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('no page target')
    expect(parseHarnessOutput('').ok).toBe(false)
    expect(parseHarnessOutput(undefined).ok).toBe(false)
  })
})

describe('validateRunArgs (R3.4)', () => {
  it('defaults seconds to 30', () => expect(validateRunArgs({ mode: 'sweep' })).toEqual({ mode: 'sweep', seconds: 30 }))
  it('accepts the boundaries', () => {
    expect(validateRunArgs({ mode: 'wave', seconds: 5 }).seconds).toBe(5)
    expect(validateRunArgs({ mode: 'wave', seconds: 120 }).seconds).toBe(120)
  })
  it.each([
    [{}], [{ mode: 'bogus' }], [{ mode: 'sweep; rm -rf /' }], [{ mode: 'sweep', seconds: 4 }],
    [{ mode: 'sweep', seconds: 121 }], [{ mode: 'sweep', seconds: 1.5 }], [{ mode: 'sweep', seconds: '30' }],
    [{ mode: 'sweep', seconds: NaN }], [[]], ['sweep'],
  ])('rejects %j', (args) => expect(() => validateRunArgs(args)).toThrow(ArgError))
})

describe('readStageConfig (R2)', () => {
  const cfg = readStageConfig()
  it('has the five stages with tuning fields', () => {
    expect(cfg.stages.map((s) => s.id)).toEqual([1, 2, 3, 4, 5])
    for (const s of cfg.stages) {
      expect(s.durationMs).toBeGreaterThan(0)
      expect(s.maxEnemies).toBeGreaterThan(0)
      expect(s.speedMultiplier).toBeGreaterThan(0)
      expect(Object.keys(s.spawnIntervalMs).sort()).toEqual(['bat', 'ghost', 'lunger', 'pumpkin', 'skull'])
    }
  })
  it('includes wave scripts for stages 1-4 only, and the bonus round', () => {
    expect(cfg.stages.slice(0, 4).every((s) => s.waves && s.waves.events.length > 0)).toBe(true)
    expect(cfg.stages[4].waves).toBeUndefined()
    expect(cfg.bonusRound.name).toBeTypeOf('string')
  })
  it('is plain JSON data matching the source constants', async () => {
    expect(JSON.parse(JSON.stringify(cfg))).toEqual(cfg)
    expect(cfg.stages[0].durationMs).toBe(45_000)
  })
})
