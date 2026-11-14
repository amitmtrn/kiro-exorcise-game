# Judge Docs — Design

## Files
```
docs/KIRO.md                                   # R1 write-up
README.md                                      # R2 "Built with Kiro (for judges)" section + spec index row
.kiro/powers/exorcise-motion-harness/
  plugin.json                                  # R3.1 manifest
  mcp.json                                     # R3.3 local stdio server
  skills/run-harness/SKILL.md                  # R3.2
  skills/balance-stage/SKILL.md                # R3.2
tools/power-manifest.test.mjs                  # R3.4
tools/judge-docs.test.mjs                      # R4 facts check
```
Tests are plain `.mjs` under `tools/` (picked up by Vitest, no new dependency),
like `tools/hooks.test.mjs` and `tools/balancer-config.test.mjs`.

## Where the numbers come from
| Claim | Source |
|---|---|
| specs, ticked and unticked tasks | `grep -c '^- \[x\]' .kiro/specs/*/tasks.md` |
| commits per spec | `git log --oneline --grep="(<spec>-T"` |
| property tests, files | `grep -rl 'fc\.assert' src tools`, `grep -rh 'fc\.assert' src tools \| wc -l` |
| test files, test count | `npm test` |
| hooks, steering, agent, MCP | the files in `.kiro/` |
| credits, per-PR test counts, review rounds and catches, harness results | off-repo orchestration logs |
| UI audit before → after | off-repo orchestration log |

Counts that change with later work are stated "at this branch" with the command.

## Power format
Agent Plugins layout: `plugin.json` at the root, `skills/<name>/SKILL.md` with
`name` and `description` front matter, `mcp.json` with `mcpServers`. The server
path is relative (`tools/motion-harness/mcp-server.mjs`), so the power only works
inside this repo checkout. The power was authored in Kiro CLI; installing it in
Kiro IDE (Powers panel → Import power from a folder) is untested.

## Facts check test
Reads `docs/KIRO.md` and the README section between the heading
`## Built with Kiro (for judges)` and the next `## ` heading. Regexes:
the banned-name regex (the two names of the game this one was inspired by, matched case-insensitively) and `/ghp_|github_pat_|\bsk-/i`. The banned names are
checked in `docs/KIRO.md`, the whole `README.md`, `package.json` and `.kiro/steering/*.md`; the token check covers `docs/KIRO.md` and the README section.
