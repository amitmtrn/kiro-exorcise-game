# Hooks — Design

## Why the old hook never fired
`.kiro/hooks/test-on-save.json` used `"trigger": "postToolUse"` (camelCase,
CLI 2.x / legacy alias), no `"version"` field, and a matcher `write` combined
with `grep "/src/"` on stdin. The current format
(<https://kiro.dev/docs/hooks/>) requires `"version": "v1"`, PascalCase
triggers, and offers file triggers (`PostFileSave`) whose `matcher` is a
regex against the file path — no stdin parsing needed. Without `version` the
file is not recognised as a hook document.

## File layout
```
.kiro/hooks/
  test-on-save.json       # R2  PostFileSave  src/        -> npm test
  spec-drift-check.json   # R3  PostFileSave  specs tasks -> agent prompt
  readme-test-count.json  # R4  PostFileSave  *.test.*    -> node script
tools/
  sync-readme-tests.mjs   # R4 script (pure fn exported + CLI main)
  sync-readme-tests.test.mjs
tools/hooks.test.mjs   # R1.3 structural + matcher tests
```
The hook structural test is a plain `.mjs` file under `tools/` (Vitest picks
it up; `tsc` only covers `src/`, which has no `@types/node`, so no new
dependency is needed).

## Hook definitions

### test-on-save (R2)
```json
{ "version": "v1",
  "hooks": [{
    "name": "test-on-src-save",
    "description": "Run npm test after any file under src/ is saved.",
    "trigger": "PostFileSave",
    "matcher": "(^|/)src/",
    "action": { "type": "command", "command": "npm test" },
    "timeout": 120, "enabled": true }] }
```
Command actions run in the project root; non-zero exit sends stderr to the
agent, so failures are visible.

### spec-drift-check (R3)
Matcher: `(^|/)\.kiro/specs/[^/]+/tasks\.md$`. Agent action prompt (summary):
read the file, list `- [x]` items, locate files/symbols/tests/commits named
in each, `git log --oneline` for `Commit:` lines, print a table
`task | status | evidence/missing`, flag unticked-but-implemented items,
mark manual items as not checkable, and **make no edits**.

### readme-test-count (R4)
Matcher: `\.test\.(ts|mjs)$`. Command: `node tools/sync-readme-tests.mjs`.

Script flow:
1. `npx vitest run --reporter=json --outputFile=<os tmpdir>/exorcise-vitest.json`
   (outside the repo so no stray `.vitest/` output).
2. Read `numTotalTests`, `numFailedTests`, `numPendingTests`.
3. `updateReadmeCount(text, n)` — pure; regex
   `/(Run all )\d+( unit tests)/`; throws if no match.
4. Write README only if the text changed (`--check`: print mismatch, exit 1).
5. Remove the temp report. Exit 1 if any test failed.

The script's own pure-function test never spawns Vitest, so there is no
recursion.

## Regex checks (matchers use JS `RegExp`)
| Path | test-on-save | spec-drift | readme-count |
|---|---|---|---|
| `src/game/state.ts` | ✔ | ✘ | ✘ |
| `/abs/repo/src/ui/hud.test.ts` | ✔ | ✘ | ✔ |
| `.kiro/specs/stages/tasks.md` | ✘ | ✔ | ✘ |
| `.kiro/specs/stages/design.md` | ✘ | ✘ | ✘ |
| `README.md` | ✘ | ✘ | ✘ |
| `tools/sync-readme-tests.test.mjs` | ✘ | ✘ | ✔ |

## CLI
Kiro CLI V3 loads `.kiro/hooks/*.json` itself, so an agent profile with the
same hooks would double-fire. We therefore add **no** `.kiro/agents/` file.
Validation: build a temp agent JSON `{name, hooks:[…same array…]}` in `/tmp`,
run `kiro-cli agent validate --path`, delete it.

## Risks
- `PostFileSave` fires on every save, so `npm test` may run often; the
  `src/` matcher and 120 s timeout bound that. Test run is ~seconds.
- Agent-prompt hooks cost a model turn; the drift hook is limited to
  `tasks.md` saves.
- README sync edits README, which matches no hook matcher, so no loop.
