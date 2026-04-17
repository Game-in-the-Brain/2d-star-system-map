# 2D Star System Map — Repo Analysis

**Path:** `/home/justin/opencode260220/2d-star-system-map`  
**Remote:** `https://github.com/Game-in-the-Brain/2d-star-system-map`  
**Live URL:** `https://game-in-the-brain.github.io/2d-star-system-map/`  
**Analysed:** 2026-04-17

---

## 1. Architecture

Standalone Vite + TypeScript canvas app. No React. Built as a **separate repo** (extracted from MWG monorepo to fix QA-033 BASE_URL issues).

| File | Responsibility |
|------|---------------|
| `src/main.ts` | Bootstrap, decode `?system=` payload, init canvas |
| `src/dataAdapter.ts` | `StarSystem` → `SceneBody[]` mapper (fixes QA-035 main-world fallback) |
| `src/renderer.ts` | Canvas RAF loop: starfield, nebulas, orbits, bodies, labels |
| `src/camera.ts` | Pan, zoom, log-scale distance, world/screen transforms |
| `src/input.ts` | Mouse drag, wheel zoom, touch pinch/pan |
| `src/starfield.ts` | Mulberry32 PRNG, procedural background stars + nebulas |
| `src/uiControls.ts` | Play/pause, speed, time steps, seed copy/regen |
| `src/batchAdapter.ts` | Converts batch-export JSON → `MapPayload` for `test.html` |
| `src/testHarness.ts` | Filterable table UI for 1 000 batch worlds |
| `test.html` | Test harness entry point (separate from main map) |

**Data flow:**
```
MWG "Map" button → Base64-encoded MapPayload in URL query string
                        ↓
              2d-star-system-map/?system=<base64>
                        ↓
              main.ts decodeMapPayload() → buildSceneGraph() → RAF loop
```

---

## 2. Build Configuration

### `vite.config.ts`
```typescript
base: '/2d-star-system-map/',
build: {
  rollupOptions: {
    input: {
      main: resolve(__dirname, 'index.html'),
      test: resolve(__dirname, 'test.html'),
    },
  },
}
```

**Key points:**
- `base` is correctly set for GitHub Pages project-site deployment (`/<repo-name>/`)
- Multi-page build produces `main-*.js/css` and `test-*.js` bundles
- `dist/` folder is **checked into git** (intentionally — enables "Deploy from branch" on GitHub Pages)

---

## 3. Current Git State

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  modified:   FRD.md
  deleted:    dist/assets/index-Bg5KasAm.css
  deleted:    dist/assets/index-DIwZFegT.js
  modified:   dist/index.html
  modified:   vite.config.ts

Untracked files:
  dist/assets/main-Bg5KasAm.css
  dist/assets/main-CxHcewJl.js
  dist/assets/modulepreload-polyfill-B5Qt9EMX.js
  dist/assets/test-DpkK-BNe.js
  dist/test-batch.json
  dist/test.html
  public/
  src/batchAdapter.ts
  src/testHarness.ts
  test.html
  mneme-batch-1000-...json
```

**⚠️ CRITICAL:** The `dist/` folder on `origin/main` contains **old asset filenames** (`index-DIwZFegT.js`, `index-Bg5KasAm.css`) from the initial build. The latest local build generated **new filenames** (`main-CxHcewJl.js`, `main-Bg5KasAm.css`) because the `vite.config.ts` now uses named entry points (`main` / `test`).

**Result:** `dist/index.html` on the remote still references the old `index-*` assets. If GitHub Pages is serving from `main`, the site **should still work** because those old assets exist on the remote. However, the newer features (`batchAdapter.ts`, `testHarness.ts`, `test.html`) are **not deployed**.

---

## 4. GitHub Pages Deployment Status

| Check | Status | Detail |
|-------|--------|--------|
| `.github/workflows/` | ❌ Missing | No CI/CD automation |
| GitHub Pages enabled | ❓ Unknown | Must be checked in repo Settings → Pages |
| Source branch | ❓ Unknown | Likely `main` / root (since `dist/` is checked in) |
| Custom domain | ❌ None | Uses default `github.io` |

**Recommended setup:**
1. Go to repo Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: `main` / `root`
4. OR use GitHub Actions (see §6 below)

---

## 5. URL Issue Analysis

**User report:** `https://game-in-the-brain.github.io/?system=...` (missing `/2d-star-system-map/`)

**MWG source code** (`SystemViewer.tsx:161`):
```typescript
const url = new URL(`/?system=${encoded}`, 'https://game-in-the-brain.github.io/2d-star-system-map/');
```

