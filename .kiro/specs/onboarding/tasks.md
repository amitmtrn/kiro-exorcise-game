# Onboarding — Tasks

## T1 — Onboarding state machine and storage (pure)
Files: `src/game/onboarding.ts`, `src/game/onboarding.test.ts`, `src/game/onboarding.property.test.ts`

- [x] Types, `createOnboarding(seen)`, `onboardingReducer`, `shouldPersist`, copy constants (`PRIVACY_LINE`, `HOWTO_STEPS`, `GUIDE_TEXT`).
- [x] `hasSeenOnboarding` / `persistSeen` with throwing-storage tolerance, key `exorcise.onboarding.v1`.
- [x] Unit tests: first run, next/back chain, skip, finish, remembered, denied/retry/resume, ignored events, exact privacy wording.
- [x] Property tests: valid states, `howtoIndex` 0–2, seen iff finished/skipped.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(onboarding-T1): onboarding state machine and storage`

## T2 — Framing check (pure)
Files: `src/webcam/framing.ts`, `src/webcam/framing.test.ts`, `src/webcam/framing.property.test.ts`

- [x] `checkFraming`, thresholds, `tickFraming` (deltaMs-based stability).
- [x] Unit tests on synthetic frames: dark, close-up skin, flat, textured ok, check order, stability reset.
- [x] Property tests: deterministic, four statuses, darker never turns `too-dark` into non-dark.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(onboarding-T2): framing check on synthetic frames`

## T3 — Self-hosted Creepster font
Files: `src/assets/fonts/*`, `src/style.css`, `src/ui/fonts.ts`, `tools/fonts.test.mjs`, `src/ui/screens.ts`, `src/game/render.ts`

- [x] Bundle `Creepster-Regular.ttf` and `OFL.txt` (one-time download from google/fonts, `ofl/creepster/`).
- [x] `@font-face` from the local file; `TITLE_FONT_FAMILY` with fallbacks; `loadTitleFont()`.
- [x] Apply to title, stage title, STAGE CLEAR, GAME OVER, YOU WIN, in-game call-outs.
- [x] `tools/fonts.test.mjs`: no `http(s)` in font references, files exist, CSS points at the local file.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(onboarding-T3): self-hosted Creepster display font`

## T4 — Onboarding and camera-denied UI, wiring
Files: `src/ui/onboarding.ts`, `src/ui/onboarding.test.ts`, `src/ui/screens.ts`, `src/main.ts`, `src/style.css`

- [x] `guideGeometry` + `drawGuide` procedural silhouette; `runOnboarding` loop (deltaMs-based framing sampling), HTML panel, keyboard and buttons.
- [x] `classifyCameraError`, `showCameraDenied` / `hideCameraDenied` (link-free); remove `showWebcamError` from `screens.ts`.
- [x] `main.ts`: denied → instructions + retry; first run → onboarding → persist; seen → straight to the game.
- [x] Unit tests: geometry bounds (incl. property), error classification, denied copy has no links/URLs.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `feat(onboarding-T4): first-run onboarding and camera-denied screens`

## T5 — Docs
Files: `README.md`

- [x] Credit Creepster (Font Diner, OFL 1.1, link to `src/assets/fonts/OFL.txt`); onboarding + privacy note; specs table row and file tree; test count synced (`node tools/sync-readme-tests.mjs`).
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `docs(onboarding-T5): README font credit and onboarding notes`

## T6 — Review fixes
Files: `src/ui/onboarding.ts`, `src/game/onboarding.ts`, `src/main.ts`, `src/game/loop.ts`, tests, specs

- [x] Guide geometry: shoulders below chin, figure above the panel (R2.5); tests on both.
- [x] Space on buttons / start latch cleared in `startLoop`; `e.repeat` ignored (R8.1).
- [x] Brightness-monotone property test for `too-dark` (R7.2).
- [x] Skull card copy includes ☠; framing reset on guide re-entry; ok-time credited from first ok sample; tests.
- [x] Camera loss mid-onboarding → denied screen, real module-level state; font load parallel to `getUserMedia`; skip sampling before first frame (R8.2).
- [x] `getLocalStorage` throwing-path test.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(onboarding): review fixes`

## T7 — Second review fixes
Files: `src/ui/onboarding.ts`, `src/ui/fonts.ts`, `src/main.ts`, `src/game/loop.ts`, `src/style.css`, tests, specs

- [x] Camera loss resumes the same step/card: `runOnboarding(…, initial, onState)` shares state with `main.ts` (R8.2).
- [x] Start latch also cleared after the calibration await (R8.1).
- [x] Already-ended track → `cameraLost`; no time banked while video has no frame; stale `data-status` cleared.
- [x] `.screen-error .privacy` keeps its style; panel capped at `40vh` with compact short-window rules (R2.5).
- [x] Denied instructions ordered by kind (R5.4); font timeout timer cleared.
- [x] Specs: R2.4/R2.5 and R7/R8 order fixed; R5.4, R2.5, R8.2 updated.
- [x] Tests: `onboarding.run.test.ts` (wiring, ended track, stall, instructions, CSS guards), `fonts.test.ts`.
- [x] `npm test` and `npm run build` both clean.
- [x] Commit: `fix(onboarding): resume step on camera loss, calibration latch, polish`
