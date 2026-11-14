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

- [ ] Banned words and token-like strings in `docs/KIRO.md` and the README section (R4.1, R4.2).
- [ ] Required headings, line range, README links (R4.3).
- [ ] `npm test` and `npm run build` both clean; `node tools/sync-readme-tests.mjs --check` exits 0.
- [ ] Commit: `test(judge-docs-T4): facts check for judge docs`
