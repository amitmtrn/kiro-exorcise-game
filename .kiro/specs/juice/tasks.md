# Juice — Tasks

## T1 — Swipe direction estimation
Files: `src/game/swipe.ts`, `src/game/state.ts`, `src/game/collision.ts`,
`src/game/swipe.test.ts`, `src/game/swipe.property.test.ts`, `src/game/collision.test.ts`

- [ ] `swipe.ts`: `motionPointsIn`, `centroid`, `mirrorPoints`, `estimateSwipe` (shift → radial → default fallbacks, unit vector, no NaN).
- [ ] `Enemy.motionX? / motionY?`; `resolveHits` records the centroid on motion frames, clears it on still frames, keeps it on duplicate camera frames, and publishes `lastSwipes` on a confirmed hit.
- [ ] Unit tests: blob moving right/left/up/down on synthetic masks and ImageData, mirrored masks flip `dx`, fallbacks, hit publishes a swipe in `collision.test.ts`.
- [ ] Property tests: always unit length and finite, mirror twice = identity, mirroring negates `dx` and keeps `dy`.
- [ ] Run `npm test` and `npm run build`; both clean.
- [ ] Commit: `feat(juice-T1): swipe direction from the motion mask`

## T2 — Knock-back
Files: `src/game/knock.ts`, `src/game/state.ts`, `src/game/collision.ts`,
`src/game/loop.ts`, `src/game/render.ts`, `src/game/knock.test.ts`, `src/game/knock.property.test.ts`

- [ ] `knock.ts`: `makeKnock`, `knockPose`, `tickKnocks`; closed-form drag trajectory, spin, fade, shrink.
- [ ] `GameState.knocks`; `resolveHits` adds a knock for every banished non-skull enemy (including the boss); loop ticks knocks (also on summary / game-over); `render.ts` draws them with the existing enemy routines.
- [ ] Unit tests: moves along the swipe, spin sign follows `dx`, expiry, strength clamp, skull spawns none, boss defeat spawns one.
- [ ] Property tests: displacement along the unit vector and non-decreasing, alpha and scale monotone, state independent of step size.
- [ ] Run `npm test` and `npm run build`; both clean.
- [ ] Commit: `feat(juice-T2): knock banished enemies along the swipe`

## T3 — Hit-stop
Files: `src/game/hitstop.ts`, `src/game/state.ts`, `src/game/collision.ts`, `src/game/round.ts`,
`src/game/loop.ts`, `src/game/hitstop.test.ts`, `src/game/hitstop.property.test.ts`

- [ ] `hitstop.ts`: `HITSTOP_MS`, `addHitStop`, `splitHitStop`.
- [ ] `GameState.hitStopMs`; `resolveHits` sets it on scoring banishes; `tickRound` clears it when a stage starts; loop drives the simulation with `liveMs` while hit detection, camera and rendering use the real delta.
- [ ] Unit tests: 60 ms at 30 / 60 / 144 Hz, stall crossing the end, max-merge, banish sets it, skull does not.
- [ ] Property tests: `frozen + live = delta`, total frozen = budget for any step partition, remaining never negative.
- [ ] Run `npm test` and `npm run build`; both clean.
- [ ] Commit: `feat(juice-T3): 60 ms hit-stop on banish`

## T4 — Combo call-outs
Files: `src/game/callouts.ts`, `src/game/state.ts`, `src/game/collision.ts`,
`src/game/loop.ts`, `src/game/render.ts`, `src/game/callouts.test.ts`

- [ ] `callouts.ts`: `selectCallout`, `makeCallout`, `addCallout`, `tickCallouts`, `calloutPose`.
- [ ] `GameState.callouts`; `resolveHits` adds the call-out after the combo update; loop ticks them with game time; `render.ts` draws them.
- [ ] Unit tests: selection per tier (x1 none, x2 NICE!, x3 GREAT!, x4 PERFECT!), tier-up text for x2/x3/x4, praise cadence, clamping, cap of 3, expiry, pose envelope.
- [ ] Run `npm test` and `npm run build`; both clean.
- [ ] Commit: `feat(juice-T4): combo call-outs`

## T5 — Stage intro / outro animations
Files: `src/game/transitions.ts`, `src/ui/screens.ts`, `src/game/transitions.test.ts`

- [ ] `transitions.ts`: `easeOutBack`, `introPose`, `outroPose`.
- [ ] `renderStageTitle` slides the title and subtitle in and fades out; `renderSummary` fades the overlay, drops in and wobbles the STAGE CLEAR banner, staggers the stat rows. Text and motion buttons unchanged at rest.
- [ ] Unit tests: poses at start / rest / end, wobble settles, easing endpoints, recording-context check that the title is drawn off-centre at t = 0 and centred at rest.
- [ ] Run `npm test` and `npm run build`; both clean.
- [ ] Commit: `feat(juice-T5): stage intro and outro animations`

## T6 — Docs
- [ ] README: spec table row, spec count, juice section; test count synced.
- [ ] Run `npm test` and `npm run build`; both clean.
- [ ] Commit: `docs(juice-T6): README`

## T7 — Manual smoke test (webcam)
- [ ] Swat a ghost to the right: it flies right, spinning and fading; swat left / up: it flies that way.
- [ ] A hit feels like a short freeze (~60 ms); the camera image keeps moving.
- [ ] NICE! / GREAT! / PERFECT! and `x2 COMBO!` … `x4 COMBO!` appear at the right streaks.
- [ ] Stage title slides in; STAGE CLEAR drops in with a wobble.
