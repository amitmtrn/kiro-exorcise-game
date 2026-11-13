// Sync the unit-test count stated in README.md with the real number.
//   node tools/sync-readme-tests.mjs           run tests, rewrite README if stale
//   node tools/sync-readme-tests.mjs --check   run tests, exit 1 if stale (no write)
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const COUNT_RE = /(Run all )\d+( unit tests)/

/** Pure: returns README text with the stated test count replaced by n. */
export function updateReadmeCount(text, n) {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`invalid test count: ${n}`)
  }
  if (!COUNT_RE.test(text)) {
    throw new Error('README has no "Run all <N> unit tests" line to update')
  }
  return text.replace(COUNT_RE, `$1${n}$2`)
}

/**
 * Pure: decide what to do with a Vitest JSON report.
 * Returns { ok, reason?, total, failed, skipped }. ok=false means the report
 * cannot be trusted (suites that failed to load, bad numbers) and README must
 * not be written.
 */
export function evaluateReport(r) {
  const total = r?.numTotalTests
  if (!Number.isInteger(total) || total <= 0) {
    return { ok: false, reason: 'report has no valid numTotalTests' }
  }
  // A file that failed to load is a failed testResult with no failed assertion
  // (its tests never registered). Check per file so an ordinary failure in
  // another file cannot mask it.
  if (Array.isArray(r.testResults)) {
    const unloaded = r.testResults.some(
      (f) => f?.status === 'failed' &&
        !(f.assertionResults ?? []).some((a) => a?.status === 'failed'),
    )
    if (unloaded) {
      return { ok: false, reason: 'a test file failed to load (or its beforeAll/afterAll threw); count would be too low' }
    }
  } else if ((r.numFailedTestSuites ?? 0) > 0 && (r.numFailedTests ?? 0) === 0) {
    return { ok: false, reason: 'a test file failed to load (or its beforeAll/afterAll threw); count would be too low' }
  }
  return { ok: true, total, failed: r.numFailedTests ?? 0, skipped: r.numPendingTests ?? 0 }
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const readmePath = join(root, 'README.md')
  const report = join(tmpdir(), `exorcise-vitest-${process.pid}.json`)
  const check = process.argv.includes('--check')

  rmSync(report, { force: true }) // never read a stale report
  const run = spawnSync(
    'npx',
    ['vitest', 'run', '--reporter=json', `--outputFile=${report}`],
    { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' },
  )
  if (!existsSync(report)) {
    console.error('Vitest produced no report; README left untouched.')
    console.error(run.stderr || run.error || '')
    process.exit(1)
  }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(report, 'utf8'))
  } catch {
    parsed = null
  }
  rmSync(report, { force: true })

  const ev = evaluateReport(parsed)
  if (!ev.ok) {
    console.error(`${ev.reason}; README left untouched.`)
    process.exit(1)
  }
  const { total, failed, skipped } = ev

  const before = readFileSync(readmePath, 'utf8')
  const after = updateReadmeCount(before, total)
  console.log(`tests: ${total} total, ${failed} failed, ${skipped} skipped`)

  if (after === before) {
    console.log('README test count already correct.')
  } else if (check) {
    console.error(`README test count is stale (real count: ${total}).`)
    process.exit(1)
  } else {
    writeFileSync(readmePath, after)
    console.log(`README updated to ${total} tests.`)
  }
  if (failed > 0 || run.status !== 0) process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
