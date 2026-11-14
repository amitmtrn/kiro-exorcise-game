# Judge Docs — Requirements

## Goal
Judges of the Kiroween 2026 hackathon score "how effectively Kiro was used".
This spec adds a factual write-up (`docs/KIRO.md`), a short judge section in the
README, a local Kiro power that packages the motion-harness workflow, and a test
that keeps the write-up honest. The repo keeps the root `/.kiro` with specs,
hooks and steering.

Out of scope: any change to game code, new runtime dependencies, new network
fetches, new audio or other assets.

---

## R1 — `docs/KIRO.md` (facts only)

**R1.1** Every number and claim comes from the repo (git log, `.kiro/`, `src/`,
`tools/`, tests) or from off-repo orchestration logs.
Anything that cannot be verified is left out. Repo numbers show the command that
produced them where useful.

**R1.2** Required sections: TL;DR table; How Kiro was used; Spec-driven
development; Steering; Hooks; Custom agent and MCP; Property-based testing;
Powers; Before → after examples; Credits used; Demo mode; What we didn't use.

**R1.3** How Kiro was used states: Kiro CLI only; the non-interactive loop
spec → implement → independent read-only review → Kiro fixes; one PR per feature.

**R1.4** Spec-driven development shows one real excerpt each from
`requirements.md`, `design.md` and `tasks.md`, the one-commit-per-task
traceability with real commit hashes, and an honest comparison with vibe coding
that uses the review catches as evidence.

**R1.5** Steering describes what each of the three files enforces with short
quotes, and one example where a steering rule shows in the code.

**R1.6** Hooks lists each hook with trigger, matcher and what it automates, and
the spec-drift-check lesson (it took over a Kiro session).

**R1.7** Custom agent and MCP: the `balancer` agent, the two tools of the
`motion-harness` MCP server, what they enabled, the sandbox-escape catch, and
the statement that the server is local stdio only with no network and no secrets.

**R1.8** Property-based testing gives the `fc.assert` count, the number of files,
quoted property names, and the issues PBT found or the flaky-property story.

**R1.9** Powers says the power was written in Kiro CLI for installation in Kiro
IDE (Powers panel → Import power from a folder) and was **not** exercised in the IDE.

**R1.10** Demo mode is described as "PR #6" (merged, merge commit 46d9551):
`?demo=1&seed=5`, no camera, deterministic, for filming.

**R1.11** What we didn't use: Kiro IDE, Web and Crew.

**R1.12** About 250–450 lines, with tables and short excerpts.

**R1.13** Claims about the PBT bugs and about PR granularity must match the
tables in the same document: BUG-1 was found directly by a property, BUG-2 to
BUG-5 came from review; "one PR per feature" holds from PR #2 on, PR #1
bundled the P0/P1 specs.

## R2 — README section

**R2.1** Near the top of `README.md`, a "Built with Kiro (for judges)" section
with 5–8 bullets: headline numbers, link to `docs/KIRO.md`, links to `.kiro/specs`,
`.kiro/hooks`, `.kiro/steering`, and the live demo link.

**R2.2** Everything else in the README is kept.

## R3 — Local power `exorcise-motion-harness`

**R3.1** Lives at `.kiro/powers/exorcise-motion-harness/` in the Agent Plugins
format: `plugin.json` with `$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`,
`name`, `version`, `description`, `author {name: "Amit Mtrn"}`, `keywords` (harness,
motion, balance, webcam).

**R3.2** `skills/run-harness/SKILL.md` explains how and when to run sweep, wave
and demo and how to read the output. `skills/balance-stage/SKILL.md` explains the
balancer workflow.

**R3.3** `mcp.json` declares the same local stdio `motion-harness` server as
`.kiro/settings/mcp.json`: command `node`, no URL keys, no `env`, no absolute
paths, nothing outside the repo.

**R3.4** A test validates the manifest fields, the skill front matter, and that
`mcp.json` is local-only and equals the entry in `.kiro/settings/mcp.json`.

## R4 — Facts check test

**R4.1** A Vitest test fails if `docs/KIRO.md`, or the whole `README.md`,
mentions either banned name of the inspiring game (case-insensitive; the names are listed in the test, not here). `package.json` and `.kiro/steering/*.md` are scanned too.

**R4.2** The same test fails if either text contains a token-like string
(`ghp_`, `github_pat_`, `sk-`).

**R4.3** The test also checks that the README section links `docs/KIRO.md` and
that `docs/KIRO.md` has every required heading and its line count is in range.

## R5 — Rules

**R5.1** `.kiro` is not in `.gitignore`. No game code changes. No credentials
mentioned. Existing tests keep passing.
