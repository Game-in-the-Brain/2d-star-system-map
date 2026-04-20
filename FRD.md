# 2D Star System Map — Feature Requirements Document

**Project:** 2D Star System Map  
**Repo:** `Game-in-the-Brain/2d-star-system-map`  
**Base URL:** `https://game-in-the-brain.github.io/2d-star-system-map/`  

---

## ★ HANDOFF INSTRUCTIONS (AI models — read this first) ★

**Working directory:** `/home/justin/opencode260220/2d-star-system-map`  
**Build command:** `npm run build` (runs `tsc -b && vite build` — must pass with zero TypeScript errors).  
**Dev command:** `npm run dev`

### Quick orientation

| What | Where |
|------|-------|
| Entry point (production) | `index.html` + `src/main.ts` |
| Test harness | `test.html` + `src/testHarness.ts` |
| Payload decode | `src/main.ts` `decodeMapPayload()` |
| System → scene graph | `src/dataAdapter.ts` `buildSceneGraph()` |
| Batch → payload adapter | `src/batchAdapter.ts` `batchToMapPayload()` |
| Orbital mechanics | `src/orbitMath.ts` |
| Rendering loop | `src/renderer.ts` `initRenderer()` |
| Camera (zoom/pan) | `src/camera.ts` |
| Input handlers | `src/input.ts` |
| UI controls | `src/uiControls.ts` |
| Seeded starfield | `src/starfield.ts` |
| Shared types | `src/types.ts` |
| Test batch data | `public/test-batch.json` (2.75 MB, 1 000 worlds) |

### How data arrives

This app is a **pure visualiser** — it does not generate data. All astronomical data comes from:

1. **MWG (production):** The "View System Map" button in `Mneme-CE-World-Generator/src/components/SystemViewer.tsx` encodes a `StarSystem` as Base64 in `?system=` and opens `index.html?system=<base64>`.
2. **Test harness (development):** Open `test.html`, browse 1 000 batch-generated worlds, click any row to open the renderer with that world.

### Encoding contract (critical — do not break)

MWG and this app share a Unicode-safe Base64 codec:

**Encode (MWG side):**
```ts
btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))))
```

**Decode (this app — `src/main.ts`):**
```ts
decodeURIComponent(Array.from(atob(encoded)).map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
```

If either side changes, the other breaks silently (blank map, no console error unless the JSON is malformed).

---

## 1. Overview

A standalone, dependency-free 2D canvas visualiser for Mneme-generated star systems. It receives astronomical data via a URL query string and renders an interactive, animated orbital map.

---

## 2. Test Data Generation

Two testing modes are supported.

### 2.1 Test Harness — `test.html` (Primary)

The repo ships a local test harness that lets you browse and open any of **1 000 batch-generated worlds** without needing MWG running.

**Working directory:** `/home/justin/opencode260220/2d-star-system-map`

```bash
npm run dev
# then open: http://localhost:<port>/test.html
```

The harness:
- Fetches `public/test-batch.json` (the 1 000-world batch export from MWG).
- Shows a filterable table — filter by star class (M/K/G/F/A/B), main world type (Terrestrial/Dwarf/Habitat), starport class (A–X), and hot Jupiter presence.
- "View Map" button (or clicking any row) encodes the selected system as a `MapPayload` and opens `index.html?system=<base64>` in a new tab.

**Adapter:** `src/batchAdapter.ts` converts the batch export shape to the `MapPayload` / `StarSystem` shapes the renderer expects. Key conversions:
- `star.massSOL` → `primaryStar.mass`
- `bodies[].au` → `distanceAU`; `bodies[].massEM` → `mass`
- `gasClass` Roman numeral string (`"IV"`) → number (`4`)
- Habitat main worlds (no matching body in array) default `massEM` to `1.0`

**Batch file:** `public/test-batch.json` — 2.75 MB, fetched lazily. Do not bundle it into JS.

---

### 2.2 Live MWG Integration — Production Path

When MWG's "View System Map" button is clicked, it encodes the live-generated `StarSystem` and opens this app. The source is `src/components/SystemViewer.tsx` in the MWG repo.

