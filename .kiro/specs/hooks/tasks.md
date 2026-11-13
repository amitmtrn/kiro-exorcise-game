# Hooks — Tasks

## T1 — Replace the invalid test hook
Files: `.kiro/hooks/test-on-save.json`, `tools/hooks.test.mjs`

- [x] Rewrite `test-on-save.json` in `version: "v1"` format (`PostFileSave`, matcher `(^|/)src/`, `npm test`, timeout 120).
- [x] `tools/hooks.test.mjs`: every `.kiro/hooks/*.json` parses; has `version: "v1"`; each hook has name/trigger/action; trigger is a known PascalCase name; action type matches command/prompt; matcher compiles.
- [x] Test: `test-on-save` matcher accepts `src/game/state.ts` and `/abs/src/ui/hud.test.ts`, rejects `README.md`, `.kiro/specs/x/tasks.md`, `tools/a.mjs`.
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `feat(hooks-T1): valid v1 test-on-save hook with structural tests`

## T2 — Spec/code drift hook
Files: `.kiro/hooks/spec-drift-check.json`, `tools/hooks.test.mjs`

- [x] Add `spec-drift-check.json`: `PostFileSave`, matcher `(^|/)\.kiro/specs/[^/]+/tasks\.md$`, agent prompt per design (report only, no edits).
- [x] Test: matcher accepts `.kiro/specs/stages/tasks.md` and rejects `design.md`, `requirements.md`, `src/…`; prompt mentions ticked tasks, git log, and forbids edits.
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `feat(hooks-T2): spec/code drift report hook on tasks.md save`

## T3 — README test-count sync
Files: `tools/sync-readme-tests.mjs`, `tools/sync-readme-tests.test.mjs`, `.kiro/hooks/readme-test-count.json`, `tools/hooks.test.mjs`, `README.md`

- [x] `updateReadmeCount(text, n)` pure function; throws when no `Run all N unit tests` line.
- [x] CLI main: run Vitest JSON reporter to a temp file, sync README, `--check` mode, idempotent, no README write when tests cannot run, exit 1 on failing tests, temp report removed.
- [x] Unit tests for the pure function (replace, idempotent, other text untouched, throws).
- [x] Add `readme-test-count.json` (`PostFileSave`, matcher `\.test\.(ts|mjs)$`, command `node tools/sync-readme-tests.mjs`) and matcher tests.
- [x] Run the script; README count equals the real total; `--check` exits 0.
- [x] Run `npm test` and `npm run build`; both clean.
- [x] Commit: `feat(hooks-T3): README test-count sync hook and script`

## T4 — Docs and CLI verification
Files: `README.md`

- [ ] README "Kiro hooks" section listing each hook; replace the stale `test-on-save.json` text; update the file tree.
- [ ] Validate the hooks array with `kiro-cli agent validate` via a temp agent file; delete it.
- [ ] Confirm `.kiro` is not in `.gitignore`.
- [ ] Re-run `node tools/sync-readme-tests.mjs`; run `npm test` and `npm run build`; both clean.
- [ ] Commit: `docs(hooks-T4): README Kiro hooks section`
