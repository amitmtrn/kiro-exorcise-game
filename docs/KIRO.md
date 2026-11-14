# How Kiro was used in Exorcise

Exorcise is a browser game for Halloween: you swat ghosts and bats with your
hands in front of a webcam. Frame differencing detects the motion. The whole game
runs client-side in TypeScript + Vite.

This page is the write-up for the Kiroween 2026 judges. Every number comes from
this repo (the command is shown) or from off-repo orchestration logs
(marked "(log)"). Repo counts are taken at merge commit `df26f4d`
(PR #5, before the `judge-docs` spec) unless stated otherwise, so they stay
reproducible: `git checkout df26f4d` and run the same command.

## TL;DR

| What | Number | How to check |
|---|---|---|
| Specs (requirements + design + tasks each) | 20 at PR #5; 22 now (`demo-mode` and `judge-docs` added) | `ls .kiro/specs` |
| Ticked task checkboxes | 805 | `cat .kiro/specs/*/tasks.md \| grep -c '^- \[x\]'` |
| Unticked task checkboxes | 103 (49 are in `boss-combo`, superseded by `stages`; the rest are manual checks such as webcam playthroughs) | `grep -c '^- \[ \]'` per file |
| Commits | 175 | `git rev-list --count df26f4d` |
| Commits named after a spec task, `<type>(<spec>-T<n>)` (67 `feat`, 14 `docs`, 6 `test`, 2 `fix`) | 89 | `git log df26f4d --oneline -E --grep='\([a-z0-9-]+-T[0-9]+\)' \| wc -l` |
| `fix(...)` commits, mostly review fixes | 57 | `git log df26f4d --oneline -E --grep='^fix' \| wc -l` |
| Unit and property tests | 1120 passed, 0 failed, 0 skipped at PR #5; 1291 passed, 0 failed, 0 skipped on this branch after merging main (demo mode and `judge-docs`) | `npm test` |
| Test files | 96 at PR #5; 108 on this branch after merging main | `npm test` ("Test Files") |
| Property tests: `fc.assert` calls (at df26f4d) | 119 in 31 files | `grep -rh 'fc\.assert' src tools \| wc -l` |
| Hooks | 5 hook entries in 3 files | `ls .kiro/hooks` |
| Steering files | 3, 233 lines | `wc -l .kiro/steering/*.md` |
| Custom agents | 1 (`balancer`) | `ls .kiro/agents` |
| MCP servers | 1 (`motion-harness`, local stdio, 2 tools) | `.kiro/settings/mcp.json` |
| Pull requests | 6 merged (#1 to #6), 1 more (#7) adds this write-up | (log) |
| Kiro credits | 536.22 of a 4000 bonus pool, after the `judge-docs` spec and its review fixes | (log) |
| Kiro app | Kiro CLI 3.3.0 only | (log) |

## How Kiro was used

**Kiro CLI only.** All code, specs, tests and docs since PR #1 were written by
Kiro CLI 3.3.0, non-interactively (log):

```bash
kiro-cli chat --no-interactive --trust-all-tools --trust-workspace "<prompt>"
# later turns of the same session: add --resume
```

The earlier specs (`mvp`, `audio`, `stages`, `spooky-skin`, `deploy`,
`hit-detection-fix`, `boss-combo`) predate this run and are in git history.

Every spec followed the same loop (log):

```
 1. Kiro writes requirements.md, design.md, tasks.md        (no code yet)
 2. Kiro implements the tasks, one commit per task
 3. An independent reviewer (Claude Code, not Kiro) reads the branch, read-only
    (no file edits; it can run build, tests, read code and git). Its
    review ends in VERDICT: READY or VERDICT: NOT READY
 4. The review is fed back to Kiro, which fixes the findings
 5. Repeat 3 and 4 until READY (optional nit pass, then re-review)
```

The reviewer never edited code. Kiro made every fix. One pull request per feature
from PR #2 on (PR #1 bundled the P0/P1 specs). A human (Amit) merged the PRs.

Review files per spec (rounds plus final re-reviews) (log): balancer 5, boss-phases 3,
demo-mode 6, exorcist-card 3, feel-fix 1, hooks 4, juice 2,
motion-ui-ergonomics 6, music-v2 5, onboarding 4, pbt 3, two-player 4,
two-player-card 3, waves 4. Merging PR #3 had one more review.

### Kiro apps

Kiro CLI 3.3.0 only. It did the specs, code, tests, docs, the `balancer` agent and
hook validation (`kiro-cli agent validate`). IDE, Web and Crew were not used.

## Spec-driven development

### Structure

Every spec is a folder `.kiro/specs/<name>/` with three files:

| File | Holds |
|---|---|
| `requirements.md` | Goal, out-of-scope, numbered requirements (`R1.1`, `R1.2`, ...) |
| `design.md` | Files and data flow, constants, formulas, tables, the reasons for choices |
| `tasks.md` | Tasks `T1..Tn`, each with a `Files:` line, checkboxes, and a last checkbox `Commit: \`feat(<spec>-T<n>): ...\`` |

**Requirements excerpt** (`.kiro/specs/motion-ui-ergonomics/requirements.md`):

```markdown
**R1.1** Every motion button of every screen and mode has its centre at or above
**40 %** of the canvas height (rows at 19 % and about 39 %, or lower only to
clear the mute button, never below 40 %).
```

**Design excerpt** (`.kiro/specs/motion-ui-ergonomics/design.md`):

```markdown
| Constant | Value | Meaning |
|---|---|---|
| `ROW_A` | 0.19 H | first row (prefer 15–35 %) |
| row B | `ROW_A·H + 3.1·r` | second row, centre distance 3.1 r (gap 1.1 r); ≤ 0.40 H … |
| … | … | other rows omitted |
```

**Tasks excerpt** (`.kiro/specs/motion-ui-ergonomics/tasks.md`):

```markdown
## T1 — Pure layout module
Files: `src/ui/layout.ts`, `src/ui/layout.test.ts`, `src/ui/layout.property.test.ts`

- [x] `layout.ts`: constants, `buttonLayout`, `areaButtons`, `textBand`, ...
- [x] …
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(motion-ui-ergonomics-T1): pure raised-hand button layout`
```

A checkbox is ticked only when the code and tests for it exist. After each task
`npm test` and `npm run build` must both pass.

### One commit per task: traceability

The requirement `R1.1` above leads to task T1, and T1 names its commit. The
`motion-ui-ergonomics` spec in git (`git log df26f4d --oneline --grep='(motion-ui-ergonomics-T'`):

| Task | Commit | Message |
|---|---|---|
| T1 | `28afe9e` | feat(motion-ui-ergonomics-T1): pure raised-hand button layout |
| T2 | `a18fe4e` | feat(motion-ui-ergonomics-T2): coverage-based dwell activation with decay, latch and exclusive resolution |
| T3 | `2b62961` | feat(motion-ui-ergonomics-T3): 1P buttons in raised-hand zones |
| T4 | `5ee47be` | feat(motion-ui-ergonomics-T4): 2P per-half raised-hand buttons |
| T5 | `bcec29c` | feat(motion-ui-ergonomics-T5): sound hint at the top, onboarding hand targets from the layout |
| T6 | `c12ed85` | docs(motion-ui-ergonomics-T6): controls, harness and spec index |
| T11 | `f658afb` | feat(motion-ui-ergonomics-T11): buttons within raised-hand reach at 2.5 m |

T7 to T10 and T12 were review fixes (fix commits such as `1fb0ca8`, `53ff6eb`,
`b5ecbd4`, `fede042`). T11 came from a later review finding (see below). Other specs
follow the same pattern, for example `feel-fix`: T1 `99adc0b`, T2 `0177b84`, T3 `eba093f`, T4 `064e923`.

Task commits per spec (`git log df26f4d --oneline --grep='(<spec>-T' | wc -l`):
stages 9 (8 under the TL;DR regex: `f28b4da feat(stages-T3/T5/T6)` is one
commit for three tasks); balancer, motion-ui-ergonomics, pbt 7; juice, music-v2,
waves 6; boss-phases, exorcist-card, onboarding, two-player, two-player-card 5;
audio, feel-fix, hooks 4; `skin` (spec `spooky-skin`, `feat(skin-T1)` to
`feat(skin-T5)`) 5. The older specs `mvp`, `deploy`, `hit-detection-fix` and
`boss-combo` predate the `(<spec>-T<n>)` naming.

### Comparison with vibe coding

We did not run a vibe-coding control, so this is not a measured comparison.
What the repo does show:

- **Specs surfaced gaps before code.** The README records that writing
  requirements and design first exposed gaps such as skull penalty rules, the
  hitbox coordinate system and a mirror-parity bug (`hit-detection-fix`).
- **Specs gave the reviewer something to check against.** The reviewer compared
  code with numbered requirements (`R1.1`, `R2.3`), so findings were concrete.
  Review catches that a prompt-and-run loop would likely have shipped (all fixed
  by Kiro) (log):
  - `motion-ui-ergonomics`: sound-hint timers were called unbound, giving
    "Illegal invocation", so the browser would crash on boot.
  - `motion-ui-ergonomics`: buttons sat at hip-to-shin height (72 to 92 % of the
    frame). They moved to raised-hand zones (19 to 39 %) using a reach model at 2.5 m.
  - `motion-ui-ergonomics`: text was unreadable at 640 px wide.
  - `demo-mode` (PR #6): reload and fullscreen keys dropped the user out of demo;
    demo speed depended on the display refresh rate; holding G entered demo and
    left it at once; loop 2 drifted from loop 1 below speed 2; PLAY AGAIN bypassed
    the seeded start.
  - `balancer`: a `vm` sandbox escape in the MCP server's config evaluation.
  - `pbt`: a flaky property test.
- **Specs record the bugs.** `pbt/tasks.md` has a "Bugs found by properties"
  section (BUG-1 to BUG-5), each with the requirement, the fix and the regression test.
- **Cost.** The spec-first loop is slower per feature: 1 to 6 review rounds each.
  Of 175 commits, 57 are `fix(...)` commits, mostly review fixes. They show how much a first implementation still got wrong.
- **Limits.** Some specs drifted from the code during review fixes. The `hooks`
  spec's `tasks.md` carries "superseded by T5/T6" notes where later fixes changed
  earlier tasks, and the `spec-drift-check` hook exists to catch this kind of drift.

## Steering

Three files in `.kiro/steering/` (`wc -l`):

| File | Lines | What it enforces |
|---|---|---|
| `product.md` | 38 | Audience, core loop, scoring, constraints |
| `design.md` | 112 | Look and sound: palette, enemies, HUD, audio rules |
| `tech.md` | 83 | Stack, project layout, frame-diff algorithm, tuning knobs, performance, tests |

Short quotes:

- `product.md`: "Kids and families. The tone is spooky but fun, never scary or violent."
- `product.md`: "No backend or server-side processing; everything runs client-side."
- `design.md`: "**Only free or self-made assets.** No copyrighted sounds."
- `tech.md`: "Treat that as "no new frame" ..., never as "no motion"."

**Which mattered most: `tech.md`.** It fixed the stack and the algorithm, so no
session had to ask "what stack are we using?". Its camera-frame-rate paragraph
(30 fps webcam under a 60 fps loop) is the one the code kept relying on: the
hit-detection fix and the button logic all read `computeMotionMask().changed`
(`src/webcam/diff.ts`, `src/game/collision.ts`) and treat a duplicate frame as
"no new frame". `product.md` ranks second: its privacy and no-backend lines
became tests.

**Steering rule in code, privacy.** `product.md` says everything runs client-side.
The code has a visible line, `PRIVACY_LINE = 'Your video stays on your device.
Nothing is uploaded.'` (`src/game/onboarding.ts`), shown in onboarding. A test
enforces it for the card feature: `src/card/privacy.test.ts` fails if the card
sources contain `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`,
`localStorage`, `http://` or `https://`.

**Steering rule in code, duplicate camera frames.** `tech.md` (the "Camera frame
rate ≠ loop frame rate" paragraph) says a duplicate frame must be treated as "no new
frame", "never as "no motion"", and that an exactly-zero whole-frame luminance delta
signals it (`computeMotionMask().changed`). In `src/game/collision.ts:56`,
`updateMotionPixels` starts with `if (!mask.changed) return`, so a duplicate frame
keeps the last mask and does not count as a motion-free frame.

## Hooks

Three files in `.kiro/hooks/`, five hook entries, all in the `v1` format with
`PostFile*` triggers. The `hooks` spec exists because the first
`test-on-save.json` never fired (no `version`, camelCase `postToolUse` trigger).
It was rewritten and checked with `kiro-cli agent validate` (kiro-cli 3.3.0,
exit 0), and a structural test `tools/hooks.test.mjs` guards every hook file.

| Hook | Trigger | Matcher (summary) | Automates |
|---|---|---|---|
| `test-on-src-save` | `PostFileSave` | any file under a `src/` segment, except `*.test.ts` / `*.test.mjs` and `node_modules/` | Runs `npm test` (command, timeout 120 s) |
| `spec-drift-check` | `PostFileSave` | `.kiro/specs/<name>/tasks.md` | An **agent** hook: checks each ticked task against code, tests and `git log`, flags unticked-but-done items, prints a table. Report only, no edits |
| `readme-test-count` | `PostFileSave` | `*.test.ts` / `*.test.mjs`, not under `node_modules/` | Runs `node tools/sync-readme-tests.mjs`, which runs the tests and rewrites the count in README |
| `readme-test-count-on-create` | `PostFileCreate` | same | same |
| `readme-test-count-on-delete` | `PostFileDelete` | same | same |

The README test-count script is pure-function tested
(`tools/sync-readme-tests.test.mjs`). It refuses to write when tests cannot run
or fail. The `hooks` spec was reviewed 4 times (log), and the review rounds drove
the matcher fixes (both path separators, `node_modules/` skip, no double run of
`npm test` on test-file saves).

**Lesson, the spec-drift hook hijack (log).** The `spec-drift-check` agent hook
sometimes ran in the middle of a session, right after Kiro saved a `tasks.md`.
It then took over the Kiro session. The fix was in the prompts, not the hook:
every later task prompt told Kiro to answer a drift-check request briefly and
then continue until all tasks were implemented and committed. The hook stays
report-only, which is why answering it is safe. The lesson: an agent hook can pull a running
session off its task, so keep it short and read-only, and tell the main agent to
carry on.

## Custom agent and MCP

### The `balancer` agent (`.kiro/agents/balancer.json`)

A playtest tuner. It measures the game with a synthetic webcam and writes a
proposal report. Its tools are `read`, `write` and `@motion-harness`: no shell,
so it cannot commit or push. The only allowed write is
`tools/motion-harness/out/balancer-report.md`; writes to `src/`, `.kiro/`,
`.git/`, `package*.json`, `.gitignore` and others are denied by its permission
rules. A test (`tools/balancer-config.test.mjs`) asserts every deny glob.

Workflow in its prompt: read the tuning, run `sweep` then `wave`, do sanity
checks, then write the report with sections Metrics, Current tuning, Findings,
Proposed changes, Playtest checklist. At most five proposals, each at most about
20 percent from the current value, data-only, and labelled as hypotheses
because "the synthetic hand is a scripted blob, not a player".

### The `motion-harness` MCP server (`tools/motion-harness/mcp-server.mjs`)

Registered in `.kiro/settings/mcp.json` (command `node`, relative path, no `env`).
Plain Node, no dependencies, JSON-RPC over **stdio**.

| Tool | Arguments | Returns |
|---|---|---|
| `run_harness` | `mode`: `sweep` or `wave`; `seconds`: 5 to 120 (default 30) | `frames`, `hits`, `motionFrames`, `maxMotion`, `playFrames`, `firstPlayAtMs`, `threshold`, `highScoreSaved` |
| `read_stage_config` | none | the live `STAGES` and bonus-round wave scripts from `stages.ts` and `waves.ts` |

**Local only.** stdio transport, no network listener, no URL, no secrets, no
`env`. The harness runs headless Chrome against the local dev server with Chrome
restricted to loopback (`--host-resolver-rules`). One run at a time, with a lock,
and Vite and Chrome are closed when the run ends.

**What it enabled.**
- Headless checks of the real pipeline: real game build, real frame differencing,
  a 320×180 @ 30 fps synthetic video under a 60 fps loop. This is the case
  that broke hit detection before (README: a 30 fps webcam made the 2-frame hit
  gate impossible to pass; the harness reproduced 0 hits in 45 s and showed 12
  hits after the fix). Kiro could run it itself instead of asking for a manual
  webcam test.
- Balancing proposals from measured runs and the live config, written to a report
  a human reads.
- Later results (log). PR #5: `wave` pressed 1 PLAYER at 5.2 s with no key;
  `sweep` got 16 hits and saved a high score. PR #6: `SEED=5 run.sh demo 170`
  made 0 `getUserMedia` / `fetch` / `xhr` / `sendBeacon` calls and 1018 hits; the
  card appeared at 137.9 s and the loop restarted.

**Sandbox-escape catch (log, spec `balancer`).** `read_stage_config` transpiles
`stages.ts` and `waves.ts` and evaluates them with Node's `vm`. A review found
that the evaluation context could reach host objects, which is a sandbox escape.
Kiro fixed it: `evalSandboxed()` now builds `require` inside the context, uses a
null-prototype global so lookups cannot fall through to the host
`Object.prototype`, resolves only whitelisted module ids, and has a 2 s timeout
(commit `eb827a8`, "null-prototype sandbox global"). The `balancer` spec was
reviewed 5 times (log).

## Property-based testing

fast-check 4.10.2 is the only added dev dependency of the `pbt` spec
(`package.json`). It was added in `1b98007`.

| Measure | Value | Command |
|---|---|---|
| `fc.assert` calls (at df26f4d) | 119 | `grep -rh 'fc\.assert' src tools \| wc -l` |
| Files using `fc.assert` (at df26f4d) | 31 | `grep -rl 'fc\.assert' src tools \| wc -l` |

Property names, quoted from the tests: `multiplier is always in {1,2,3,4}`
(`state.property.test.ts`); `straight-line enemies end at the same position at
any frame rate` (`movement.property.test.ts`); `mirroring a hitbox twice is the
identity`; `a hitbox entirely outside the frame never registers a hit`
(`diff.property.test.ts`); `never throws and never invents metrics from arbitrary
text` (`mcp-server.property.test.mjs`).

**Did it catch what unit tests missed? Yes: once directly (BUG-1), and four more from review.** From the
"Bugs found by properties" section of `.kiro/specs/pbt/tasks.md`:

| Bug | Found by | What was wrong | Commit |
|---|---|---|---|
| BUG-1 | property T4, spawner cap | `tickSpawners` counted enemies once per tick, so when two spawn timers expired on the same tick both passed the cap check (shrunk counter-example: stage 2, 4 enemies, cap 5, ended at 6) | `f0a235a` |
| BUG-2 | review of the properties | `computeFrameDiff` had no horizontal bounds check: a hitbox over the left or right edge sampled the opposite edge of the adjacent row | `41e08cb` |
| BUG-3 | review, outside the diff | `resolveHits` kept scoring after game over, and the high score saved it | `59fbf92` |
| BUG-4 | review, outside the diff | effects decayed per frame (twice as long at 30 fps, half as long at 120 Hz) | `59fbf92` |
| BUG-5 | review, outside the diff | spawn timers dropped their overshoot (about half a frame per spawn) | `e4548d6` |

Only BUG-1 was found by running a property. BUG-2 to BUG-5 came from review of
the PBT work and each got a regression property. So, in this repo, properties
found one real bug directly and made the reviewer's four findings cheap to pin.

**The flaky property.** `src/game/swipe.property.test.ts` failed intermittently
for inputs within 1e-6 of the swipe threshold. Fix (`5eb2b14`): such cases are
skipped with `fc.pre`. That fix landed during the `balancer` review round
(`fix(balancer)`), not the `pbt` reviews. Seeded randomness helpers
(`src/test/prng.ts`: `mulberry32`, `withSeededRandom`) keep other properties
deterministic.

## Powers

A local power packages the motion-harness workflow:
`.kiro/powers/exorcise-motion-harness/`, in the Agent Plugins format.

| File | Purpose |
|---|---|
| `plugin.json` | `$schema` https://agent-plugins.org/schemas/1.0.0/plugin.schema.json, name, version, description, author `Amit Mtrn`, keywords harness / motion / balance / webcam |
| `skills/run-harness/SKILL.md` | How and when to run sweep, wave and demo, and how to read the metrics |
| `skills/balance-stage/SKILL.md` | The balancer workflow: read config, run, sanity-check, write a report |
| `mcp.json` | The same local stdio `motion-harness` server as `.kiro/settings/mcp.json` |

`tools/power-manifest.test.mjs` checks the manifest fields, the skill front matter,
and that `mcp.json` is local-only (command `node`, no URL keys, no `env`, relative
paths, equal to the settings entry).

**Honest status.** Before this spec no powers were installed (log). The power was
written in Kiro CLI, for installation in Kiro IDE (Powers panel → Import power
from a folder). It was **not exercised in the IDE**. The `demo` mode it mentions
is on main (PR #6, merge commit 46d9551), but the MCP tool offers only `sweep` and `wave`; `demo` runs through `run.sh`. The server path is relative, so the power works inside this
repo checkout only.

## Before → after examples

### UI audit: where the buttons moved

A read-only audit of every motion button (log) found that all of them
sat in the lower body band, needed only 3 moved samples and an 800 ms dwell, and
never decayed. The `motion-ui-ergonomics` spec moved them. Centres are in % of
canvas (width, height) at 1280×720; this is the final table of PR #5.

| Screen | Button | Before | After | Dwell |
|---|---|---|---|---|
| Start | 1 PLAYER | (50, 72) | (30, 19) | 650 ms |
| Start | 2 PLAYERS | (68.3, 72) | (70, 25.4) | 650 ms |
| 1P summary | NEXT | (50, 84) | (30, 19) | 650 ms |
| 1P game over | RETRY | (35, 72) | (30, 19) | 650 ms |
| 1P game over | EXORCIST CARD | (50, 90.5) | (30, 38.8) | 650 ms |
| 1P game over | MENU | (65, 72) | (70, 25.4) | 1000 ms |
| Victory | PLAY AGAIN | (35, 74) | (30, 19) | 650 ms |
| Victory | EXORCIST CARD | (50, 92.5) | (30, 38.8) | 650 ms |
| Victory | MAIN MENU | (65, 74) | (70, 25.4) | 1000 ms |
| 1P card preview | NO PHOTO / PHOTO | (50, 84.4) | (30, 19) | 650 ms |
| 1P card preview | CLOSE | (61.8, 84.4) | (30, 38.8) | 650 ms |
| 1P card preview | SAVE | (38.2, 84.4) | (70, 25.4) | 1000 ms |
| 2P summary | NEXT | (50, 84), shared | P1 (6, 19) / P2 (94, 19) | 650 ms |
| 2P end | PLAY AGAIN | (35, 73.5), shared | P1 (6, 19) / P2 (94, 19) | 650 ms |
| 2P end | MAIN MENU | (65, 73.5), shared | P1 (40, 25.4) / P2 (60, 25.4) | 1000 ms |
| 2P end | EXORCIST CARD | (25 / 75, 92.4) | P1 (6, 38.8) / P2 (94, 38.8) | 650 ms |
| 2P card preview | NO PHOTO / CLOSE | (25, 84.3) / (36.6, 84.3) | P1 (6, 19) / (6, 38.8); P2 mirrored | 650 ms |
| 2P card preview | SAVE | (13.4 / 63.4, 84.3) | P1 (40, 25.4) / P2 (60, 25.4) | 1000 ms |

Task T11 (`f658afb`) placed the buttons using a reach model at 2.5 m, moving them from
hip-to-shin height (72 to 92 % of the frame) to raised-hand zones (19 to 39 %) (log).

### Other before → after

- Hook file that never fired → 5 `v1` hooks, validated and tested (`hooks`).
- 0 hits in 45 s with a 30 fps camera → 12 hits, START triggered by waving (harness, `hit-detection-fix`).
- Spawner could exceed its cap → running count and regression property (`pbt` BUG-1).
- Frame-dependent movement and effects → `deltaMs`-scaled (spec rule `feel-fix` R1.2; `pbt` BUG-4).

### Test count history (log)

| PR | Feature | Tests |
|---|---|---|
| #1 | P0 and P1 specs (feel-fix, hooks, pbt, boss-phases, waves, juice, music-v2, balancer, onboarding) | 806 |
| #2 | exorcist-card | 912 |
| #3 | two-player | 994 |
| #4 | two-player-card | 1045 |
| #5 | motion-ui-ergonomics | 1120 |
| #6 | demo-mode | 1254 |
| #7 | judge-docs (this write-up, after merging main) | 1291 |

0 failed and 0 skipped at each point (log).

## Credits used

Cumulative Kiro `/usage`, from a bonus pool of 4000 (log):

| Point | Cumulative credits |
|---|---|
| After P0 (feel-fix, hooks, pbt, boss-phases) | ~56 |
| After juice | 115.87 |
| After music-v2 | 131.16 |
| After balancer agent + MCP | 155.34 |
| After onboarding (PR #1 complete) | 173.63 |
| After exorcist-card (PR #2) | 197.13 |
| After two-player (PR #3) | 230.59 |
| After two-player-card (PR #4) | 254.37 |
| After motion-ui-ergonomics (PR #5) | 324.89, then 333.24 after its final fixes |
| After demo-mode (PR #6) | 522.26 |
| After judge-docs review fixes (13.96 credits for the spec and its fixes) | 536.22 |

Largest steps: demo-mode (about 189) and motion-ui-ergonomics (about 70, plus 8).

## Demo mode
Demo mode is merged (PR #6, merge commit 46d9551). Open the game with `?demo=1&seed=5`:
no camera is used, the run is deterministic for a given seed, and it is meant for filming.

## What we didn't use

- **Kiro IDE.** Not used. All work was done in Kiro CLI on a Linux box. The hooks
  were validated with `kiro-cli agent validate` and unit tests only.
- **Kiro Web** and **Kiro Crew.** Not used.
- **Installed powers.** None before the local power above, which is untested in the IDE.
- **A vibe-coding control.** We did not build a second version without specs.
