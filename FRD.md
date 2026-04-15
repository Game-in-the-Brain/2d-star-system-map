# 2D Star System Map — Feature Requirements Document

**Project:** 2D Star System Map  
**Repo:** `Game-in-the-Brain/2d-star-system-map`  
**Base URL:** `https://game-in-the-brain.github.io/2d-star-system-map/`  

---

## 1. Overview

A standalone, dependency-free 2D canvas visualiser for Mneme-generated star systems. It receives astronomical data via a URL query string and renders an interactive, animated orbital map.

---

## 2. Test Data Generation

### 2.1 Browser Console Method (Recommended)

The fastest way to produce live test data is to use the MWG application itself.

**Prerequisites:**
- A modern browser with DevTools access
- The MWG app loaded at `https://game-in-the-brain.github.io/Mneme-CE-World-Generator/`

**Procedure:**
1. Generate a star system in MWG (or load a saved one).
2. Open DevTools → Console.
3. Paste and run the following snippet:

```javascript
const system = JSON.parse(localStorage.getItem('mneme_current_system'));
const payload = {
  starSystem: system,
  starfieldSeed: Math.random().toString(36).substring(2, 10).toUpperCase(),
  epoch: { year: 2300, month: 1, day: 1 }
};
const json = JSON.stringify(payload);
const encoded = btoa(
  encodeURIComponent(json).replace(
    /%([0-9A-F]{2})/g,
    (_, p1) => String.fromCharCode(parseInt(p1, 16))
  )
);
const url = `https://game-in-the-brain.github.io/2d-star-system-map/?system=${encoded}`;
console.log(url);
window.open(url, '_blank');
```

**What it does:**
- Retrieves the complete `StarSystem` object from MWG's `localStorage` key `mneme_current_system`.
- Attaches a random 8-character `starfieldSeed` so each test has a unique background.
- Sets the canonical Mneme epoch to `2300-01-01`.
- Produces a Unicode-safe Base64 string using the `%XX` → `charCode` dance (required because `btoa` only accepts Latin-1).
- Logs the final URL and opens it in a new tab.

**Why this is the preferred method:**
- Uses the exact runtime data model MWG produces.
- No export/import files needed.
- Starfield seed can be refreshed by rerunning the snippet on the same system.

---

## 3. Payload Format

The map expects a `MapPayload` object encoded as `?system=<base64>`.

```typescript
interface MapPayload {
  starSystem: StarSystem;
  starfieldSeed: string;
  epoch: {
    year: number;
    month: number;
    day: number;
  };
}
```

### 3.1 `StarSystem` Shape

The map only requires a subset of the full MWG `StarSystem` type:

```typescript
interface StarSystem {
  key?: string;
  primaryStar: {
    class: string;
    grade: number;
    mass: number;
  };
  companionStars?: Array<{
    class: string;
    grade: number;
    mass: number;
    orbitDistance: number;
  }>;
  circumstellarDisks?: Array<{
    distanceAU: number;
    mass: number;
  }>;
  dwarfPlanets?: Array<{
    distanceAU: number;
    mass: number;
  }>;
  terrestrialWorlds?: Array<{
    distanceAU: number;
    mass: number;
  }>;
  iceWorlds?: Array<{
    distanceAU: number;
    mass: number;
  }>;
  gasWorlds?: Array<{
    distanceAU: number;
    mass: number;
    gasClass: number;
  }>;
  mainWorld?: {
    type: string;
    distanceAU: number;
    massEM: number;
  } | null;
}
```

**Notes:**
- `key` is used as a hash seed for deterministic orbit angles.
- `mainWorld` is not guaranteed to exist in any of the body arrays; `dataAdapter.ts` adds it explicitly when missing.

---

## 4. Rendering Pipeline

1. **Decode** `?system=` from Base64 → JSON → `MapPayload`.
2. **Adapt** `StarSystem` → `SceneBody[]` via `buildSceneGraph()`.
3. **Initialise** camera to fit the outermost body.
4. **Start** the RAF loop; orbital angles advance by `speed × dt / periodDays`.
5. **Handle** user input: pan, zoom (mouse wheel + pinch), time controls, seed refresh.

---

## 5. Deployment

The app is built with Vite and deployed to GitHub Pages.

```bash
npm run build
```

Output is emitted to `dist/`. GitHub Pages serves from the `gh-pages` branch (or repo root, depending on settings).

---

## 6. History

| Date | Change |
|------|--------|
| 2026-04-15 | Extracted from `Mneme-CE-World-Generator` monorepo into standalone repo to eliminate BASE_URL routing bugs (QA-033). |