```javascript
// Reproduce manually from MWG's browser console:
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

**Why the encode dance?** `btoa()` only accepts Latin-1. The `encodeURIComponent` + `replace` step converts all non-Latin-1 characters to their byte values before `btoa` sees them. The decode mirror in `main.ts` reverses this exactly. **Never simplify this to plain `btoa(json)`** — it will throw on any world with non-ASCII content.

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

## 6. Troubleshooting

### 6.1 Map opens but shows no bodies

**Check 1 — Payload decoded correctly?**
Open DevTools → Console and run:
```js
const p = new URLSearchParams(location.search);
const raw = p.get('system');
if (!raw) { console.log('NO ?system= PARAM'); } else {
  console.log(JSON.parse(decodeURIComponent(
    Array.from(atob(raw)).map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
  )));
}
```
Verify `starSystem.primaryStar` is present and body arrays have entries.

**Check 2 — `buildSceneGraph` called with empty body arrays?**
If all body arrays (`terrestrialWorlds`, `gasWorlds`, etc.) are empty or undefined, `dataAdapter.ts` only emits the primary star. Check MWG's `generator.ts` to confirm the planetary system is being attached to the `StarSystem` object before the button handler runs.

---

### 6.2 Main world missing from the rendered map

`dataAdapter.ts` tries to find a body in the arrays at the same `distanceAU` as `mainWorld.distanceAU`. If it finds none, it adds a new body explicitly (QA-035 fix). If the main world still disappears:
- Confirm `system.mainWorld` is not `null` in the payload (log the decoded payload).
- Confirm `mainWorld.type` is one of: `"Terrestrial"`, `"Dwarf"`, `"Ice World"`, `"Habitat"`.
- The gold-stroke `"★ MAIN"` body uses `strokeColour: '#FACC15'` — check it is not behind another body at the same pixel position.

---

### 6.3 `gasClass` renders all gas giants the same colour

The renderer maps `gasClass` numbers 1–5 to five distinct colours. If all gas giants look the same (`gas-i` yellow), `gasClass` is arriving as a string (`"I"`, `"IV"`, etc.) instead of a number. MWG's `types/index.ts` must declare `gasClass: number`. Check that MWG has not accidentally changed this to `string`.

---

### 6.4 `InvalidCharacterError` in the browser console

`btoa()` threw on a non-Latin-1 character in the payload JSON. The encode wrapper in MWG's `SystemViewer.tsx` prevents this. If the error appears, the `encodeURIComponent` + `replace` step has been removed or bypassed. Restore it:
```ts
btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))))
```

---

### 6.5 URL loads correctly in dev but fails on GitHub Pages

- Confirm `vite.config.ts` has `base: '/2d-star-system-map/'`.
- Confirm MWG constructs the URL with `new URL('/?system=...', 'https://game-in-the-brain.github.io/2d-star-system-map/')` — do **not** hardcode a path-relative URL.
- History: this was QA-033. The monorepo sub-directory approach broke Pages routing; standalone repo fixed it.

---

### 6.6 Test harness (`test.html`) shows "Failed to load test-batch.json"

- Confirm `public/test-batch.json` exists in the repo root's `public/` folder.
- In dev mode, Vite serves `public/` at the root. The harness fetches `./test-batch.json` relative to `test.html`.
- The file is ~2.75 MB — on slow connections the initial load takes a moment; the status line says "Loading batch data…" during fetch.

---

## 7. History

| Date | Change |
|------|--------|
| 2026-04-15 | Extracted from `Mneme-CE-World-Generator` monorepo into standalone repo to eliminate BASE_URL routing bugs (QA-033). |
| 2026-04-19 | §8 Sector-Hosted Mode added — consumer spec for MWG FR-045 SectorFiles hosted by the 3D Interstellar Map (FR-011..014). |
| 2026-04-20 | FRD-047: PWA — Progressive Web App with offline service worker, manifest, and icons. |
| 2026-04-20 | FRD-048: Delta-V Calculator & Orbital Travel Planner — interplanetary travel time calculator with optimistic/pessimistic bounds. |

---

## 8. Sector-Hosted Mode (Planned)

**Status:** 📋 Planned
**Companion specs:** `Mneme-CE-World-Generator/…FRD.md` §14.6 FR-045; `3d-interstellar-map/frd.md` §FR-011..014.

Today this app is URL-driven: MWG encodes a single `StarSystem` into `?system=<base64>` and opens the map. When a sector is loaded into the 3D Interstellar Map (which owns sector persistence), this app must also be able to render a system **by reference** — without the full StarSystem needing to fit in a URL.

### 8.1 Two Input Modes (both must work)

| Mode | URL shape | Source | When used |
|------|-----------|--------|-----------|
| **Payload mode** (existing, preserved) | `?system=<base64>` | MWG single-world button, test harness | Still the fallback. Must not regress. |
| **Sector-host mode** (new) | `?sector=<sectorId>&starId=<starId>` | 3D Interstellar Map click-through | Used when a sector is hosted in IndexedDB and both apps share origin. |

### 8.2 Sector-Host Resolver

On boot, if `?sector=` and `?starId=` are present:

1. Open IndexedDB `gi7b_sectors` (same schema the 3D map writes — FR-013).
2. Read `systems` object store at key `${sectorId}:${starId}`.
3. If the record exists, construct a `MapPayload` on the fly:
   ```ts
   const payload: MapPayload = {
     starSystem: record.starSystem,
     starfieldSeed: record.generationLog.seed,         // reuse per-system seed for deterministic starfield
     epoch: deriveEpochFromSectorAge(record.sectorAge) // mapping: SectorAge.year → epoch.year
   };
   ```
4. Feed it into the existing `buildSceneGraph()` pipeline unchanged.
5. If the record is missing, IDB is unavailable, or the origin isn't shared, show a clear error with "Back to 3D Map" and "Retry with ?system=" guidance. Do **not** silently blank.

### 8.3 New Files / Changes

| File | Change |
|------|--------|
| `src/sectorHost.ts` | NEW — IndexedDB read helper: `loadSystemFromHost(sectorId, starId): Promise<MapPayload \| null>`. No writes — this app is read-only from the host. |
| `src/main.ts` | Branch in `decodeMapPayload()`: try `?sector=/?starId=` first, fall back to `?system=`. |
| `src/types.ts` | Import `SectorSystemRecord` / `SectorAge` type shapes (copied from MWG until a shared package exists). |
| `src/uiControls.ts` | "Back to Sector Map (3D)" button visible only when entered via sector-host mode — builds `3d-interstellar-map/?sectorId=<id>` URL. |

### 8.4 Encoding Contract — Still Authoritative

The Unicode-safe Base64 codec in §"Encoding contract" still governs payload mode. Sector-host mode **does not** use Base64 — it reads structured data from IndexedDB directly. Do not apply Base64 on the sector path.

### 8.5 Read-Only Guarantee

This app remains a pure viewer. It **must not** write to the `gi7b_sectors` IndexedDB. All edits happen in MWG; the 3D map is the only writer. If the user wants to edit, the "Open in MWG" button (new, appears in sector-host mode) launches MWG with `?mode=edit&sector=<sectorId>&starId=<starId>`.

### 8.6 Acceptance Criteria

- [ ] Existing `?system=<base64>` flow from MWG's "View System Map" button and from `test.html` continues to work byte-identically (regression test with a saved URL).
- [ ] Visiting `?sector=<id>&starId=<id>` after the 3D map has persisted a sector renders the matching system in < 500 ms.
- [ ] With IndexedDB disabled (private mode), `?sector=` mode falls back to an error screen with a "Reopen via URL-encoded payload" instruction; no blank canvas.
- [ ] "Open in MWG" button only appears when entered via sector-host mode.
- [ ] The starfield seed comes from `record.generationLog.seed` in sector-host mode — starfield is reproducible per system rather than per-session.

### 8.7 Open Questions

- Cross-origin handoff: if the 3D map is deployed to a different host later, IndexedDB isolation breaks this flow. Proposed v1.1: the 3D map exposes a `postMessage` "system:request" listener; this app opens the 3D map URL invisibly, requests the record, and resolves. For v1 we rely on the shared `game-in-the-brain.github.io` origin.
- Offline-first: should the 2D map cache the last-viewed sector record in its own storage so it works offline after the first visit? Deferred — the 3D map's IndexedDB already serves that role when the user reloads.
