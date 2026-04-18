# 2D Star System Map — Versioning SOP

**Effective:** 2026-04-18  
**Owner:** Justin Aquino / Game in the Brain  
**Repo:** `Game-in-the-Brain/2d-star-system-map`

---

## 1. Purpose

This document defines the versioning methodology for the 2D Star System Map so that **every commit is traceable to a visible version number** and users can report bugs against an exact build.

---

## 2. Version Format

```
{major}.{minor}.{commitCount}-{shortHash}[-dirty]
```

**Example:** `1.0.10-a1b2c3d`

| Segment | Source | Updated By |
|---|---|---|
| `major` | Hard-coded in `vite.config.ts` | Human (breaking changes) |
| `minor` | Hard-coded in `vite.config.ts` | Human (feature milestones) |
| `commitCount` | `git rev-list --count HEAD` | Git (automatic) |
| `shortHash` | `git rev-parse --short HEAD` | Git (automatic) |
| `-dirty` | Present if `git status --porcelain` is non-empty | Git (automatic) |

---

## 3. Methodology

### 3.1 Automatic Build-Time Injection

Vite injects version constants at build time via `vite.config.ts`:

```typescript
define: {
  __APP_VERSION__: JSON.stringify(gitVersion.version),      // "1.0.10"
  __APP_COMMIT__:  JSON.stringify(gitVersion.commitHash),   // "a1b2c3d"
  __APP_DATE__:    JSON.stringify(gitVersion.commitDate),   // "2026-04-18"
  __APP_FULL_VERSION__: JSON.stringify(gitVersion.fullVersion), // "1.0.10-a1b2c3d"
}
```

These values are **never hand-edited**; they are derived directly from the Git state at the moment `vite build` runs.

### 3.2 Commit → Version Mapping

| Action | Resulting Version Change |
|---|---|
| `git commit` | `commitCount` increments by 1; `shortHash` updates |
| `git commit` with uncommitted changes | Same as above **plus** `-dirty` suffix |
| Tag release (`git tag v1.1.0`) | Human bumps `minor` in `vite.config.ts`, then commits |

**Rule:** The version string is a function of the repository state. If two builds produce the same version string, the repository contents are identical (assuming no `-dirty`).

### 3.3 When to Bump Major or Minor

| Scenario | Bump |
|---|---|
| Breaking change to URL schema, JSON export format, or canvas API | **Major** |
| New user-visible feature (moons, zones, new controls) | **Minor** |
| Bug fix, performance tweak, CSS polish | **Neither** (commitCount auto-increments) |

---

## 4. Visible Versioning in the UI

The full version string is rendered in **two places** so it is always discoverable:

1. **Control panel footer** (`#version-display`) — visible when the panel is expanded.
2. **Persistent watermark** (`#version-watermark`) — bottom-right corner of the canvas, visible even when the panel is collapsed.

Both read from `src/version.ts` which consumes the Vite-injected globals.

---

## 5. Reproducing a Build

Given a version string `1.0.10-a1b2c3d`:

```bash
# 1. Identify the exact commit
git log --oneline | grep a1b2c3d

# 2. Checkout that commit
git checkout a1b2c3d

# 3. Rebuild
npm run build
```

The rebuilt `dist/` will produce the same version string (assuming the working tree is clean).

---

## 6. Files Involved

| File | Role |
|---|---|
| `vite.config.ts` | Computes version from Git and injects into build |
| `src/version.ts` | Type-safe wrapper around injected globals |
| `src/main.ts` | Renders version into DOM on startup |
| `index.html` | Hosts `#version-display` and `#version-watermark` elements |
| `src/styles.css` | Styles the version footer and watermark |
| `VERSION.md` | This document |

---

## 7. Checklist for Releases

- [ ] `npm run build` passes with zero TS errors
- [ ] Version string in `dist/` matches expected `major.minor.count-hash` pattern
- [ ] `-dirty` suffix is **absent** on production builds
- [ ] `git tag v{major}.{minor}.0` applied after bumping minor/major
- [ ] `git push && git push --tags`

---

## 8. History

| Date | Version | Note |
|---|---|---|
| 2026-04-18 | 1.0.9-90c9a31 | Versioning system introduced |
