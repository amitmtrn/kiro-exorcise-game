# Onboarding — Requirements

## Scope

A first-time player lands straight on a calibration banner and then the title
screen with no hint where to stand, what to swat or what happens to the camera
feed, and a denied camera shows a bare "please allow" message. This spec adds a
first-run onboarding screen before the start screen: a silhouette guide over the
live mirrored webcam with a framing check, a 3-step how-to-play, a privacy line,
a link-free camera-denied state with instructions, skip + "remember I have seen
it" via localStorage, and a self-hosted OFL display font for titles and call-outs.

Builds on `spooky-skin/` (tint + palette), `hit-detection-fix/` (frame
differencing needs texture and light) and `feel-fix/` (all timing is `deltaMs`
based). Out of scope: new audio, any network request, gameplay changes, new
runtime dependencies.

---

## R1 — Onboarding state machine

**R1.1** A pure reducer (`src/game/onboarding.ts`) models the steps `guide`,
`howto` (sub-index 0–2), `denied` and `done`.

**R1.2** First run (nothing stored) starts in `guide`; a stored "seen" flag
starts in `done` (R4.3).

**R1.3** `next` moves guide → howto 0 → 1 → 2 → done; `back` moves one step
back (never before the guide); `skip` is accepted in `guide` and `howto` and
goes straight to `done`. Events that do not apply to the current step leave the
state unchanged.

**R1.4** `cameraDenied` is accepted in every step and moves to `denied`,
remembering the step to resume; `retry` returns from `denied` to that step.

**R1.5** Finishing (`next` from how-to step 3) and skipping both mark the
onboarding as seen. Entering `denied` never marks it as seen.

---

## R2 — Silhouette guide and framing check

**R2.1** The guide step draws a procedural silhouette (head and shoulders plus
two hand targets) over the live mirrored webcam view with the text "Stand back so
your head and both hands are in frame". No bitmap assets.

**R2.2** `checkFraming(frame)` (`src/webcam/framing.ts`, pure, on RGBA pixel
data) returns one of `ok`, `too-dark`, `too-close`, `low-detail`:
- `too-dark`: mean luminance below `FRAMING_MIN_LUMA`.
- `too-close`: at least `FRAMING_CLOSE_SKIN` of the central region is
  skin-toned (a face or hand filling the lens).
- `low-detail`: the share of pixels with local contrast ≥ `FRAMING_EDGE_DELTA`
  is below `FRAMING_MIN_DETAIL` (a flat or blown-out picture gives frame
  differencing nothing to detect).
- otherwise `ok`. Checks are evaluated in that order.

**R2.3** The check is advisory: it never blocks Next or Skip. Each status has a
short, friendly hint; `ok` shows "Looking good!" once it has held for
`FRAMING_STABLE_MS` of accumulated `deltaMs` (reset by any non-ok result).

**R2.5** The silhouette and hand targets stay clear of the bottom-anchored
panel, and the shoulders' top lies below the chin (head remains visible).

**R2.4** The check samples a small downscaled frame at most every
`FRAMING_INTERVAL_MS` of `deltaMs`, never per rendered frame.

---

## R3 — How to play and privacy

**R3.1** Three steps, one per card, in this order: 1 "Swat the ghosts and bats
with your hands", 2 "Don't touch the cursed skull ☠", 3 "Chain hits to build
combos".

**R3.2** The guide and how-to screens show the privacy line exactly:
`Your video stays on your device. Nothing is uploaded.`

**R3.3** Every screen is operable by mouse/touch buttons (Next, Back, Skip) and
by keyboard (Enter/Space = Next, Escape = Skip). No motion-button dependency.

---

## R4 — Skip and remember

**R4.1** The "seen" flag is stored in `localStorage` under
`exorcise.onboarding.v1`, as `"1"`.

**R4.2** Storage access is wrapped: a missing or throwing `localStorage`
(private mode, blocked cookies) never breaks the game; onboarding then simply
shows again next visit.

**R4.3** When the flag is present, boot goes directly to the existing
calibration and start screen without showing onboarding.

---

## R5 — Camera permission denied

**R5.1** If `getUserMedia` rejects, the player sees a screen explaining that
Exorcise needs the camera, with numbered instructions (click the camera/lock
icon in the address bar, set Camera to Allow, press Try again; close other apps
using the camera) and the privacy line.

**R5.2** The message distinguishes "blocked" (`NotAllowedError`,
`SecurityError`) from "no camera / camera busy" (`NotFoundError`,
`NotReadableError`, others) by `classifyCameraError`.

**R5.3** The screen is link-free: no `<a>` element, no `http(s)://` or
`chrome://` text. A "Try again" button re-requests the camera.

---

## R6 — Self-hosted display font

**R6.1** "Creepster" (Font Diner, OFL 1.1) is bundled as
`src/assets/fonts/Creepster-Regular.ttf` together with its licence
`src/assets/fonts/OFL.txt`.

**R6.2** It is loaded with `@font-face` from the local file only, with
`font-display: swap`; no Google Fonts CDN, no `http(s)` URL in any CSS/TS font
reference, no runtime font fetch.

**R6.3** `TITLE_FONT_FAMILY` is `'Creepster'` followed by system fallbacks and a
generic family. Titles and call-outs (title screen, stage title, STAGE CLEAR,
GAME OVER, YOU WIN, in-game call-outs, onboarding headings) use it; HUD numbers
and body text keep the existing fonts.

**R6.4** README credits the font: name, designer/foundry, licence OFL 1.1, and a
link to the bundled `OFL.txt` path.

---

## R8 — Input and camera-loss robustness (review fixes)

**R8.1** Space/Enter on a focused button activates only that button; Space never
starts the game before the start screen, and held keys (`e.repeat`) do not
advance onboarding cards.

**R8.2** Losing the camera mid-onboarding shows the camera-denied screen and
Try again resumes the same step. Framing samples are skipped until the video has
a frame, and framing state resets when the guide is re-entered.

---

## R7 — Tests

**R7.1** Unit tests for the state machine (first run, skip, finish, remembered,
denied/retry) and storage helpers (throwing storage). Property test: any event
sequence stays in valid states, `howtoIndex` stays 0–2, and "seen" is persisted
iff `done` was reached by finish or skip.

**R7.2** Unit tests for `checkFraming` on synthetic frames (dark, close-up skin,
flat, textured, order of checks) plus a property test (deterministic, always one
of four statuses, brightness-monotone for `too-dark`).

**R7.3** A test asserts no `http(s)://` URL appears in `@font-face` / `url(` /
font references in CSS, HTML and TS sources, that the TTF and OFL.txt exist, and
that the CSS references the local file.

**R7.4** Existing unit and property tests keep passing.
