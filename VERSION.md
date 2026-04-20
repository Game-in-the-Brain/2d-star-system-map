# 2D Star System Map — Versioning SOP

**Effective:** 2026-04-20  
**Owner:** Justin Aquino / Game in the Brain  
**Repo:** `Game-in-the-Brain/2d-star-system-map`

---

## 1. Purpose

This document defines the versioning methodology for the 2D Star System Map so that **every commit is traceable to a visible version number** and users can report bugs against an exact build.

---

## 2. Version Format

```
{version}-{shortHash}[-dirty]
```

**Example:** `1.05-a1b2c3d`

| Segment | Source | Updated By |
|---|---|---|
| `version` | `VERSION` file in repo root | Pre-commit hook (automatic) |
| `shortHash` | `git rev-parse --short HEAD` | Git (automatic) |
| `-dirty` | Present if `git status --porcelain` is non-empty | Git (automatic) |

The base `version` is a decimal number that increments by **0.01** on every commit.

---

## 3. Methodology

### 3.1 VERSION File

The canonical version is stored in a plaintext file at the repository root:

```
VERSION
```

**Initial value:** `1.00`

### 3.2 Pre-Commit Hook

A Git pre-commit hook (`.git/hooks/pre-commit`) automatically bumps the `VERSION` file by `0.01` and stages it before each commit:

```bash
#!/bin/bash
VERSION_FILE="VERSION"
CURRENT=$(cat "$VERSION_FILE" | tr -d '[:space:]')
NEW=$(awk "BEGIN {printf \"%.2f\", $CURRENT + 0.01}" < /dev/null)
echo "$NEW" > "$VERSION_FILE"
git add "$VERSION_FILE"
echo "Version bumped: $CURRENT -> $NEW"
```

**To install the hook on a fresh clone:**

```bash
cp scripts/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### 3.3 Commit → Version Mapping

| Action | Resulting Version Change |
|---|---|
| `git commit` | `VERSION` increments by 0.01; `shortHash` updates |
| `git commit` with uncommitted changes | Same as above **plus** `-dirty` suffix |
| Tag release (`git tag v1.50`) | Human bumps `VERSION` to the target (e.g. `1.50`), then commits |

**Rule:** The version string is a function of the repository state. If two builds produce the same version string, the repository contents are identical (assuming no `-dirty`).

---

## 4. Visible Versioning in the UI

The full version string is rendered in **two places** so it is always discoverable:

1. **Control panel footer** (`#version-display`) — visible when the panel is expanded.
2. **Persistent watermark** (`#version-watermark`) — bottom-right corner of the canvas, visible even when the panel is collapsed.

Both read from `src/version.ts` which consumes the Vite-injected globals.

---

## 5. Reproducing a Build

Given a version string `1.05-a1b2c3d`:

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
| `VERSION` | Canonical version number (auto-bumped by pre-commit hook) |
| `vite.config.ts` | Reads `VERSION`, appends git hash, injects into build |
| `src/version.ts` | Type-safe wrapper around injected globals |
| `src/main.ts` | Renders version into DOM on startup |
| `index.html` | Hosts `#version-display` and `#version-watermark` elements |
| `src/styles.css` | Styles the version footer and watermark |
| `VERSION.md` | This document |
| `scripts/pre-commit` | Backup copy of the pre-commit hook |

---

## 7. Checklist for Releases

- [ ] `npm run build` passes with zero TS errors
- [ ] Version string in `dist/` matches expected `{version}-{hash}` pattern
- [ ] `-dirty` suffix is **absent** on production builds
- [ ] `git tag v{version}` applied after milestone commit
- [ ] `git push && git push --tags`

---

## 8. History

| Date | Version | Note |
|---|---|---|
| 2026-04-20 | 1.02 | FRD-048: Delta-V Calculator & Orbital Travel Planner spec |
| 2026-04-20 | 1.01 | FRD-047: PWA + 0.01 version tracking introduced |
| 2026-04-20 | 1.1.x | FRD-046: Save Page + System Editor (M1-M2) |
| 2026-04-18 | 1.0.9-90c9a31 | Legacy git-count versioning system |
