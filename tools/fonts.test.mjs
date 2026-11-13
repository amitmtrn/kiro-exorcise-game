// onboarding R6/R7.3: fonts are self-hosted — no http(s) URL in any font reference,
// the TTF + OFL licence are bundled, and the CSS points at the local file.
// Lives in tools/ (plain .mjs) because src/ has no Node type definitions.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const FONT_DIR = join(ROOT, 'src/assets/fonts')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const sources = [
  ...walk(join(ROOT, 'src')).filter((f) => ['.ts', '.css'].includes(extname(f)) && !/\.test\.ts$/.test(f)),
  join(ROOT, 'index.html'),
]

/** Lines/blocks that reference fonts: @font-face blocks, url(...), font-family/font: lines, FontFace, fonts.googleapis. */
export function fontReferences(text) {
  const refs = []
  for (const m of text.matchAll(/@font-face\s*\{[^}]*\}/g)) refs.push(m[0])
  for (const line of text.split('\n')) {
    if (/url\(|font-family|\bfont\s*:|\.font\s*=|FontFace|fonts\.(googleapis|gstatic)|<link[^>]*font/i.test(line)) refs.push(line)
  }
  return refs
}

describe('self-hosted fonts', () => {
  it('scans real sources', () => {
    expect(sources.length).toBeGreaterThan(5)
    expect(sources.some((f) => f.endsWith('style.css'))).toBe(true)
  })

  it('references no http(s):// or protocol-relative URL for fonts', () => {
    for (const file of sources) {
      for (const ref of fontReferences(readFileSync(file, 'utf8'))) {
        expect(ref, file).not.toMatch(/(https?:)?\/\/[\w.-]+\.[a-z]{2,}/i)
        expect(ref, file).not.toMatch(/https?:/i)
      }
    }
  })

  it('never mentions the Google Fonts CDN in source', () => {
    for (const file of sources) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/fonts\.(googleapis|gstatic)\.com/i)
    }
  })

  it('bundles the TTF and the OFL licence', () => {
    const ttf = join(FONT_DIR, 'Creepster-Regular.ttf')
    expect(existsSync(ttf)).toBe(true)
    expect(readFileSync(ttf).subarray(0, 4).toString('hex')).toBe('00010000') // TrueType
    const ofl = readFileSync(join(FONT_DIR, 'OFL.txt'), 'utf8')
    expect(ofl).toMatch(/SIL Open Font License, Version 1\.1/)
    expect(ofl).toMatch(/Creepster/)
  })

  it('declares @font-face from the local file with a swap fallback', () => {
    const css = readFileSync(join(ROOT, 'src/style.css'), 'utf8')
    const face = css.match(/@font-face\s*\{[^}]*\}/)?.[0] ?? ''
    expect(face).toMatch(/font-family:\s*'Creepster'/)
    expect(face).toMatch(/url\('\.\/assets\/fonts\/Creepster-Regular\.ttf'\)/)
    expect(face).toMatch(/font-display:\s*swap/)
  })

  it('detects an external reference (self-check of the scanner)', () => {
    const bad = "@font-face { src: url('https://fonts.gstatic.com/x.woff2'); }"
    expect(fontReferences(bad).some((r) => /https?:/.test(r))).toBe(true)
  })

  it('TITLE_FONT_FAMILY has Creepster first and a generic fallback', () => {
    const ts = readFileSync(join(ROOT, 'src/ui/fonts.ts'), 'utf8')
    const stack = ts.match(/TITLE_FONT_FAMILY\s*=\s*\n?\s*"([^"]+)"/)?.[1] ?? ''
    expect(stack.startsWith("'Creepster'")).toBe(true)
    expect(stack).toMatch(/fantasy$/)
  })
})
