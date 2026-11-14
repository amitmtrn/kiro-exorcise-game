---
name: balance-stage
description: Propose small data-only tuning changes to Exorcise stages.ts and waves.ts from motion-harness metrics. Use when asked to balance difficulty. Report only; never edit game code.
---

# Balance a stage (balancer workflow)

Mirrors the `balancer` agent in `.kiro/agents/balancer.json`. This skill produces a
written report. It does not change code and does not commit.

## Steps

1. Call `read_stage_config` (no arguments). It returns the live `STAGES` and the
   `BONUS_ROUND` wave scripts from `src/game/stages.ts` and `waves.ts`.
2. Skim `.kiro/steering/*.md`, `.kiro/specs/stages/` and `.kiro/specs/waves/` for the
   intended curve: durations, lives, combo tiers, `maxEnemies`, spawn intervals,
   `speedMultiplier`.
3. Call `run_harness` with `mode: "sweep"`, then with `mode: "wave"` (30 s each).
   One run at a time. If a run fails, report the error text and stop after one retry.
4. Do the sanity checks from the `run-harness` skill first. If one fails, say the
   problem is detection or the harness and propose no balance changes.
5. Write `tools/motion-harness/out/balancer-report.md` (git-ignored) with the sections
   Metrics, Current tuning, Findings, Proposed changes, Playtest checklist.

## Proposal rules

- Each proposal names the file and field, the old and new value, the metric or spec
  requirement behind it, and the risk.
- At most five proposals, each at most about 20 percent from the current value.
- Numbers in `stages.ts` and `waves.ts` only. No logic changes, dependencies, network
  use or assets.
- Keep 3 lives, the combo tiers, the kid-friendly tone, and stage 5 as the boss stage.
- Gameplay timing stays `deltaMs`-based. Never propose per-frame constants.
- Order proposals by expected impact and say which to try first.

## State the limits in every report

- The synthetic hand is a scripted blob, not a player. Label every proposal a
  hypothesis to confirm in a real webcam playtest.
- One short run is noisy. Do not draw conclusions from small differences.

Applying the proposals is the user's decision.
