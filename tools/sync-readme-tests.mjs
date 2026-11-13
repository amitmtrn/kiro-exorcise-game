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
  if (!COUNT_RE.test(text)) {
    throw new Error('README has no "Run all <N> unit tests" line to update')
  }
  return text.replace(COUNT_RE, `$1${n}$2`)
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const readmePath = join(root, 'README.md')
  const report = join(tmpdir(), `exorcise-vitest-${process.pid}.json`)
  const check = process.argv.includes('--check')

  const run = spawnSync(
    'npx',
    ['vitest', 'run', '--reporter=json', `--outputFile=${report}`],
    { cwd: root, encoding: 'utf8' },
  )
  if (!existsSync(report)) {
    console.error('Vitest produced no report; README left untouched.')
    console.error(run.stderr || run.error || '')
    process.exit(1)
  }
  const { numTotalTests, numFailedTests, numPendingTests } = JSON.parse(readFileSync(report, 'utf8'))
  rmSync(report, { force: true })

  const before = readFileSync(readmePath, 'utf8')
  const after = updateReadmeCount(before, numTotalTests)
  console.log(`tests: ${numTotalTests} total, ${numFailedTests} failed, ${numPendingTests} skipped`)

  if (after === before) {
    console.log('README test count already correct.')
  } else if (check) {
    console.error(`README test count is stale (real count: ${numTotalTests}).`)
    process.exit(1)
  } else {
    writeFileSync(readmePath, after)
    console.log(`README updated to ${numTotalTests} tests.`)
  }
  if (numFailedTests > 0) process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