**This generates the CORRECT URL:** `https://game-in-the-brain.github.io/2d-star-system-map/?system=...`

**Root causes of the wrong URL:**
1. **Old cached MWG build** — an earlier deployed version may have had the wrong base URL
2. **User manually constructed URL** — copy/paste error omitting the path
3. **Browser bookmark** — saved before QA-033 fix

**The 2d-star-system-map repo code is NOT at fault.** The MWG code is correct. The issue is either stale deployment or user error.

---

## 6. Recommendations

### Immediate (do now)

1. **Commit and push the updated `dist/` folder:**
   ```bash
   cd /home/justin/opencode260220/2d-star-system-map
   git add dist/ src/batchAdapter.ts src/testHarness.ts test.html public/
   git commit -m "build: update dist with multi-page entry points + batch test harness"
   git push origin main
   ```

2. **Verify GitHub Pages is enabled:**
   - Repo Settings → Pages → Source: `main` / `root`
   - Wait 2–5 minutes for propagation
   - Test: `https://game-in-the-brain.github.io/2d-star-system-map/`

3. **Verify MWG deployed build has correct URL** — the current MWG source code is correct, but ensure the deployed site at `game-in-the-brain.github.io/Mneme-CE-World-Generator/` was built after the QA-033 fix.

### Short-term (next session)

4. **Add GitHub Actions workflow** (`.github/workflows/deploy.yml`) for automated deployment:
   ```yaml
   name: Deploy to GitHub Pages
   on:
     push:
       branches: [main]
   jobs:
     build-and-deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 22
         - run: npm ci
         - run: npm run build
         - name: Deploy
           uses: peaceiris/actions-gh-pages@v4
           with:
             github_token: ${{ secrets.GITHUB_TOKEN }}
             publish_dir: ./dist
   ```
   Then switch GitHub Pages source to `gh-pages` branch (created by the action) and **stop checking `dist/` into git**.

5. **Add `404.html`** — even though this app uses query params (not path routing), a 404.html that redirects to `index.html` prevents broken links if someone shares `/2d-star-system-map/?system=...` and GitHub Pages strips the query string on a hard refresh.

### Medium-term (Phase 6)

6. **Body tooltips on hover/tap** — show mass, zone, distance AU
7. **Brachistochrone transfer arc visualisation**
8. **Rings and moons (INTRAS Level 2)**

---

## 7. File Inventory

| Path | Size | Purpose |
|------|------|---------|
| `dist/index.html` | 2.9 KB | Main map entry point |
| `dist/test.html` | 10.9 KB | Batch test harness |
| `dist/assets/main-*.js` | 14.1 KB | Main bundle |
| `dist/assets/main-*.css` | 2.7 KB | Styles |
| `dist/assets/test-*.js` | 5.8 KB | Test harness bundle |
| `dist/assets/modulepreload-polyfill-*.js` | 0.7 KB | Vite polyfill |
| `dist/test-batch.json` | 2.6 MB | 1 000 batch worlds for testing |

---

## 8. Integration Points with MWG

| MWG File | What it does |
|----------|-------------|
| `src/components/SystemViewer.tsx:152–169` | "Map" button encodes `StarSystem` + seed + epoch as Base64 URL |
| `src/types/index.ts` | `StarSystem` shape (must stay compatible with `dataAdapter.ts`) |

**Compatibility contract:** The 2D map only reads these `StarSystem` fields:
- `primaryStar` (class, grade, mass)
- `companionStars[]` (class, grade, mass, orbitDistance)
- `circumstellarDisks[]` (distanceAU, mass)
- `dwarfPlanets[]` (distanceAU, mass)
- `terrestrialWorlds[]` (distanceAU, mass)
- `iceWorlds[]` (distanceAU, mass)
- `gasWorlds[]` (distanceAU, mass, gasClass)
- `mainWorld` (type, distanceAU, massEM)

**Adding v2 fields** (`composition`, `biosphereRating`, etc.) to the map would require updating `dataAdapter.ts` and `types.ts` in the map repo, but is **not required** for basic orbital rendering.

---

## 9. Testing

**Local dev:**
```bash
cd /home/justin/opencode260220/2d-star-system-map
npm install
npm run dev      # serves at http://localhost:5173/2d-star-system-map/
npm run build    # outputs to dist/
npm run preview  # serves dist/ locally
```

**Test harness:**
```bash
# After npm run dev, open:
http://localhost:5173/2d-star-system-map/test.html
```

**Manual payload test:**
Open MWG, generate a system, click "Map", copy the URL. Or use the console snippet from `README.md`.
