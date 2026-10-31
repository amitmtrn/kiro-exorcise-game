# Audio — Requirements (P1)

## R1 — Licensing

**R1.1** All audio must be CC0, CC-BY (with attribution), or self-generated via the Web Audio API. No copyrighted material.

**R1.2** Attributions for any external audio files are listed in `README.md` under a "Credits" section and in a `CREDITS.md` file at the repo root.

---

## R2 — Background music

**R2.1** Each stage (1–4) has a distinct looping background track. Stage 5 (boss) has a separate boss track.

**R2.2** Tracks are either small OGG/MP3 files (< 1 MB each, CC0) or generated procedurally via Web Audio API.

**R2.3** Music starts on the first user interaction (browser autoplay policy). Before that, the game is silent.

**R2.4** Music crossfades (0.5 s) when transitioning between stages.

---

## R3 — Sound effects

| Event | Sound |
|---|---|
| Ghost hit | Cartoon whoosh / "poof" |
| Bat hit | Short squeak |
| Skull hit (penalty) | Low thud + creak |
| Life lost | Descending tone |
| Combo increment | Short ascending chime (pitch rises with combo) |
| Stage clear | Ascending 3-note fanfare |
| Boss hit | Deep resonant thump |
| Boss defeated | Triumphant fanfare (~3 s) |

All SFX generated procedurally with Web Audio API (no external files for SFX).

---

## R4 — Controls

**R4.1** A mute/unmute button (🔊/🔇) is always visible in the top-right HUD corner.

**R4.2** Pressing `M` toggles mute.

**R4.3** Volume is preserved in `localStorage`.

---

## R5 — Loading

**R5.1** If external music files are used, they are preloaded at game start before the start screen is shown, with a small loading indicator.

**R5.2** If all audio is procedural, no loading step is needed.
