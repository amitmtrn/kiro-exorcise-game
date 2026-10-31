# Deploy — Tasks

---

## T1 — Vite base path

File: `vite.config.ts`

- [ ] Add `base: '/kito-exorcise-game/'` to the `defineConfig` call.
- [ ] Run `npm run build` and verify it exits 0 and `dist/` is produced.
- [ ] Confirm `npm run dev` still starts without error.
- [ ] Commit: `feat(deploy): set vite base path for GitHub Pages`

---

## T2 — Sync lockfile

File: `package-lock.json`

- [ ] Run `npm install` to regenerate `package-lock.json` from `package.json`.
- [ ] Verify `npm ci` exits 0 in a clean install (`npm ci` after deleting
  `node_modules`).
- [ ] Commit: `fix(deploy): sync package-lock.json so npm ci succeeds`

---

## T3 — GitHub Actions workflow

File: `.github/workflows/deploy.yml`

- [ ] Create `.github/workflows/` directory.
- [ ] Write `deploy.yml` exactly as specified in the design:
  - Triggers: push to `main` + `workflow_dispatch`.
  - Permissions: `contents: read`, `pages: write`, `id-token: write`.
  - Concurrency: group `pages`, cancel-in-progress.
  - Build job: checkout → setup-node (20, npm cache) → `npm ci` → `npm test`
    → `npm run build` → configure-pages → upload-pages-artifact (`dist`).
  - Deploy job: needs build, environment `github-pages`, deploy-pages.
- [ ] Commit: `feat(deploy): add GitHub Actions workflow`

---

## T4 — README live link

File: `README.md`

- [ ] Replace the placeholder URL `https://exorcise.example.com` with
  `https://amitmtrn.github.io/kito-exorcise-game/` in the "Play now" section.
- [ ] Remove the `*(update after deploy)*` note.
- [ ] Commit: `docs(deploy): update README with live Pages URL`

---

## T5 — Manual: enable GitHub Pages (human step)

- [ ] Open the repository on GitHub.
- [ ] Go to **Settings › Pages**.
- [ ] Under **Source**, select **GitHub Actions**.
- [ ] Save.
- [ ] Push any commit to `main` (or trigger the workflow manually via
  **Actions › Deploy to GitHub Pages › Run workflow**).
- [ ] Wait for the workflow to go green.
- [ ] Visit `https://amitmtrn.github.io/kito-exorcise-game/` and verify the
  acceptance criteria:
  1. No 404s in the browser console.
  2. Webcam permission prompt appears.
  3. Mirrored video shows; enemies spawn and can be swatted.
  4. Denying webcam shows the error screen with "Try again".
  5. Works in latest Chrome and Firefox.
