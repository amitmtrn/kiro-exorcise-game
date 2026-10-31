# Deploy — Design

## Architecture

```
developer pushes to main
        │
        ▼
GitHub Actions: build job
  ├─ checkout
  ├─ setup Node 20
  ├─ npm ci          (deterministic install from lockfile)
  ├─ npm test        (49 unit tests — gate; fail = stop)
  ├─ npm run build   (tsc + vite → dist/)
  ├─ configure-pages (sets base URL metadata for artifact)
  └─ upload-pages-artifact (packages dist/ as Pages artifact)
        │
        ▼ (only if build job succeeded)
GitHub Actions: deploy job
  └─ deploy-pages    (publishes artifact to github.io CDN)
        │
        ▼
https://amitmtrn.github.io/kito-exorcise-game/
```

---

## Vite base path

GitHub Pages serves the repo at a subpath:
`https://amitmtrn.github.io/kito-exorcise-game/`

Without a configured `base`, Vite generates asset references starting with `/`
(e.g. `/assets/index-xxx.js`), which resolve to
`https://amitmtrn.github.io/assets/index-xxx.js` — a 404.

Setting `base: '/kito-exorcise-game/'` makes Vite emit:
`/kito-exorcise-game/assets/index-xxx.js` — correct.

`vite.config.ts` change:

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/kito-exorcise-game/',
  test: {
    environment: 'node',
  },
})
```

`npm run dev` is unaffected because Vite's dev server always serves from `/`
regardless of the `base` option.

---

## Workflow file structure

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

---

## Lockfile

`npm ci` requires `package-lock.json` to be present and in sync with
`package.json`. If any version in `package.json` has been updated without
running `npm install`, `npm ci` will fail with a lockfile mismatch error.

Fix: run `npm install` locally and commit the updated `package-lock.json`.

---

## Repository settings (manual)

Pages source must be **GitHub Actions** (not the legacy "Deploy from a branch"
option). This is a one-time UI step in Settings › Pages. No CNAME or custom
domain is configured.

---

## `.gitignore` check

`.kiro/` must not appear in `.gitignore`. Current `.gitignore`:

```
node_modules/
dist/
.DS_Store
*.local
```

`.kiro/` is absent — no change needed.
