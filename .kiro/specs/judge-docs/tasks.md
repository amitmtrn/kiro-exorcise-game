# Judge Docs — Tasks

## T1 — Local power
Files: `.kiro/powers/exorcise-motion-harness/**`, `tools/power-manifest.test.mjs`

- [x] `plugin.json`, `mcp.json`, `skills/run-harness/SKILL.md`, `skills/balance-stage/SKILL.md` (R3.1–R3.3).
- [x] `tools/power-manifest.test.mjs`: manifest fields, skill front matter, `mcp.json` local-only (command `node`, no URL keys, no `env`, relative args) and equal to `.kiro/settings/mcp.json` (R3.4).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(judge-docs-T1): local motion-harness power with manifest test`

## T2 — docs/KIRO.md
Files: `docs/KIRO.md`

- [x] Compute every repo number with the commands in the design; read `kiro-facts.md` for the rest.
- [x] Write all required sections (R1.2–R1.11), 250–450 lines.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `docs(judge-docs-T2): Kiro write-up for judges`

## T3 — README section
Files: `README.md`

- [x] Add "Built with Kiro (for judges)" near the top (5–8 bullets, links, live demo), spec index row, spec count.
- [x] Run `node tools/sync-readme-tests.mjs` so the test count is right.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `docs(judge-docs-T3): README section for judges`

## T4 — Facts check test
Files: `tools/judge-docs.test.mjs`

- [x] Banned words and token-like strings in `docs/KIRO.md` and the README section (R4.1, R4.2).
- [x] Required headings, line range, README links (R4.3).
- [x] `npm test` and `npm run build` both clean; `node tools/sync-readme-tests.mjs --check` exits 0.
- [x] Commit: `test(judge-docs-T4): facts check for judge docs`

## T5 — Review fixes
Files: `docs/KIRO.md`, `README.md`, `tools/judge-docs.test.mjs`, `.kiro/specs/judge-docs/*`

- [x] R1.1: per-spec commit list reconciles with the headline 89 (`skin` 5 added, `stages` 9 vs 8 explained).
- [x] Commit label is `<type>(<spec>-T<n>)` (README and write-up); `fix` count reworded to "mostly review fixes".
- [x] Flaky-property fix attributed to the balancer round; design excerpt marked with ellipsis; reviewer named as Claude Code.
- [x] Tests: count test checks the TL;DR row and history table; per-spec reconciliation test; line limit kept at 450 by trimming first.
- [x] Banned names built by concatenation in the test and removed from the spec text (R4.1 reworded).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(judge-docs): review fixes for write-up, README and facts check`

## T6 — Second review fixes

- [x] SHOULD-FIX: PBT headline says "once directly (BUG-1), and four more from review" (R1.13); file stays at 450 lines.
- [x] NIT: "one PR per feature" qualified in `docs/KIRO.md` and README (PR #1 bundled the P0/P1 specs).
- [x] NIT: reconciliation test parses the per-spec counts and asserts they sum to 89.
- [x] NIT: banned-name regex tolerates a space in the first name too.
- [x] NIT: `demo` command moved out of the copy-paste block in the run-harness skill.
- [x] `npm test` (1152 passed, 0 failed, 0 skipped) and `npm run build` clean.
- [x] Commit: `fix(judge-docs): second review fixes`
