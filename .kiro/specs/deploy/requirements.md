# Deploy — Requirements

## Scope

Automate publishing Exorcise to GitHub Pages so every push to `main` builds
the game and makes it playable at
`https://amitmtrn.github.io/kiro-exorcise-game/`.
Pages serves over HTTPS, satisfying the browser requirement for `getUserMedia`.

---

## R1 — Correct base path

**R1.1** `vite.config.ts` must set `base: '/kiro-exorcise-game/'` so the
built JS and CSS bundles reference assets at the correct subpath when served
from GitHub Pages.

**R1.2** Setting `base` must not break `npm run dev` (Vite uses `'/'` for the
dev server regardless of the configured base when running locally).

**R1.3** `npm run build` must complete without errors after the change.

---

## R2 — Lockfile in sync

**R2.1** Running `npm ci` in a clean environment must succeed.

**R2.2** `package-lock.json` must be committed and match `package.json` exactly
(no version mismatches that would cause `npm ci` to fail in CI).

---

## R3 — GitHub Actions workflow

**R3.1** The workflow file lives at `.github/workflows/deploy.yml`.

**R3.2** It triggers on:
- `push` to the `main` branch.
- Manual trigger via `workflow_dispatch`.

**R3.3** Top-level permissions: `contents: read`, `pages: write`,
`id-token: write`.

**R3.4** A concurrency group `pages` cancels any in-progress run when a new
one is queued (prevents stale deploys).

**R3.5** The **build** job:
1. `actions/checkout@v4`
2. `actions/setup-node@v4` — Node 20, npm cache enabled.
3. `npm ci`
4. `npm test` — if tests fail, the job fails and nothing deploys.
5. `npm run build` — outputs to `dist/`.
6. `actions/configure-pages@v5`
7. `actions/upload-pages-artifact@v3` with `path: dist`.

**R3.6** The **deploy** job:
- `needs: build`
- `environment: github-pages` (grants the Pages deployment URL to the run).
- `actions/deploy-pages@v4`

**R3.7** Test failure in the build job prevents the deploy job from running.

---

## R4 — Repository configuration (manual, once)

**R4.1** In the GitHub repository Settings › Pages, the Source must be set to
**GitHub Actions**. This cannot be automated via a workflow; a human must do it
once.

---

## R5 — README live link

**R5.1** The README must show the live Pages URL as the primary "Play now"
link, replacing the placeholder `https://exorcise.example.com`.

**R5.2** The link must appear near the top of the README so judges see it
without scrolling.

---

## Acceptance criteria

1. A push to `main` runs the workflow green (tests → build → deploy).
2. `https://amitmtrn.github.io/kiro-exorcise-game/` loads with no 404s for
   JS or CSS assets (verified in browser console).
3. The browser requests webcam permission; the mirrored video shows and
   enemies spawn and can be swatted.
4. Denying the webcam shows the error screen with "Try again".
5. Works in the latest desktop Chrome and Firefox.
6. `.kiro/` is committed and absent from `.gitignore`.
