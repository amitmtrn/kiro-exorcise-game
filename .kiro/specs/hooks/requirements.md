# Hooks — Requirements

## Goal
Kiro hooks keep the repo honest while it is edited: tests run after every
change to game code, spec task lists are checked against the code they claim
exists, and the README test count never goes stale. All hooks must use the
**current** Kiro hook format so they really fire (the original
`test-on-save.json` did not).

Out of scope: game code changes, CI changes, MCP configuration.

---

## R1 — Valid hook files

**R1.1** Hooks live in `.kiro/hooks/<name>.json` using the current standalone
format: top-level `"version": "v1"` and a `hooks` array whose entries have
`name`, `trigger` (PascalCase), optional `matcher`, `action`
(`command` or `agent`), optional `timeout`/`enabled`.

**R1.2** The existing `.kiro/hooks/test-on-save.json` is checked against that
format. Anything invalid (missing `version`, camelCase `postToolUse` trigger,
tool-name matcher combined with stdin grepping, an `action` that depends on a
tool payload shape that is not guaranteed) is removed; the file is rewritten
so it fires.

**R1.3** Every hook file parses as JSON and passes a structural check in a unit
test (`version`, required fields, known trigger names, `action.type` matches
the supplied `command`/`prompt` field, valid `matcher` regex).

**R1.4** `.kiro/` is not listed in `.gitignore`.

---

## R2 — Run tests after writes to `src/`

**R2.1** Trigger `PostFileSave`, matcher selects paths containing a `src/`
directory segment (any file type).

**R2.2** Action is the shell command `npm test`, with a timeout of 120 s.

**R2.3** Files outside `src/` (specs, README, tools) do not trigger it.

---

## R3 — Spec / code drift check

**R3.1** Trigger `PostFileSave` with a matcher that selects exactly
`.kiro/specs/<name>/tasks.md`.

**R3.2** Action is an agent prompt telling the agent to: read the changed
`tasks.md`; for each **ticked** (`- [x]`) item find the code and tests it
names (files, functions, tests, commits) in the repo; run `git log` for
ticked `Commit:` lines; and report drift.

**R3.3** The report lists, per ticked task: OK, or what is missing
(file absent, symbol absent, no test, no commit). It also flags the reverse
case: code/tests described by an **unticked** task that already exist.

**R3.4** The hook only reports. It must not edit code, tick/untick boxes,
commit, or push.

**R3.5** Manual-only items (webcam playthrough, enabling GitHub Pages) are
reported as "manual — not checkable", not as drift.

---

## R4 — README test-count sync

**R4.1** Trigger `PostFileSave`, matcher selects test files
(`*.test.ts` / `*.test.mjs`) anywhere in the repo.

**R4.2** Action is a shell command `node tools/sync-readme-tests.mjs` that
runs the real test suite (Vitest JSON reporter), reads the total test count,
and rewrites the count in the README `npm test` row
(`Run all <N> unit tests (Vitest)`).

**R4.3** The script is idempotent: if the README already states the real
number, the file is left byte-identical.

**R4.4** If tests fail to run (non-zero exit with no JSON report), the script
exits non-zero and does **not** modify the README. If some tests fail but a
report exists, it still syncs the count (the count is the number of tests,
not of passes) and exits non-zero so the failure surfaces.

**R4.5** A `--check` flag reports a mismatch (exit 1) without writing.

**R4.6** The replacement logic is a pure function with unit tests: replaces
the number, leaves other text alone, errors when the README has no matching
line.

---

## R5 — Kiro CLI

**R5.1** The same standalone hook files are loaded by Kiro IDE and Kiro CLI V3
(`kiro-cli` ≥ 3), so no duplicate agent-config hooks are added (they would
fire twice).

**R5.2** The hook JSON shape is verified with `kiro-cli agent validate` using
a temporary agent config that embeds the same `hooks` array; the temp file is
deleted afterwards.

---

## R6 — Documentation

**R6.1** README has a short "Kiro hooks" section listing each hook and what it
does; the stale `test-on-save.json` description is replaced.

**R6.2** The README file tree lists the new hook files, spec and script.

---

## Acceptance criteria
1. `.kiro/hooks/*.json` all pass the structural unit test.
2. Matcher regexes select `src/game/state.ts`, `.kiro/specs/stages/tasks.md`
   and `src/game/state.test.ts` as designed, and reject the others.
3. `node tools/sync-readme-tests.mjs --check` exits 0 on a clean tree.
4. `npm test` and `npm run build` pass.
