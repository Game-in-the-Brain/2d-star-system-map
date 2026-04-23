# FRD-060: Mneme 2D Star System Map — Complete Rebuild Specification

**Version**: 2.0  
**Date**: 2026-04-23  
**Status**: Implementation-ready  
**Implementer target**: Kimi (clean rebuild from this spec)

---

## 1. Overview

A fullscreen interactive 2D orbital map rendered on an HTML5 Canvas. Given a JSON payload from the Mneme CE World Generator (MWG), it renders all bodies in the star system as animated circles orbiting the primary star, with logarithmic distance scaling so both inner and outer bodies are visible simultaneously.

**Stack**: TypeScript + Vite + PWA (vite-plugin-pwa). No React, no UI framework. Plain DOM.  
**Deployment base**: `/2d-star-system-map/`  
**Entry point**: `index.html` → `src/main.ts`  
**Build command**: `tsc -b && vite build && node scripts/inline-build.js`

---

## 2. Input Data Contract

### 2.1 Accepted Paste Formats

The textarea `#system-paste` accepts two forms. The "Load System" button runs `parseSystemPaste()`:

**Form A — MapPayload** (has `starSystem` at top level):
```json
{
  "starSystem": { ...full MWG world object... },
  "starfieldSeed": "92o0D0kQ",
  "epoch": { "year": 2300, "month": 1, "day": 1 }
}
```

**Form B — Raw StarSystem** (has `primaryStar` at top level — the inner `starSystem` object pasted directly):
```json
{
  "primaryStar": { "class": "M", "grade": 8, "mass": 0.15, ... },
  ...
}
```

When Form B is detected, auto-wrap it: generate a random 8-char `starfieldSeed` and use `epoch: { year: 2300, month: 1, day: 1 }`.

**Rejection**: If the JSON is invalid → `alert('Invalid JSON...')`. If valid JSON but neither form → `alert('Could not parse system JSON. Make sure you copied it with "Copy for 2D Map" from MWG.')`.

**Error on load**: If `buildSceneGraph` throws → `alert('Failed to load system: <error.message>')`.

### 2.2 MapPayload Internal Type

```typescript
interface MapPayload {
  starSystem: MWGStarSystem;   // full MWG object — many extra fields, all tolerated
  starfieldSeed: string;        // 8-char alphanumeric
  epoch: { year: number; month: number; day: number };
}
```

### 2.3 MWG StarSystem Shape (Full Format)

The MWG emits a rich object. The 2D map extracts a subset. All unlisted fields are silently ignored.

```typescript
// Fields the 2D map READS from the MWG world object:
interface MWGStarSystem {
  // System identity — use as hash base for deterministic angles
  id?: string;           // UUID like "b96f14db-ba53-4343-9b7d-56ec6290ae9d"
  key?: string;          // short name if present; prefer over id

  primaryStar: {
    class: string;       // "O"|"B"|"A"|"F"|"G"|"K"|"M"
    grade: number;       // 0–9
    mass: number;        // solar masses
    // Extra MWG fields ignored: id, luminosity, color, isPrimary
  };

  companionStars?: Array<{
    class: string;
    grade: number;
    mass: number;
    orbitDistance: number;  // AU — visual orbit radius in map
    // Extra ignored: id, luminosity, color, isPrimary, orbits
  }>;

  zones?: {
    infernal:     { min: number; max: number };
    hot:          { min: number; max: number };
    conservative: { min: number; max: number };
    cold:         { min: number; max: number };
    outer:        { min: number; max: number | null };
  };

  mainWorld?: {
    type:       string;   // "Terrestrial" | "Dwarf" | "Ice World"
    distanceAU: number;
    massEM:     number;   // Earth masses
    // Extra ignored: size, lesserEarthType, densityGcm3, gravity, radius,
    //   escapeVelocity, atmosphere, atmosphereTL, temperature, temperatureTL,
    //   hazard, hazardIntensity, hazardIntensityTL, biochemicalResources,
    //   techLevel, habitability, habitabilityComponents, zone
  } | null;

  // --- Optional rich display data (read for info panel, not for rendering) ---
  inhabitants?: {
    populated:      boolean;
    techLevel:      number;
    population:     number;
    starport?:      { class: string };
    travelZone?:    string;   // "Green"|"Amber"|"Red"
  };

  circumstellarDisks?: Array<{
    id?:        string;
    distanceAU: number;
    mass:       number;
    // Extra ignored: type, zone, positionRoll
  }>;

  dwarfPlanets?: Array<{
    id?:        string;
    distanceAU: number;
    mass:       number;
    // Extra ignored: lesserEarthType, densityGcm3, radiusKm, etc.
  }>;

  terrestrialWorlds?: Array<{
    id?:        string;
    distanceAU: number;
    mass:       number;
  }>;

  iceWorlds?: Array<{
    id?:        string;
    distanceAU: number;
    mass:       number;
  }>;

  gasWorlds?: Array<{
    id?:        string;
    distanceAU: number;
    mass:       number;
    gasClass:   number | string;  // 1–5 OR "I"|"II"|"III"|"IV"|"V" — MUST normalise
  }>;

  moons?: Array<{
    id?:          string;
    mass:         number;
    moonOrbitAU:  number;   // orbit radius around parent in AU
    parentId:     string;   // ID of parent body
    distanceAU:   number;   // distance from star (same as parent)
    // Extra ignored: type, zone, wasCapturedTerrestrial, level, etc.
  }>;

  rings?: Array<{
    id?:      string;
    parentId: string;
    // Rings are parsed but not rendered in v2.0
  }>;
}
```

### 2.4 gasClass Normalisation (REQUIRED)

MWG emits `gasClass` as a Roman-numeral string from its generator output:

```typescript
function normalizeGasClass(gasClass: number | string): number {
  if (typeof gasClass === 'number') return gasClass;
  const map: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
  return map[String(gasClass).toUpperCase().trim()] ?? 1;
}
```

Fallback to `1` (Gas I) if unrecognised.

### 2.5 Other Input Methods

| Method | How | Details |
|--------|-----|---------|
| URL `?system=<base64>` | `decodeMapPayload(search)` | Base64-encoded JSON of MapPayload |
| URL `?starId=<id>` | `loadSavedPage(starId)` | Load from `localStorage['mneme-2dmap-<id>']` |
| `window.__MNEME_INITIAL_PAYLOAD__` | checked at startup | Injected by standalone interactive HTML export |
| `postMessage { type: 'mneme-load-system', payload }` | embed mode only | Sent by MWG parent iframe |
| Generate Random | button `#btn-generate-system` | Calls `generateRandomSystem()` |

---

## 3. Internal Scene Types

### 3.1 BodyType
```typescript
type BodyType =
  | 'star-primary' | 'star-companion'
  | 'disk'
  | 'dwarf' | 'terrestrial' | 'ice'
  | 'gas-i' | 'gas-ii' | 'gas-iii' | 'gas-iv' | 'gas-v'
  | 'moon';
```

### 3.2 SceneBody
```typescript
interface SceneBody {
  id:          string;
  type:        BodyType;
  label:       string;
  distanceAU:  number;   // orbital distance from star (AU); 0 for primary star
  mass:        number;   // Earth masses
  radiusPx:    number;   // visual radius in canvas pixels (unscaled)
  colour:      string;   // fill hex
  strokeColour: string;  // stroke hex
  angle:       number;   // initial orbital angle (radians) at epoch
  periodDays:  number;   // full orbit period in days; 0 = stationary
  isMainWorld: boolean;
  diskPoints?: DiskPoint[];       // only for 'disk' type
  parentId?:   string;           // only for moons
  moonOrbitAU?: number;          // only for moons
  velocityKms?: number;          // orbital velocity km/s (display only)
}

interface DiskPoint {
  angle:        number;  // radians offset from disk orbital angle
  radiusOffset: number;  // fraction of orbit radius (±0.04)
  opacity:      number;  // 0.2–0.7
  size:         number;  // px, 0.8–1.7
}
```

### 3.3 AppState
```typescript
interface AppState {
  ctx:           CanvasRenderingContext2D | null;
  canvas:        HTMLCanvasElement | null;
  bodies:        SceneBody[];
  camera:        { x: number; y: number; zoom: number };
  isPlaying:     boolean;
  isReversed:    boolean;
  speed:         number;           // simulation days per real second
  simDayOffset:  number;           // days elapsed from epoch
  epochDate:     Date;             // UTC Date for epoch
  starfieldSeed: string;           // 8-char seed
  lastFrameTime: number;           // performance.now() of last frame
  width:         number;           // viewport width px
  height:        number;           // viewport height px
  zones?:        ZoneBoundaries;
  gmNotes?:      string;
  travelPlanner?: TravelPlannerState;
  // Injected by initRenderer — used by loadSystemIntoState:
  updateStarfield?: () => void;
  initCamera?:      () => void;
}

interface ZoneBoundaries {
  infernal:     { min: number; max: number };
  hot:          { min: number; max: number };
  conservative: { min: number; max: number };
  cold:         { min: number; max: number };
  outer:        { min: number; max: number | null };
}
```

---

## 4. Data Adapter — buildSceneGraph()

`export function buildSceneGraph(system: MWGStarSystem): SceneBody[]`

Produces a flat `SceneBody[]`. Processes in order:

### 4.1 Hash Base
```typescript
const baseHash = system.key || system.id || JSON.stringify(system.primaryStar);
const starMass = system.primaryStar.mass;
```

### 4.2 idMap
Maintain `const idMap = new Map<string, string>()` to map body `id` → scene body `id`.  
`addBody(originalId, sceneBody)` pushes to `bodies` and calls `idMap.set(originalId, sceneBody.id)` when `originalId` is defined.

### 4.3 Processing Order

**1. Primary star** — always added, `distanceAU: 0`, `periodDays: 0`.
```
id:         'star-primary'
type:       'star-primary'
label:      `${class}${grade}`   e.g. "M8"
radiusPx:   14
colour:     getSpectralColour(class)   // see §4.5
strokeColour: '#ffffff'
angle:      0
isMainWorld: false
```

**2. Companion stars** — iterate `system.companionStars`:
```
id:         `star-companion-${idx}`
type:       'star-companion'
label:      `${class}${grade}`
distanceAU: star.orbitDistance          // AU as-is
radiusPx:   10
colour:     getSpectralColour(class)
strokeColour: '#ffffff'
angle:      hashToFloat(baseHash + `-companion-${idx}`) * 2π
periodDays: calculatePeriodDays(star.orbitDistance)
velocityKms: calculateOrbitalVelocityKms(starMass, star.orbitDistance)
isMainWorld: false
```

Note: do NOT multiply `orbitDistance` by any factor for period calculation. Use AU directly.

**3. Circumstellar disks** — iterate `system.circumstellarDisks`:
```
id:         disk.id || `disk-${idx}`
type:       'disk'
label:      'Disk'
distanceAU: disk.distanceAU
mass:       disk.mass
radiusPx:   5
colour:     'transparent'
strokeColour: '#8B7355'
angle:      hashToFloat(baseHash + `-disk-${idx}`) * 2π
periodDays: calculatePeriodDays(disk.distanceAU)
isMainWorld: false
diskPoints: generateDiskPoints(baseHash + `-disk-${idx}`)
```
`addBody(disk.id, sceneBody)`

**4. Dwarf planets** — iterate `system.dwarfPlanets`:
```
id:         p.id || `dwarf-${idx}`
type:       'dwarf'
label:      'Dwarf'
distanceAU: p.distanceAU
mass:       p.mass
radiusPx:   massToRadiusPx(p.mass, 'dwarf')
colour:     '#9CA3AF'
strokeColour: '#4B5563'
angle:      hashToFloat(baseHash + `-dwarf-${idx}`) * 2π
periodDays: calculatePeriodDays(p.distanceAU)
velocityKms: calculateOrbitalVelocityKms(starMass, p.distanceAU)
isMainWorld: false
```
`addBody(p.id, sceneBody)`

**5. Terrestrial worlds** — iterate `system.terrestrialWorlds`:
```
type:       'terrestrial'
label:      'Terrestrial'
colour:     '#4ADE80'
strokeColour: '#166534'
isMainWorld: (system.mainWorld?.type === 'Terrestrial' && system.mainWorld.distanceAU === p.distanceAU)
```
Same pattern as dwarfs. `addBody(p.id, sceneBody)`

**6. Ice worlds** — iterate `system.iceWorlds`:
```
type:       'ice'
label:      'Ice'
colour:     '#22D3EE'
strokeColour: '#155E75'
isMainWorld: (system.mainWorld?.type === 'Ice World' && system.mainWorld.distanceAU === p.distanceAU)
```
`addBody(p.id, sceneBody)`

**7. Gas worlds** — iterate `system.gasWorlds`:
```typescript
const gasClassNum = normalizeGasClass(p.gasClass);  // always normalise
const type = { 1:'gas-i', 2:'gas-ii', 3:'gas-iii', 4:'gas-iv', 5:'gas-v' }[gasClassNum] ?? 'gas-i';
label = `Gas ${gasClassNum === 4 ? 'IV/V' : toRoman(gasClassNum)}`;
```
Colour lookup by type (see §4.5). `addBody(p.id, sceneBody)`

**8. Main world marking** — if `system.mainWorld` exists:
Search `bodies` for an existing body where:
```typescript
b.distanceAU === mw.distanceAU &&
(b.type === 'terrestrial' || b.type === 'ice' || b.type === 'dwarf')
```
If found: set `existing.isMainWorld = true`, `existing.label = '★ MAIN'`, `existing.strokeColour = '#FACC15'`.  
If NOT found: add a new body:
```
id:         'main-world'
type:       mw.type === 'Dwarf' ? 'dwarf' : mw.type === 'Ice World' ? 'ice' : 'terrestrial'
label:      '★ MAIN'
distanceAU: mw.distanceAU
mass:       mw.massEM
strokeColour: '#FACC15'
isMainWorld: true
angle:      hashToFloat(baseHash + '-main-world') * 2π
periodDays: calculatePeriodDays(mw.distanceAU)
velocityKms: calculateOrbitalVelocityKms(starMass, mw.distanceAU)
```

**9. Moons** — iterate `system.moons`:
```typescript
const parentSceneId = idMap.get(moon.parentId);
if (!parentSceneId) return;  // skip orphaned moons
const parentBody = bodies.find(b => b.id === parentSceneId);
if (!parentBody) return;
```
```
id:          moon.id || `moon-${idx}`
type:        'moon'
label:       'Moon'
distanceAU:  parentBody.distanceAU   // same as parent (for camera maxAU)
mass:        moon.mass
radiusPx:    massToRadiusPx(moon.mass, 'moon')
colour:      '#D1D5DB'
strokeColour: '#6B7280'
angle:       hashToFloat(baseHash + `-moon-${idx}`) * 2π
periodDays:  calculateMoonPeriodDays(parentBody.mass, moon.moonOrbitAU)
isMainWorld: false
parentId:    parentSceneId
moonOrbitAU: moon.moonOrbitAU
velocityKms: calculateMoonOrbitalVelocityKms(parentBody.mass, moon.moonOrbitAU)
```
`addBody(moon.id, sceneBody)`

### 4.4 massToRadiusPx(mass, type)
```
star-primary / star-companion → 12 (fixed)
gas-*                         → 7 (fixed)
disk                          → 0 (uses diskPoints)
dwarf                         → 3
ice                           → 3.5
moon                          → 2
terrestrial                   → 4
```

### 4.5 Spectral Colours
```typescript
const SPECTRAL: Record<string, string> = {
  O: '#A5C8FF', B: '#C2D8FF', A: '#FFFFFF',
  F: '#FFF8E7', G: '#FFE4B5', K: '#FFB366', M: '#FF6B6B',
};
getSpectralColour(cls: string) → SPECTRAL[cls[0].toUpperCase()] ?? '#FFFFFF'
```

### 4.6 Body Colours
```typescript
const BODY_COLOURS = {
  'star-primary':   { fill: '#FFE4B5', stroke: '#ffffff' },
  'star-companion': { fill: '#FFE4B5', stroke: '#ffffff' },
  disk:             { fill: 'transparent', stroke: '#8B7355' },
  dwarf:            { fill: '#9CA3AF', stroke: '#4B5563' },
  terrestrial:      { fill: '#4ADE80', stroke: '#166534' },
  ice:              { fill: '#22D3EE', stroke: '#155E75' },
  'gas-i':          { fill: '#FDE047', stroke: '#A16207' },
  'gas-ii':         { fill: '#60A5FA', stroke: '#1E40AF' },
  'gas-iii':        { fill: '#FB923C', stroke: '#9A3412' },
  'gas-iv':         { fill: '#C084FC', stroke: '#7E22CE' },
  'gas-v':          { fill: '#E5E7EB', stroke: '#4B5563' },
  moon:             { fill: '#D1D5DB', stroke: '#6B7280' },
};
```

### 4.7 Disk Point Generation
```typescript
function generateDiskPoints(seed: string): DiskPoint[] {
  const rng = mulberry32(seed);
  const count = 300 + Math.floor(rng() * 500);  // 300–800 points
  return Array.from({ length: count }, () => ({
    angle:        rng() * Math.PI * 2,
    radiusOffset: (rng() - 0.5) * 0.08,
    opacity:      0.2 + rng() * 0.5,
    size:         0.8 + rng() * 0.9,
  }));
}
```

---

## 5. Orbital Math

All in `src/orbitMath.ts`.

### 5.1 Constants
```typescript
const EARTH_PERIOD_DAYS = 365.25;
const G = 6.674e-11;           // m³ kg⁻¹ s⁻²
const EM_TO_KG = 5.972e24;     // kg per Earth mass
const AU_TO_M = 1.496e11;      // metres per AU
const SECONDS_PER_DAY = 86400;
```

### 5.2 Functions
```typescript
// Kepler's 3rd Law (star as central mass, simplified):
function calculatePeriodDays(distanceAU: number): number {
  return EARTH_PERIOD_DAYS * Math.sqrt(distanceAU ** 3);
}

// Moon orbit period around parent:
function calculateMoonPeriodDays(parentMassEM: number, orbitAU: number): number {
  const M = parentMassEM * EM_TO_KG;
  const r = orbitAU * AU_TO_M;
  const T = 2 * Math.PI * Math.sqrt(r ** 3 / (G * M));
  return T / SECONDS_PER_DAY;
}

// Orbital velocity with small random variance (±5%) for visual interest:
function calculateOrbitalVelocityKms(starMassSolar: number, distanceAU: number, variance = 0.05): number
function calculateMoonOrbitalVelocityKms(parentMassEM: number, orbitAU: number, variance = 0.05): number

// Deterministic angle seeding from string:
function hashToFloat(str: string): number   // returns [0, 1)

// Convert orbit period + days elapsed to radian offset:
function daysToAngleOffset(periodDays: number, days: number): number {
  return periodDays > 0 ? (2 * Math.PI * days) / periodDays : 0;
}
```

---

## 6. Camera System

All in `src/camera.ts`.

### 6.1 Log-Scale Distance
```typescript
function logScaleDistance(au: number, scaleFactor = 80): number {
  return Math.log10(au + 1) * scaleFactor;
}
```
This is the ONLY distance → pixels function. All rendering uses it.

### 6.2 resetCamera
Fit the outermost body into 80% of the smaller viewport dimension:
```typescript
function resetCamera(camera, width, height, maxAU): void {
  const targetZoom = Math.min(width, height) / (logScaleDistance(maxAU, 80) * 2.5);
  camera.zoom = targetZoom > 0 ? targetZoom : 1;
  camera.x = 0;
  camera.y = 0;
}
```

### 6.3 Zoom
```typescript
function zoomTo(camera, screenPoint, cx, cy, factor): void
// clamp: camera.zoom = Math.max(0.05, Math.min(camera.zoom * factor, 500))
```

### 6.4 Pan
```typescript
function pan(camera, dx, dy): void {
  camera.x -= dx / camera.zoom;
  camera.y -= dy / camera.zoom;
}
```

### 6.5 Coordinate Conversion
```typescript
function worldToScreen(point, camera, cx, cy): Point {
  return { x: cx + (point.x - camera.x) * camera.zoom,
           y: cy + (point.y - camera.y) * camera.zoom };
}
function screenToWorld(point, camera, cx, cy): Point {
  return { x: camera.x + (point.x - cx) / camera.zoom,
           y: camera.y + (point.y - cy) / camera.zoom };
}
```

---

## 7. Renderer

All in `src/renderer.ts`.

### 7.1 Canvas Setup

```typescript
export function resizeCanvas(state: AppState): void {
  const dpr = window.devicePixelRatio || 1;
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  state.canvas.width  = Math.floor(state.width * dpr);
  state.canvas.height = Math.floor(state.height * dpr);
  state.canvas.style.width  = `${state.width}px`;
  state.canvas.style.height = `${state.height}px`;
  state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
```

### 7.2 RAF Loop — Safety Requirements (CRITICAL)

```typescript
export function initRenderer(state: AppState): () => void {
  let rafId = 0;
  let starfield = generateStarfield(state.starfieldSeed, state.width, state.height);
  let nebulas   = generateNebula(state.starfieldSeed, state.width, state.height);
  let cameraInitialized = false;

  function updateStarfield() {
    starfield = generateStarfield(state.starfieldSeed, state.width, state.height);
    nebulas   = generateNebula(state.starfieldSeed, state.width, state.height);
  }
  function initCamera() {
    if (cameraInitialized) return;
    const maxAU = state.bodies.length > 0
      ? Math.max(...state.bodies.map(b => b.distanceAU)) : 1;
    resetCamera(state.camera, state.width, state.height, maxAU);
    cameraInitialized = true;
  }

  // Expose on state so loadSystemIntoState can trigger regeneration:
  (state as any).updateStarfield = updateStarfield;
  (state as any).initCamera = initCamera;

  function loop(now: number) {
    // ★ RAF MUST be scheduled FIRST — before any draw call —
    //   so that a thrown exception cannot permanently kill the loop.
    rafId = requestAnimationFrame(loop);

    const rawDt = (now - state.lastFrameTime) / 1000;
    const dt = Math.min(rawDt, 0.1);   // cap at 100ms to handle tab-hidden resume
    state.lastFrameTime = now;

    if (state.isPlaying) {
      const dir = state.isReversed ? -1 : 1;
      state.simDayOffset += dt * state.speed * dir;
    }

    // ★ Wrap draw in try/catch — a frame error must NEVER kill the loop.
    try {
      initCamera();
      draw(state, starfield, nebulas);
    } catch (err) {
      console.error('[renderer] frame error:', err);
    }
  }

  state.lastFrameTime = performance.now();
  rafId = requestAnimationFrame(loop);

  window.addEventListener('beforeunload', () => cancelAnimationFrame(rafId));
  return () => cancelAnimationFrame(rafId);
}
```

### 7.3 Draw Order

```
1. Fill background: ctx.fillStyle = '#0a0a0f'; fillRect full canvas
2. drawNebula(ctx, nebulas)
3. drawStarfield(ctx, starfield)
4. Compute origin: originX = width/2 - camera.x * camera.zoom
                   originY = height/2 - camera.y * camera.zoom
5. drawZoneBands(ctx, state.zones, originX, originY, camera.zoom, width, height)
6. Draw L1 orbits (thin circles around star)
7. Draw L2 moon orbits (thin circles around parent positions)
8. computeBodyFrames → Map<id, BodyFrame>
9. For each body: drawBody(ctx, body, frame, ...)
10. drawTravelPlannerOverlays(ctx, state, frames)
```

### 7.4 drawZoneBands — Safety Guards (CRITICAL)

```typescript
const ZONE_BANDS = [
  { key: 'infernal',     inner: 'rgba(255,60,60,0.18)',   outer: 'rgba(255,60,60,0.02)' },
  { key: 'hot',          inner: 'rgba(255,140,40,0.12)',  outer: 'rgba(255,140,40,0.02)' },
  { key: 'conservative', inner: 'rgba(40,220,100,0.10)',  outer: 'rgba(40,220,100,0.02)' },
  { key: 'cold',         inner: 'rgba(60,140,255,0.10)',  outer: 'rgba(60,140,255,0.02)' },
  // 'outer' zone has max=null — excluded from ZONE_BANDS intentionally
];

function drawZoneBands(ctx, zones, originX, originY, zoom, width, height): void {
  if (!zones) return;
  for (const band of ZONE_BANDS) {
    const zone = zones[band.key];

    // ★ Use == null (not === null) to catch both null AND undefined zone.max:
    if (!zone || zone.max == null) continue;

    const innerR = logScaleDistance(Math.max(0, zone.min), 80) * zoom;
    const outerR = logScaleDistance(zone.max, 80) * zoom;

    // ★ Guard: outerR must be > 0 AND strictly > innerR.
    //   createRadialGradient throws DOMException when r0 >= r1.
    //   Compact M-class systems can have zone.min ≈ zone.max.
    if (outerR <= 0 || innerR >= outerR) continue;

    const g = ctx.createRadialGradient(originX, originY, innerR, originX, originY, outerR);
    g.addColorStop(0, band.inner);
    g.addColorStop(1, band.outer);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(originX, originY, outerR, 0, Math.PI * 2);
    ctx.arc(originX, originY, innerR, 0, Math.PI * 2, true);
    ctx.fill();
  }
}
```

### 7.5 computeBodyFrames

```typescript
interface BodyFrame { x: number; y: number; angle: number; distPx: number; }

function computeBodyFrames(bodies, originX, originY, simDayOffset, zoom): Map<string, BodyFrame> {
  const frames = new Map<string, BodyFrame>();

  // Pass 1: L1 bodies (no parent)
  for (const body of bodies) {
    if (body.parentId) continue;
    const angle  = body.angle + daysToAngleOffset(body.periodDays, simDayOffset);
    const distPx = body.distanceAU > 0 ? logScaleDistance(body.distanceAU, 80) * zoom : 0;
    frames.set(body.id, {
      x: originX + Math.cos(angle) * distPx,
      y: originY + Math.sin(angle) * distPx,
      angle, distPx,
    });
  }

  // Pass 2: moons (need parent frame)
  for (const body of bodies) {
    if (!body.parentId) continue;
    const parentFrame = frames.get(body.parentId);
    if (!parentFrame) continue;
    const angle = body.angle + daysToAngleOffset(body.periodDays, simDayOffset);
    // Scale moon orbit: visible but capped at 25% of parent's star-orbit radius
    const rawMoonDist  = body.moonOrbitAU ? body.moonOrbitAU * 200 * zoom : 0;
    const maxMoonDist  = parentFrame.distPx * 0.25;
    const moonDistPx   = Math.max(6, Math.min(maxMoonDist, rawMoonDist));
    frames.set(body.id, {
      x: parentFrame.x + Math.cos(angle) * moonDistPx,
      y: parentFrame.y + Math.sin(angle) * moonDistPx,
      angle,
      distPx: moonDistPx,
    });
  }
  return frames;
}
```

### 7.6 drawBody

Off-screen culling (skip non-disk bodies >20px outside viewport).  
Labels rendered for: `isMainWorld`, any star type, any disk, or `zoom >= 0.35`.  
Velocity label rendered for: `isMainWorld || zoom >= 1.0`.

Main world bodies get `lineWidth = 2`; all others `lineWidth = 1`.

Disk rendering: if `diskPoints.length > 0`, plot each point as a tiny arc (radius = `pt.size`) at `originX + cos(frame.angle + pt.angle) * (frame.distPx * (1 + pt.radiusOffset))`.

### 7.7 Starfield & Nebula

```typescript
// mulberry32 PRNG seeded by starfieldSeed string
// generateStarfield(seed, width, height, density=300): Star[]
//   → 300 stars per 1920×1080, scaled to viewport area
//   → colours: '#ffffff', '#dbeafe', '#fef3c7'
//   → radius: 0.5–2px; opacity: 0.1–0.8

// generateNebula(seed, width, height): Nebula[]
//   → 3–6 nebula blobs
//   → colours: '#4c1d95','#312e81','#1e3a8a','#831843'
//   → radius: 100–400px; opacity: 0.03–0.08
```

---

## 8. loadSystemIntoState()

Called when a new system is loaded (paste, generate, embed message):

```typescript
function loadSystemIntoState(state: AppState, payload: MapPayload): void {
  currentPayload = payload;
  state.starfieldSeed = payload.starfieldSeed || state.starfieldSeed;
  state.epochDate    = new Date(Date.UTC(
    payload.epoch.year, payload.epoch.month - 1, payload.epoch.day
  ));
  state.simDayOffset = 0;
  state.bodies = buildSceneGraph(payload.starSystem);
  state.zones  = payload.starSystem.zones;

  const seedDisplay = document.getElementById('seed-display') as HTMLInputElement | null;
  if (seedDisplay) seedDisplay.value = state.starfieldSeed;

  const maxAU = state.bodies.length > 0
    ? Math.max(...state.bodies.map(b => b.distanceAU)) : 1;
  resetCamera(state.camera, state.width, state.height, maxAU);

  // These are no-ops if the loop has already initialised them,
  // but trigger updates if called before first frame or after resize:
  (state as any).initCamera?.();
  (state as any).updateStarfield?.();

  setEditorSystem(payload.starSystem, state.gmNotes || '');
}
```

---

## 9. HTML Structure

File: `index.html`. All IDs are stable contracts — do not rename them.

```
<body>
  <div id="app">
    <canvas id="starmap"></canvas>

    <!-- FAB to re-open collapsed panel; hidden by default on desktop -->
    <button id="btn-expand-panel" class="panel-fab" style="display:none">☰</button>

    <div id="controls" class="control-panel">
      <div class="panel-header">
        <button id="btn-collapse-panel" class="btn panel-toggle">✕</button>
      </div>

      <!-- Tab nav -->
      <div class="tabs">
        <button class="tab-btn active" data-tab="map">Map</button>
        <button class="tab-btn"        data-tab="editor">System Editor</button>
        <button class="tab-btn"        data-tab="travel">Travel Planner</button>
      </div>

      <!-- ═══ MAP TAB ═══ -->
      <div id="tab-map" class="tab-panel active">
        <div class="control-row">
          <a href="https://game-in-the-brain.github.io/Mneme-CE-World-Generator/"
             class="btn small" style="width:100%">🌍 Generate Worlds →</a>
        </div>

        <!-- Playback -->
        <div class="control-row">
          <button id="btn-play">▶</button>
          <button id="btn-pause" style="display:none">⏸</button>
          <button id="btn-reverse">⏮</button>
          <select id="speed-select">
            <option value="0.25">0.25×</option>
            <option value="0.5">0.5×</option>
            <option value="1" selected>1×</option>
            <option value="2">2×</option>
            <option value="5">5×</option>
            <option value="10">10×</option>
            <option value="30">30×</option>
            <option value="365">365×</option>
          </select>
        </div>

        <!-- Step / reset -->
        <div class="control-row">
          <button id="btn-step-minus-7">-7d</button>
          <button id="btn-step-minus-1">-1d</button>
          <button id="btn-step-plus-1">+1d</button>
          <button id="btn-step-plus-7">+7d</button>
          <button id="btn-reset">Reset Time</button>
        </div>
        <div class="control-row">
          <button id="btn-reset-view">Reset View</button>
        </div>

        <!-- Live date display -->
        <div class="control-row info">
          <span id="date-display">2300-01-01</span>
        </div>

        <!-- Starfield seed -->
        <div class="control-row seed-row">
          <label for="seed-display">Seed:</label>
          <input id="seed-display" type="text" readonly value="--------" />
          <button id="btn-seed-regen" title="New seed">🎲</button>
          <button id="btn-seed-copy" title="Copy seed">📋</button>
        </div>
        <div class="control-row seed-row">
          <input id="seed-paste" type="text" placeholder="Paste seed…" maxlength="8" />
          <button id="btn-seed-apply">Apply</button>
        </div>

        <!-- Export -->
        <div class="control-row">
          <button id="btn-save-page" style="width:100%">💾 Save Snapshot</button>
        </div>
        <div class="control-row">
          <button id="btn-export-interactive" style="width:100%">🎬 Export Interactive Map</button>
        </div>
        <div class="control-row">
          <button id="btn-export-csv">Export CSV</button>
          <button id="btn-export-docx">Export DOCX</button>
        </div>

        <!-- Load / Generate -->
        <div class="control-row">
          <button id="btn-generate-system" style="width:100%">🎲 Generate Random System</button>
        </div>
        <div class="control-row">
          <textarea id="system-paste" placeholder="Paste system JSON from MWG…"
                    rows="3" style="width:100%;font-family:monospace;font-size:10px;resize:vertical">
          </textarea>
        </div>
        <div class="control-row">
          <button id="btn-load-system">Load System</button>
          <button id="btn-download-system">Download JSON</button>
        </div>
      </div><!-- /tab-map -->

      <!-- ═══ EDITOR TAB ═══ -->
      <div id="tab-editor" class="tab-panel">
        <div id="editor-empty">Load a system to edit its data.</div>
        <div id="editor-form" style="display:none">
          <div class="editor-section">
            <label>System Name / Key</label>
            <input id="edit-name" type="text" placeholder="Unnamed System" />
          </div>
          <div class="editor-section">
            <label>Primary Star</label>
            <select id="edit-star-class">
              <option>O</option><option>B</option><option>A</option>
              <option>F</option><option>G</option><option>K</option><option>M</option>
            </select>
            <select id="edit-star-grade">
              <option>0</option><option>1</option><option>2</option><option>3</option>
              <option>4</option><option>5</option><option>6</option><option>7</option>
              <option>8</option><option>9</option>
            </select>
          </div>
          <div class="editor-section">
            <label>Main World Type</label>
            <select id="edit-world-type">
              <option value="Terrestrial">Terrestrial</option>
              <option value="Dwarf">Dwarf</option>
              <option value="Ice World">Ice World</option>
            </select>
          </div>
          <div class="editor-section">
            <label>GM Notes</label>
            <textarea id="edit-gm-notes" rows="4" placeholder="Add your notes here…"></textarea>
          </div>
        </div>
      </div><!-- /tab-editor -->

      <!-- ═══ TRAVEL PLANNER TAB ═══ -->
      <div id="tab-travel" class="tab-panel">
        <div id="travel-empty">Select an origin and destination on the map.</div>
        <div id="travel-form" style="display:none">
          <div class="travel-section">
            <label>Origin</label>
            <div id="travel-origin">—</div>
          </div>
          <div class="travel-section">
            <label>Destination</label>
            <div id="travel-destination">—</div>
          </div>
          <div class="travel-section">
            <label>Spacecraft ΔV (km/s)</label>
            <input id="travel-delta-v" type="number" step="0.1" min="0" value="20" />
          </div>
          <div class="travel-section">
            <label>
              <input id="travel-use-sim-date" type="checkbox" checked />
              Use current simulation date
            </label>
            <input id="travel-departure-date" type="date" style="display:none" />
          </div>
          <div class="control-row">
            <button id="btn-calculate-transfer" style="width:100%">🚀 Calculate Transfer</button>
          </div>
          <div class="control-row">
            <button id="btn-clear-travel" style="width:100%">Clear Selection</button>
          </div>
          <div id="travel-results" style="display:none">
            <div><span>Escape Origin:</span><span id="res-escape-origin">—</span></div>
            <div><span>Capture Dest:</span> <span id="res-capture-dest">—</span></div>
            <div><span>Excess ΔV:</span>    <span id="res-excess-dv">—</span></div>
            <div><span>Optimistic:</span>   <span id="res-optimistic">—</span></div>
            <div><span>Likely:</span>       <span id="res-likely">—</span></div>
            <div><span>Pessimistic:</span>  <span id="res-pessimistic">—</span></div>
            <div><span>Next Window:</span>  <span id="res-next-window">—</span></div>
          </div>
        </div>
      </div><!-- /tab-travel -->

      <div class="version-footer">
        <span id="version-display">—</span>
      </div>
    </div><!-- /controls -->

    <div id="version-watermark" class="version-watermark">—</div>
    <div id="loading" class="loading-overlay" style="display:none">
      <div class="spinner"></div><p>Loading system…</p>
    </div>
  </div><!-- /app -->

  <script type="module" src="./src/main.ts"></script>
</body>
```

---

## 10. UI Controls Behaviour

### 10.1 Tab Switching
All `.tab-btn[data-tab]` elements toggle `.active` on themselves and show/hide `#tab-${target}` panels. Implemented in `src/editor.ts` `initEditor()`. The travel planner's active state is tracked by polling `.tab-btn[data-tab="travel"].active`.

### 10.2 Panel Collapse / Expand
- `#btn-collapse-panel` → adds `collapsed` class to `#controls`, shows `#btn-expand-panel`
- `#btn-expand-panel` → removes `collapsed`, hides FAB
- On mobile (viewport ≤ 768px): panel starts collapsed; FAB visible

### 10.3 Playback Controls
```
#btn-play     → state.isPlaying = true; toggle display with #btn-pause
#btn-pause    → state.isPlaying = false
#btn-reverse  → state.isReversed = !state.isReversed; toggle .active class
#speed-select → state.speed = parseFloat(value)
#btn-step-minus-7 → state.simDayOffset -= 7; pause
#btn-step-minus-1 → state.simDayOffset -= 1; pause
#btn-step-plus-1  → state.simDayOffset += 1; pause
#btn-step-plus-7  → state.simDayOffset += 7; pause
#btn-reset        → state.simDayOffset = 0
```

`#date-display` updates every frame: display the date as `epochDate + simDayOffset days` formatted `YYYY-MM-DD`.

### 10.4 Seed Controls
```
#btn-seed-regen  → generate new 8-char seed → update state.starfieldSeed
                   → call state.updateStarfield() → update #seed-display
#btn-seed-copy   → navigator.clipboard.writeText(state.starfieldSeed)
#btn-seed-apply  → read #seed-paste, trim, if 1–8 chars: update seed and starfield
```

### 10.5 Load / Paste System
```
#btn-load-system click:
  payload = parseSystemPaste(#system-paste.value)
  if payload:
    try:
      loadSystemIntoState(state, payload)
      clear #system-paste
    catch err:
      alert(`Failed to load system: ${err.message}`)
  else if #system-paste.value.trim():
    alert('Could not parse system JSON. Make sure you copied it with "Copy for 2D Map" from MWG.')
```

### 10.6 Download JSON
```
#btn-download-system click:
  if !currentPayload: alert('No system loaded.')
  else: download JSON file named `mneme-map-<starClass><grade>-<seed>.json`
```

### 10.7 Generate Random
```
#btn-generate-system click:
  payload = generateRandomSystem()
  loadSystemIntoState(state, payload)
```

---

## 11. Input Handlers

File: `src/input.ts`. Wired on `state.canvas`.

| Event | Behaviour |
|-------|-----------|
| `wheel` | `zoomTo(camera, mousePos, cx, cy, e.deltaY < 0 ? 1.15 : 0.87)` |
| `mousedown` | Record drag start; set `isDragging=false` |
| `mousemove` | If button held: `pan(camera, dx, dy)`, set `isDragging=true` if moved >4px |
| `mouseup` | If `!isDragging`: check travel planner click |
| `dblclick` | Reset view |
| `touchstart` | Track touches; record for pinch/double-tap (300ms, 30px radius) |
| `touchmove` | 1 touch → pan; 2 touches → pinch zoom |
| `touchend` | If was tap: check travel planner click |

Click threshold: 4px. Touch double-tap: 300ms window, touch centres within 30px.

---

## 12. Travel Planner

**Reference implementation**: `/home/justin/opencode260220/Mneme-CE-World-Generator/solar-system-2d/src/travelPlanner.ts`  
The MWG solar-system-2d version is the authoritative spec. Implement it fully.

### 12.1 Types

```typescript
// src/types.ts

interface TravelTimelineState {
  travelDayOffset:          number;           // days into journey (0 = launch)
  isPlaying:                boolean;
  isLooping:                boolean;
  playbackSpeed:            number;           // days/sec multiplier
  pinnedDepartureDayOffset: number | null;   // null = use plan's departureDayOffset
}

interface TravelPlannerState {
  originId:                 string | null;
  destinationId:            string | null;
  deltaVBudget:             number;           // km/s, default 20
  useSimDate:               boolean;          // true = use state.simDayOffset
  customDepartureDayOffset: number;
  lastPlan:                 TravelPlan | null;
  isActive:                 boolean;          // true when Travel tab is shown
  timeline:                 TravelTimelineState;
}

interface TravelPlan {
  originId:               string;
  destinationId:          string;
  departureDayOffset:     number;
  deltaVBudgetKms:        number;
  escapeOriginKms:        number;
  captureDestKms:         number;
  excessDeltaVKms:        number;
  optimisticArrivalDays:  number;
  pessimisticArrivalDays: number;
  synodicPeriodDays:      number;
  nextWindowDayOffset:    number;
  isPossible:             boolean;
  minDistanceAU:          number;             // min separation over synodic period
  maxDistanceAU:          number;
  failureReason:          string | null;      // human-readable if !isPossible
}
```

### 12.2 Body Hit Detection

```typescript
// Iterate bodies in REVERSE render order (last drawn = topmost = picked first).
// Hit radius = Math.max(body.radiusPx, 8) — uses BASE pixel size, NOT zoom-scaled.
// This gives pixel-accurate selection: a small body won't eat clicks from a larger neighbour.
// Bodies whose centre is off-screen by > 40px are skipped before distance check.

export function findBodyAtScreenPos(
  screenX: number,
  screenY: number,
  state: AppState
): SceneBody | null {
  const { bodies, width, height } = state;
  const margin = 40;
  let nearest: SceneBody | null = null;
  let nearestDist = Infinity;

  for (let i = bodies.length - 1; i >= 0; i--) {
    const body = bodies[i];
    const pos = getBodyScreenPos(body, state);
    if (!pos) continue;
    if (pos.x < -margin || pos.x > width + margin ||
        pos.y < -margin || pos.y > height + margin) continue;

    const dist = Math.hypot(pos.x - screenX, pos.y - screenY);
    const hitR  = Math.max(body.radiusPx, 8);
    if (dist < hitR && dist < nearestDist) {
      nearest = body;
      nearestDist = dist;
    }
  }
  return nearest;
}
```

`getBodyScreenPos(body, state)` mirrors `computeBodyFrames` logic using `logScaleDistance` and the camera state. Moons use their parent's frame as base, same as the renderer.

### 12.3 Click Logic (handleTravelPlannerClick)

```
if tp not active → return false

body = findBodyAtScreenPos(screenX, screenY, state)

if !body (click on empty space):
  tp.originId = null
  tp.destinationId = null
  tp.lastPlan = null
  refreshTravelPanel(state)
  return true

if body.id === tp.originId:
  // Click origin again → promote destination to origin, clear destination
  tp.originId = tp.destinationId
  tp.destinationId = null
elif body.id === tp.destinationId:
  // Click destination again → clear destination
  tp.destinationId = null
elif !tp.originId:
  tp.originId = body.id
elif !tp.destinationId:
  tp.destinationId = body.id
else:
  // Both filled → replace destination
  tp.destinationId = body.id

refreshTravelPanel(state)
return true
```

### 12.4 refreshTravelPanel(state)

A standalone exported function (not event-dispatch). Called directly after every selection change and after calculate:

```typescript
export function refreshTravelPanel(state: AppState): void {
  const tp = state.travelPlanner;
  if (!tp) return;
  const hasOrigin = tp.originId !== null;
  const hasDest   = tp.destinationId !== null;

  // Show/hide empty state vs. form
  travelEmpty.style.display = hasOrigin ? 'none' : 'block';
  travelForm.style.display  = hasOrigin ? 'flex'  : 'none';

  // Body labels
  if (hasOrigin) travelOriginEl.textContent = labelFor(tp.originId);
  if (hasDest)   travelDestEl.textContent   = labelFor(tp.destinationId);
  else           travelDestEl.textContent   = '—';

  // Calculate button: enabled only when both selected and different
  btnCalculate.disabled = !(hasOrigin && hasDest && tp.originId !== tp.destinationId);

  // Distance context (always shown when both selected)
  updateDistanceContext();
}
```

### 12.5 Active Tab Tracking

Use direct click listeners on tab buttons — do NOT poll with setInterval:

```typescript
// In initTravelPlanner:
document.querySelector('.tab-btn[data-tab="travel"]')
  ?.addEventListener('click', () => { tp.isActive = true;  refreshTravelPanel(state); });
document.querySelectorAll('.tab-btn:not([data-tab="travel"])')
  .forEach(btn => btn.addEventListener('click', () => { tp.isActive = false; }));
```

### 12.6 Distance Context — Live Update

```typescript
function updateDistanceContext(): void {
  if (!tp.originId || !tp.destinationId) return;
  const origin = state.bodies.find(b => b.id === tp.originId);
  const dest   = state.bodies.find(b => b.id === tp.destinationId);
  if (!origin || !dest) return;

  const oPos = getBodyPositionAU(origin, state.simDayOffset, state.bodies);
  const dPos = getBodyPositionAU(dest,   state.simDayOffset, state.bodies);
  const dist = Math.hypot(dPos.x - oPos.x, dPos.y - oPos.y);

  resCurrentDist.textContent = `${dist.toFixed(3)} AU`;

  // Min/max from last plan (if available)
  if (tp.lastPlan) {
    resMinDist.textContent = `${tp.lastPlan.minDistanceAU.toFixed(3)} AU`;
    resMaxDist.textContent = `${tp.lastPlan.maxDistanceAU.toFixed(3)} AU`;
  }
}

// Refresh distance context every 200ms while tab is active:
setInterval(() => {
  if (tp.isActive && tp.originId && tp.destinationId) updateDistanceContext();
}, 200);
```

### 12.7 HTML — Travel Tab Panel

Inside `#tab-travel`:

```html
<div id="travel-empty" class="travel-empty">
  Select an origin and destination on the map to plan a journey.
</div>

<div id="travel-form" class="travel-form" style="display:none">

  <!-- Origin / Destination -->
  <div class="travel-section">
    <label>Origin</label>
    <div id="travel-origin" class="travel-body-tag">—</div>
  </div>
  <div class="travel-section">
    <label>Destination</label>
    <div id="travel-destination" class="travel-body-tag">—</div>
  </div>

  <!-- Sim playback controls (mirrored from Map tab) -->
  <div class="control-row">
    <button id="btn-travel-play">▶</button>
    <button id="btn-travel-pause" style="display:none">⏸</button>
    <button id="btn-travel-reverse">⏮</button>
    <select id="travel-speed-select">
      <option value="0.25">0.25×</option><option value="0.5">0.5×</option>
      <option value="1" selected>1×</option><option value="2">2×</option>
      <option value="5">5×</option><option value="10">10×</option>
      <option value="30">30×</option><option value="365">365×</option>
    </select>
  </div>
  <div class="control-row">
    <button id="btn-travel-step-minus-7">-7d</button>
    <button id="btn-travel-step-minus-1">-1d</button>
    <button id="btn-travel-step-plus-1">+1d</button>
    <button id="btn-travel-step-plus-7">+7d</button>
    <button id="btn-travel-reset">Reset</button>
  </div>

  <!-- ΔV -->
  <div class="travel-section">
    <label for="travel-delta-v">Spacecraft ΔV (km/s)</label>
    <input id="travel-delta-v" type="number" step="0.1" min="0" value="20" />
  </div>

  <!-- Departure date -->
  <div class="travel-section">
    <label>
      <input id="travel-use-sim-date" type="checkbox" checked />
      Use current simulation date
    </label>
    <input id="travel-departure-date" type="date" style="display:none" />
  </div>

  <div class="control-row">
    <button id="btn-calculate-transfer" style="width:100%">🚀 Calculate Transfer</button>
  </div>
  <div class="control-row">
    <button id="btn-clear-travel" style="width:100%">Clear Selection</button>
  </div>

  <!-- Live distance context (always shown when both selected) -->
  <div class="travel-results" style="display:flex">
    <div class="travel-result-row">
      <span class="travel-result-label">Current Dist:</span>
      <span id="res-current-dist" class="travel-result-value">—</span>
    </div>
    <div class="travel-result-row">
      <span class="travel-result-label">Closest:</span>
      <span id="res-min-dist" class="travel-result-value">—</span>
    </div>
    <div class="travel-result-row">
      <span class="travel-result-label">Farthest:</span>
      <span id="res-max-dist" class="travel-result-value">—</span>
    </div>
  </div>

  <!-- Transfer results (hidden until Calculate pressed) -->
  <div id="travel-results" class="travel-results" style="display:none">
    <div class="travel-result-row">
      <span class="travel-result-label">Escape Origin:</span>
      <span id="res-escape-origin" class="travel-result-value">—</span>
    </div>
    <div class="travel-result-row">
      <span class="travel-result-label">Capture Dest:</span>
      <span id="res-capture-dest" class="travel-result-value">—</span>
    </div>
    <div class="travel-result-row">
      <span class="travel-result-label">Excess ΔV:</span>
      <span id="res-excess-dv" class="travel-result-value">—</span>
    </div>
    <div class="travel-result-row divider"></div>
    <div class="travel-result-row">
      <span class="travel-result-label">Optimistic:</span>
      <span id="res-optimistic" class="travel-result-value">—</span>
    </div>
    <div class="travel-result-row">
      <span class="travel-result-label">Likely:</span>
      <span id="res-likely" class="travel-result-value">—</span>
    </div>
    <div class="travel-result-row">
      <span class="travel-result-label">Pessimistic:</span>
      <span id="res-pessimistic" class="travel-result-value">—</span>
    </div>
    <div class="travel-result-row divider"></div>
    <div class="travel-result-row">
      <span class="travel-result-label">Next Window:</span>
      <span id="res-next-window" class="travel-result-value">—</span>
    </div>
    <!-- Failure reason: shown in red when !isPossible -->
    <div id="res-failure-reason" class="travel-result-row"
         style="display:none; color:#ef4444; font-size:11px; line-height:1.4; margin-top:4px"></div>
  </div>

  <!-- Journey Timeline (shown after successful Calculate) -->
  <div id="travel-timeline-section" class="travel-timeline-section" style="display:none">
    <div class="travel-timeline-header">
      <span class="travel-result-label">Journey</span>
      <span id="travel-day-counter" class="travel-day-counter">Day 0</span>
    </div>
    <!-- Slider range set dynamically to plan.pessimisticArrivalDays -->
    <input id="travel-timeline-slider" type="range" min="0" max="100" step="1" value="0"
           class="travel-timeline-slider" />
    <!-- Colour bar: green=optimistic zone, yellow=likely, red=risky -->
    <div id="travel-timeline-zones" class="travel-timeline-zones"></div>
    <div class="control-row" style="justify-content:center; gap:4px; flex-wrap:wrap">
      <button id="btn-timeline-play"  title="Play journey">▶</button>
      <button id="btn-timeline-pause" title="Pause" style="display:none">⏸</button>
      <button id="btn-timeline-reset" title="Reset to launch">⏹</button>
      <button id="btn-timeline-loop"  title="Loop">↺</button>
      <button id="btn-pin-departure"  title="Pin current sim date as departure">📌 Pin</button>
      <button id="btn-jump-arrival"   title="Jump to optimistic arrival">🎯 Jump</button>
    </div>
  </div>

</div><!-- /travel-form -->
```

### 12.8 Timeline Zone Gradient

After a successful `buildTravelPlan`:

```typescript
const slider  = document.getElementById('travel-timeline-slider') as HTMLInputElement;
const zonesEl = document.getElementById('travel-timeline-zones');
slider.max = String(Math.round(plan.pessimisticArrivalDays));
slider.value = '0';

const opt  = (plan.optimisticArrivalDays  / plan.pessimisticArrivalDays) * 100;
const late = Math.max(opt + (100 - opt) * 0.7, opt);
if (zonesEl) {
  zonesEl.style.background =
    `linear-gradient(to right, #22c55e 0%, #22c55e ${opt}%,` +
    ` #eab308 ${opt}%, #eab308 ${late}%,` +
    ` #ef4444 ${late}%, #ef4444 100%)`;
}
document.getElementById('travel-timeline-section')!.style.display = 'flex';
```

Green = 0→optimistic (safe). Yellow = optimistic→70% of remainder (caution). Red = final 30% (risky/late).

### 12.9 tickTravelTimeline (called each frame from renderer)

```typescript
// src/travelPlanner.ts — exported
export function tickTravelTimeline(state: AppState, dt: number): void {
  const tp = state.travelPlanner;
  if (!tp || !tp.timeline.isPlaying || !tp.lastPlan?.isPossible) return;

  const plan = tp.lastPlan;
  const tl   = tp.timeline;

  tl.travelDayOffset += dt * tl.playbackSpeed * state.speed;

  if (tl.travelDayOffset >= plan.pessimisticArrivalDays) {
    if (tl.isLooping) {
      tl.travelDayOffset = 0;
    } else {
      tl.travelDayOffset = plan.pessimisticArrivalDays;
      tl.isPlaying = false;
      // Toggle play/pause buttons
    }
  }

  // Drive global sim date so all planets animate along the voyage
  const departure = tl.pinnedDepartureDayOffset ?? plan.departureDayOffset;
  state.simDayOffset = departure + tl.travelDayOffset;

  // Sync slider and counter
  const slider = document.getElementById('travel-timeline-slider') as HTMLInputElement | null;
  if (slider) slider.value = String(Math.round(tl.travelDayOffset));
  const counter = document.getElementById('travel-day-counter');
  if (counter) counter.textContent =
    `Day ${Math.round(tl.travelDayOffset)} / ${Math.round(plan.pessimisticArrivalDays)}`;
}
```

**In `renderer.ts` RAF loop** (inside the try/catch, before `draw()`):
```typescript
tickTravelTimeline(state, dt);
```

### 12.10 Canvas Overlays — drawTravelPlannerOverlays

Called last in `draw()`. Only when `tp.isActive`. Draws in this order (each layer on top of the previous):

#### A. Passive SOI rings (all planet-class bodies)

When travel planner is active, every body that is not a star or moon gets a faint white dashed circle showing its Hill sphere radius. This gives each orbit ring a visible gravitational domain.

```
For each body where type ∉ {'star-primary','star-companion','moon'}
  AND body is not the current originId or destinationId:

  hillAU = hillSphereAU(body.mass, starMassSolar, body.distanceAU, body.type)
  localScale = 80 / ((body.distanceAU + 1) * Math.LN10)
  hillPx = hillAU * localScale * camera.zoom

  Skip if hillPx < body.radiusPx * camera.zoom * 1.3  (too small to be meaningful)

  strokeStyle: rgba(255,255,255,0.13)
  lineWidth: 0.7
  setLineDash([2,5])
  globalAlpha: 0.6
  arc(frame.x, frame.y, hillPx, 0, 2π)
```

`hillSphereAU` is defined in `travelPhysics.ts` (see §12.11).

#### B. Selection rings — Hill sphere scaled

Origin ring (green `#4ade80`) and destination ring (orange `#fb923c`). Ring radius is the Hill sphere screen radius when that is > 1.5× the body's visual radius; otherwise uses a fixed minimum.

```
hillAU   = hillSphereAU(body.mass, starMassSolar, body.distanceAU, body.type)
localScale = 80 / ((body.distanceAU + 1) * Math.LN10)
hillPx   = hillAU * localScale * camera.zoom
visualR  = body.radiusPx * camera.zoom
fixedR   = max(visualR + 6, 14)

r = hillPx > visualR * 1.5 ? hillPx : fixedR

strokeStyle: color, lineWidth 1.5, setLineDash([5,4]), globalAlpha 0.85
arc(frame.x, frame.y, r, 0, 2π)

If Hill sphere is active (hillPx > visualR * 1.5):
  fillStyle: color, globalAlpha 0.04, solid fill of same arc
```

Stars and moons return `hillPx = 0` from `hillSphereAU` and always use `fixedR`.

#### C. Transfer chord — FIXED spatial endpoints

The chord endpoints are **frozen in time** at departure and estimated arrival. The bodies continue orbiting; the chord does not move.

**`screenPosAtTime(bodyId, dayOffset)`** — helper inside `drawTravelPlannerOverlays`:
```
for L1 bodies (no parentId):
  angle  = body.angle + 2π * dayOffset / body.periodDays
  distPx = logScaleDistance(body.distanceAU, 80) * camera.zoom
  return { x: starOriginX + cos(angle)*distPx, y: starOriginY + sin(angle)*distPx }

for moons: recursive parent lookup (same clamped moon-distance formula as computeBodyFrames)
```

Chord endpoints:
```
departureDay = tl.pinnedDepartureDayOffset ?? plan.departureDayOffset
arrivalDay   = departureDay + plan.pessimisticArrivalDays

departurePos = screenPosAtTime(tp.originId, departureDay)
arrivalPos   = screenPosAtTime(tp.destinationId, arrivalDay)
```

Drawn only when `plan.isPossible`:
```
progress = clamp(tl.travelDayOffset / plan.pessimisticArrivalDays, 0, 1)
mx = departurePos.x + (arrivalPos.x - departurePos.x) * progress
my = departurePos.y + (arrivalPos.y - departurePos.y) * progress

Travelled segment (departurePos → split):
  solid, rgba(96,165,250,0.75), lineWidth 1.5

Remaining segment (split → arrivalPos):
  dashed [5,5], rgba(96,165,250,0.25), lineWidth 1.5

Arrival marker cross at arrivalPos:
  5px horizontal + 5px vertical lines, rgba(251,146,60,0.6), lineWidth 1
```

#### D. Spacecraft chevron at split point

```
angle = atan2(arrivalPos.y - departurePos.y, arrivalPos.x - departurePos.x)
fillStyle: rgba(251,146,60,0.9)
Triangle: tip = (mx + cos(angle)*6, my + sin(angle)*6)
          wing1 = (mx + cos(angle+2.5)*4, my + sin(angle+2.5)*4)
          wing2 = (mx + cos(angle-2.5)*4, my + sin(angle-2.5)*4)
```

#### E. Distance line (no plan or impossible)

```
Line from origin CURRENT pos → destination CURRENT pos
rgba(255,255,255,0.35), dashed [6,6], lineWidth 1
Midpoint label: "{X.XX} AU", font 10px, rgba(255,255,255,0.6), centred +14px below midpoint
```

#### F. Failure reason on canvas (when `plan.failureReason` exists)

```
plan.failureReason text
font 10px system-ui, rgba(251,146,60,0.85), centred +28px below distance midpoint
```

### 12.11 Physics — travelPhysics.ts

```typescript
export function estimateRadiusKm(massEM: number, type: BodyType): number
// gas-*: R ∝ M^0.5, cap at 13 Jupiter radii (90,000 km)
// dwarf: R ∝ M^0.25
// terrestrial/ice/moon: R ∝ M^0.28, using Earth radius 6371 km as reference

export function calculateEscapeVelocityKms(massEM: number, radiusKm: number): number
// v_esc = sqrt(2GM/R), result in km/s, rounded to 2dp

export function getBodyPositionAU(body, dayOffset, allBodies): Point
// L1 bodies: x = cos(angle + 2π*dayOffset/period) * distanceAU
//            y = sin(angle + 2π*dayOffset/period) * distanceAU
// Moons: parent position + moon offset

export function calculateSynodicPeriodDays(p1, p2): number
// 1/|1/p1 - 1/p2|; if one is 0 → return the other

export function computeMinMaxDistanceAU(origin, destination, allBodies): {min, max}
// Scan one synodic period (max 10 years) in 1-day steps

export function findNextWindowDayOffset(origin, dest, afterDay, allBodies): number
// Scan one synodic period (max 10 years) for minimum separation = best launch window

export function findArrivalWindow(origin, dest, departureDayOffset, excessVKms, allBodies, maxSearchDays=3650): ArrivalWindow | null
// Goal-seek: find first day where reachable range >= current separation
// pathFactor = 1 + 0.3 * sin(angularSeparation/2)  — pessimistic correction

export function buildTravelPlan(origin, dest, deltaVBudgetKms, departureDayOffset, allBodies, starMassSolar?): TravelPlan
// Orchestrates all calculations. Sets failureReason when:
//   - deltaVBudgetKms < escapeOriginKms
//   - deltaVBudgetKms < escapeOriginKms + captureDestKms
//   - HRS/SOI traversal cost exhausts remaining budget (see below)
//   - no arrival window found within maxSearchDays

export function hillSphereAU(bodyMassEM: number, starMassSolar: number, distanceAU: number, bodyType: BodyType): number
// Hill sphere radius in AU: distanceAU * cbrt(bodyMassEM / (3 * starMassSolar * 332946))
// Returns 0 for star-* and moon types, and when distanceAU <= 0.

export function calculateHrsTraversalCostKms(
  origin: SceneBody, destination: SceneBody,
  departureDayOffset: number, allBodies: SceneBody[], starMassSolar: number
): { hrsCostKms: number; bodiesEncountered: string[] }
// Samples the straight-line chord from origin→destination at ~0.02 AU resolution.
// For each non-star, non-origin, non-destination body whose Hill sphere the chord
// crosses, adds that body's escape velocity to the total cost.
// Used by buildTravelPlan to compute total ΔV cost before checking excess budget.
```

### 12.12 Mobile — Panel Collapse Covers Travel Tab

The travel planner lives inside the main `#controls` panel, which is collapsible. On mobile (≤768px), the panel starts collapsed (map fully visible). User taps `#btn-expand-panel` FAB to open it, switches to Travel tab, selects bodies, then taps `#btn-collapse-panel` to collapse and observe the canvas overlays (selection rings, spacecraft, chord) while the map is fully visible.

**No dedicated travel FAB is needed** — the main panel FAB (`#btn-expand-panel`) is sufficient. The canvas overlays remain visible even when the panel is collapsed.

`tp.isActive` must remain `true` after panel collapse if the Travel tab was last active. Set `tp.isActive = false` only when the user explicitly switches to a non-travel tab.

---

## 13. System Editor

File: `src/editor.ts`.

```typescript
export function initEditor(state, onUpdate: (system, gmNotes) => void): void
export function setEditorSystem(system: MWGStarSystem | null, gmNotes: string): void
```

### 13.1 On System Load
`setEditorSystem(system, gmNotes)`:
- If system null → hide `#editor-form`, show `#editor-empty`
- Else → show `#editor-form`, hide `#editor-empty`
- Populate:
  - `#edit-name` ← `system.key || system.id || ''`
  - `#edit-star-class` ← `system.primaryStar.class`
  - `#edit-star-grade` ← `system.primaryStar.grade`
  - `#edit-world-type` ← `system.mainWorld?.type || 'Terrestrial'`
  - `#edit-gm-notes` ← gmNotes

### 13.2 On Edit
Any change triggers `onUpdate(system, gmNotes)` which:
- Updates `currentPayload.starSystem`
- Auto-saves to `localStorage['mneme-2dmap-${starId}']`

---

## 14. Save & Export

File: `src/savePage.ts`.

### 14.1 localStorage Key
`mneme-2dmap-${starId}` where `starId = system.key || system.id || generated-${seed}`.

### 14.2 Saved Page Format
```typescript
interface SavedStarPage {
  starId:    string;
  starName:  string;
  savedAt:   string;    // ISO timestamp
  payload:   MapPayload;
  mwgSystem?: MWGStarSystem;
  gmNotes:   string;
  version:   string;
}
```

### 14.3 Export Functions
```
savePage(canvas, payload, gmNotes, starId) — saves SavedStarPage to localStorage
loadSavedPage(starId) — reads from localStorage
saveInteractivePage(payload, gmNotes, starId) — fetches dist/standalone.html template,
    injects __MNEME_INITIAL_PAYLOAD__ and __MNEME_GM_NOTES__, triggers download
exportToCsv(system) — CSV with one row per body
exportToDocx(system) — HTML-as-.doc with system data table
```

### 14.4 Standalone Interactive HTML
The exported `.html` file injects at the bottom of `<body>`:
```html
<script>
window.__MNEME_INITIAL_PAYLOAD__ = { /* MapPayload JSON */ };
window.__MNEME_GM_NOTES__ = "...";
</script>
```
`main.ts` checks for `window.__MNEME_INITIAL_PAYLOAD__` before URL params on startup.

---

## 15. Embed Mode

Activated by `?embed=1` in URL. Used by MWG to embed the map in an iframe.

### 15.1 Chrome Hiding
```
#controls      → display: none
#btn-expand-panel → display: none
#version-watermark → display: none
#loading       → display: none
```

### 15.2 postMessage Protocol
Inbound (parent → iframe):
```json
{ "type": "mneme-load-system", "payload": { ...MapPayload... } }
```
Handler calls `loadSystemIntoState(state, event.data.payload)`.

Outbound (iframe → parent) after successful load:
```json
{ "type": "mneme-system-loaded", "starId": "..." }
```

---

## 16. URL Parameter Encoding

```typescript
// Encode MapPayload to URL-safe base64:
function encodePayload(payload: MapPayload): string {
  const json = JSON.stringify(payload);
  return btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g,
    (_, p1) => String.fromCharCode(parseInt(p1, 16))));
}

// Decode (in decodeMapPayload):
const json = decodeURIComponent(
  Array.from(atob(encoded))
    .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
    .join('')
);
return JSON.parse(json) as MapPayload;
```

---

## 17. Random System Generator

File: `src/generator.ts`. `generateRandomSystem(): MapPayload`.

Produces a realistic star system with:
- Random star class (weighted toward M/K), grade 0–9, calculated mass and luminosity
- 0–2 companion stars
- 0–3 circumstellar disks
- 2–14 planets: mix of dwarfs, terrestrials, ices, gas giants with increasing orbit spacing
- Conservative zone terrestrial selected as main world if present, else any terrestrial, else largest dwarf
- Returns `MapPayload` with epoch `{ year: 2300, month: 1, day: 1 }` and random 8-char seed

---

## 18. Batch Adapter

File: `src/batchAdapter.ts`. Converts MWG "batch system" format (used in test harness):

```typescript
export function batchToMapPayload(s: BatchSystem): MapPayload
export function encodePayload(payload: MapPayload): string
```

The batch format uses `massSOL` for star mass, Roman-string `gasClass`, and `au` (not `distanceAU`) for distances. All mapped to internal types.

---

## 19. PWA Configuration

```typescript
// vite.config.ts
VitePWA({
  registerType: 'prompt',          // user prompted before update (NOT autoUpdate)
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    // EXCLUDE version.json from precache so it's always fetched fresh:
    globIgnores: ['**/version.json'],
    runtimeCaching: [{
      urlPattern: /\/version\.json$/,
      handler: 'NetworkFirst',
    }],
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  },
  manifest: {
    name: 'Mneme System Map',
    short_name: 'Mneme Map',
    theme_color: '#03050a',
    background_color: '#03050a',
    display: 'standalone',
    scope: '/2d-star-system-map/',
    start_url: '/2d-star-system-map/',
  },
})
```

Build defines injected via `vite.config.ts`:
```
__APP_VERSION__       — from VERSION file
__APP_COMMIT__        — from `git rev-parse --short HEAD`
__APP_DATE__          — from `git log -1 --format=%ci`
__APP_FULL_VERSION__  — `${version} (${commit})`
```

---

## 20. Quality Requirements (from QA Items)

All of the following MUST be implemented and verified before release.

### QA-REG-01 — RAF loop cannot be killed by a frame exception
**Requirement**: `requestAnimationFrame(loop)` must be the FIRST statement in `loop()`, before any draw code. All draw code must be wrapped in `try/catch`.  
**Test**: Open DevTools console. Load a compact M8 or M9 system. Confirm no `[renderer] frame error:` is logged. Reload and load a second system — it must render.

### QA-REG-02 — Zone band gradient guards
**Requirement**: In `drawZoneBands`, use `== null` (not `=== null`) for `zone.max` check. Skip band if `outerR <= 0 || innerR >= outerR`.  
**Test**: Load the sample M8 binary system (zones: conservative 0.11–0.17 AU). Canvas must render without DOMException.

### QA-REG-03 — gasClass string normalisation
**Requirement**: `normalizeGasClass()` must be called on every gas world's `gasClass` before the type switch. Type must be `number | string` in both `StarSystem` type and internal types.  
**Test**: Load a system with `"gasClass": "V"` — gas giant must render as Gas V (grey, not yellow).

### QA-REG-04 — User feedback on paste failure
**Requirement**: Silent failures are not acceptable. If `parseSystemPaste` returns null but textarea is non-empty → `alert(...)`. If `buildSceneGraph` throws → `alert(error.message)`.  
**Test**: Paste `{"foo":"bar"}` → alert appears. Paste empty string → no alert.

### QA-REG-05 — Travel panel updates on click
**Requirement**: `document.addEventListener('travel-selection-changed', updatePanel)` must be registered inside `initTravelPlanner` before the final `updatePanel()` call.  
**Test**: Open Travel tab, click a planet → origin field updates immediately (within one frame, not 200ms).

### QA-REG-06 — Moon parent resolution
**Requirement**: `idMap` must be populated from body `id` fields (not sequential indices) so `moon.parentId` (UUID) resolves correctly.  
**Test**: Load the sample JSON — the moon at 0.00524 AU around the Gas V must appear orbiting the gas giant.

### QA-REG-07 — Camera fits companion star orbit
**Requirement**: `maxAU` for `resetCamera` must include companion star `distanceAU`. The sample system has a companion at 15 AU — all bodies should be visible at initial zoom.  
**Test**: Load sample JSON → companion star visible at edge of canvas; inner planets visible (small) near centre.

---

## 21. Sample World Acceptance Test

The following JSON MUST parse and render correctly. It is the canonical acceptance test for MWG world format compatibility:

**Key characteristics of this system:**
- M8 primary + M8 companion at 15 AU (binary system)
- Zones: infernal 0–0.06, hot 0.06–0.11, conservative 0.11–0.17, cold 0.17–0.69, outer 0.69–null
- 5 dwarf planets at 0.08–0.49 AU
- 1 circumstellar disk at 0.16 AU (conservative zone)
- 1 Gas V world at 0.7 AU (`gasClass: "V"` — string format)
- 1 moon orbiting the Gas V (`parentId` is UUID of gas world, `moonOrbitAU: 0.00524`)
- Main world: Dwarf type at 0.08 AU (matches dwarfPlanet at same distanceAU)
- `inhabitants` data present (populated: true, TL 9, population 29225) — ignored by renderer
- Companion star has extra fields `id`, `luminosity`, `color`, `isPrimary`, `orbits` — all ignored

**Expected render output:**
1. Two M-class stars visible (primary at centre, companion at log-scaled 15 AU orbit)
2. 5 dwarf planets in inner system (0.08–0.49 AU)
3. 1 disk at 0.16 AU (rendered as point cloud)
4. 1 Gas V (grey) at 0.7 AU
5. 1 moon orbiting the Gas V
6. Main world dwarf marked with `★ MAIN` label and gold stroke
7. Zone bands: red (infernal), orange (hot), green (conservative), blue (cold)
8. No DOMException in console

---

## 22. TypeScript Strictness

`tsconfig.json` must include:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

Use `catch` (bare) not `catch (error)` when the error variable is unused.  
Timer refs: `useRef<ReturnType<typeof setTimeout> | null>(null)` pattern where applicable.  
Build must pass `tsc -b` with zero errors before `vite build` runs.

---

## 23. File Structure

```
src/
  main.ts           — app entry: init, paste controls, embed mode, URL params
  types.ts          — all TypeScript interfaces (exported)
  renderer.ts       — canvas RAF loop, draw pipeline, zone bands
  camera.ts         — logScaleDistance, resetCamera, pan, zoomTo, coordinate transforms
  dataAdapter.ts    — buildSceneGraph(), normalizeGasClass(), body colour constants
  orbitMath.ts      — calculatePeriodDays, calculateMoonPeriodDays, hashToFloat, etc.
  travelPlanner.ts  — Travel Planner UI, findBodyAtScreenPos, handleTravelPlannerClick
  travelPhysics.ts  — buildTravelPlan, escape velocity, synodic period, arrival window
  input.ts          — mouse/touch/wheel event handlers
  uiControls.ts     — playback controls, seed controls, panel collapse
  editor.ts         — System Editor tab, setEditorSystem, tab switching
  savePage.ts       — localStorage, CSV/DOCX export, interactive HTML export
  generator.ts      — generateRandomSystem()
  batchAdapter.ts   — batch format conversion
  starfield.ts      — mulberry32, generateStarfield, generateNebula, draw*
  version.ts        — APP_VERSION, APP_FULL_VERSION from Vite injections
  testHarness.ts    — test.html logic (pagination, filtering, batch rendering)
  styles.css        — all CSS

public/
  standalone.html   — template for interactive HTML export (updated each build)

scripts/
  inline-build.js   — post-build: inlines CSS+JS into standalone.html

index.html          — main app entry
test.html           — test harness entry
VERSION             — semver string (e.g. "1.05")
vite.config.ts
tsconfig.json
package.json
```

---

## 24. Version Tracking

- `VERSION` file contains semver (e.g. `1.06`)
- `public/version.json` generated by prebuild script: `{ "version": "...", "buildTimestamp": "..." }`
- Displayed in `#version-display` and `#version-watermark`
- PWA update: `registerType: 'prompt'` — user sees "Update available" notification, must confirm before SW swap

---

## 25. Travel Planner — Mobile Accessibility Note

> **This section supersedes any floating-panel design previously described here.**
> The reference implementation is `/Mneme-CE-World-Generator` — its Travel Planner tab inside the collapsible `#controls` panel is the authoritative UX pattern.

The main control panel already has a collapse FAB (`#btn-expand-panel`). When the user collapses `#controls`, the map fills the full screen. The travel planner lives inside the `#tab-travel` pane — **no separate floating journey panel is required**. See §12.12 for the complete mobile UX requirement.

### 25.1 Summary of Mobile Requirements (from §12.12)

- The collapse FAB (`#btn-expand-panel`) must be reachable on all screen sizes — position `fixed`, `z-index: 150`, bottom-left.
- When `#controls` is collapsed, only the FAB is visible and the canvas is fully interactive (pan, zoom, travel clicks all work).
- `tp.isActive` is set by reading the active tab, not by a separate floating panel state.
- No `#journey-panel`, no `#btn-journey` FAB, no `initJourneyPanel()` function.

### 25.2 Touch Hit Radius

On touch devices the hit radius must be comfortable. In `findBodyAtScreenPos`:

```typescript
// Use body.radiusPx (base, not zoom-scaled) as the minimum hit size.
// 18px is sufficient for mouse; for touch targets the panel tap-to-select
// flow already constrains users to deliberate taps rather than fat-finger drags.
const HIT_RADIUS_PX = 18;  // base pixels — NOT multiplied by zoom
const hitR = Math.max(body.radiusPx, HIT_RADIUS_PX);
if (dist < hitR && dist < nearestDist) { ... }
```

Iterate in **reverse** render order (last-drawn body wins when circles overlap).

### 25.3 Cursor Feedback (Desktop)

When `tp.isActive` and the pointer is over a hittable body, set `canvas.style.cursor = 'pointer'`. This is wired in the `mousemove` handler in `src/input.ts` alongside the existing pan logic.

---

## 26. Implemented — Hill Sphere SOI Rings

Hill sphere rings **are implemented** as of the current build. This section supersedes the earlier "Removed" notice.

### 26.1 hillSphereAU() — travelPhysics.ts

```typescript
const SOLAR_TO_EM = 332946;

export function hillSphereAU(
  bodyMassEM: number,
  starMassSolar: number,
  distanceAU: number,
  bodyType: BodyType
): number {
  if (bodyType.startsWith('star') || bodyType === 'moon' || distanceAU <= 0) return 0;
  const massRatio = bodyMassEM / (3 * starMassSolar * SOLAR_TO_EM);
  return distanceAU * Math.cbrt(massRatio);
}
```

The Hill sphere (Roche limit approximation) gives the radius in AU within which a body gravitationally dominates over the primary star. Stars and moons return 0 — they are excluded from SOI ring display.

### 26.2 Log-scale local derivative for AU→px conversion

The 2D map uses `logScaleDistance(au) = log10(au+1) * 80`. The AU-to-pixel conversion rate at a given orbital distance is the derivative:

```
localScale = 80 / ((distanceAU + 1) * Math.LN10)
hillScreenPx = hillSphereAU(body) * localScale * camera.zoom
```

This gives the correct screen-space radius for the Hill sphere at the body's position without needing to re-project via the full log-scale formula.

### 26.3 Passive rings (all planet bodies when travel planner active)

See §12.10-A. All non-star, non-moon bodies get a faint passive SOI ring when the travel planner tab is open. Skip condition: `hillPx < body.radiusPx * camera.zoom * 1.3` (below this threshold the ring would be indistinguishable from the body dot).

### 26.4 Selection rings (origin and destination)

See §12.10-B. The Hill sphere radius is compared against 1.5× the body's visual radius. If the Hill sphere is larger, it drives the ring radius and gets a faint colour fill. Otherwise the fixed minimum (`visualR + 6`, floor 14px) is used. This ensures even tiny dwarfs have a visible selection ring.

### 26.5 No `state.starMassSolar` field required

`starMassSolar` is looked up on demand inside `drawTravelPlannerOverlays` with:
```typescript
const starMassSolar = state.bodies.find(b => b.type === 'star-primary')?.mass ?? 1;
```
No extra field on `AppState` is needed.

---

## 27. Removed — Two-Phase Touch Detection

A two-phase pointer/touch selection algorithm was previously specified here. The MWG reference uses a single-pass `findBodyAtScreenPos` with `Math.max(body.radiusPx, 8)` as the minimum hit radius. Implement that pattern (§12.2) and do not add an `isTouch` parameter to `handleTravelPlannerClick`.

---

## 28. Hill Sphere / SOI Traversal Cost

### 29.1 Rationale

When a spacecraft travels on a transfer trajectory between two bodies, the straight-line chord may pass through the Hill Sphere (or Sphere of Influence) of intermediate bodies. Passing through another body's gravity well requires additional delta-V to escape it. This cost must be accounted for in the Travel Planner's feasibility calculation.

### 29.2 Algorithm

**`calculateHrsTraversalCostKms(origin, destination, departureDayOffset, allBodies, starMassSolar)`**

1. Compute origin and destination positions in AU-space at `departureDayOffset`.
2. Build the straight-line chord from origin → destination.
3. Sample the chord at ~0.02 AU resolution (minimum 20 samples).
4. For each non-star body **B** (excluding origin and destination):
   a. Compute B's Hill sphere radius: `hillSphereAU(B.mass, starMassSolar, B.distanceAU, B.type)`
   b. Compute B's position at `departureDayOffset`.
   c. Find the minimum distance from B's center to any sample point on the chord.
   d. If `minDist <= hillSphereAU`, the chord intersects B's HRS.
   e. Add `calculateEscapeVelocityKms(B.mass, estimateRadiusKm(B.mass, B.type))` to the total cost.
   f. Record B's label in `bodiesEncountered`.
5. Return `{ hrsCostKms, bodiesEncountered }`.

### 29.3 Integration into `buildTravelPlan`

```typescript
const { hrsCostKms, bodiesEncountered } = calculateHrsTraversalCostKms(
  origin, destination, departureDayOffset, allBodies, starMassSolar
);

const totalCostKms = escapeOriginKms + captureDestKms + hrsCostKms;
const excessDeltaVKms = deltaVBudgetKms - totalCostKms;
```

**Failure reasons** (displayed in `#res-failure-reason`):
- `deltaVBudgetKms < escapeOriginKms`: "Insufficient ΔV to escape [origin] (X km/s required)."
- `deltaVBudgetKms < escapeOriginKms + captureDestKms`: "Insufficient ΔV to capture at [destination] (X km/s required)."
- `excessDeltaVKms <= 0` due to HRS cost: "HRS/SOI traversal cost (X km/s) exceeds remaining budget. Encountered: [body labels]."
- No arrival window found: "Transfer window not found within search horizon (10 years)."

### 29.4 UI Display

When `hrsCostKms > 0`, add a result row inside `#travel-results`:
- **Label**: "HRS Traversal:"
- **Value**: `${hrsCostKms} km/s` (with `bodiesEncountered` as tooltip or sub-label)

Also update the **Excess ΔV** row to reflect the post-HRS excess.

### 29.5 Performance Note

For systems with many bodies, the chord sampling can be expensive. Early-exit the inner loop as soon as a sample point falls within the Hill sphere — no need to test remaining samples for that body.

---

## 29. QA Items — Travel Planner

### QA-TP-01 — Map fully usable with controls collapsed
**Requirement**: When `#controls` is collapsed (only the FAB visible), the canvas accepts pan, zoom, and travel-planner click events normally. Travel tab selection state (`tp.isActive`, `tp.originId`, `tp.destinationId`) is preserved across panel collapse/expand cycles.  
**Test**: Open Travel tab, select origin, collapse panel, click a planet on canvas — the click is consumed by `handleTravelPlannerClick`; re-expand panel and destination is populated.

### QA-TP-02 — Canvas overlays visible regardless of panel state
**Requirement**: Selection rings (green/orange), transfer chord, spacecraft chevron, distance line, and failure text are drawn every frame as long as `tp.isActive` is true — even when `#controls` is collapsed.  
**Test**: Select origin + destination, calculate transfer, collapse panel — transfer chord and rings remain on canvas.

### QA-TP-03 — Reverse-order hit detection
**Requirement**: `findBodyAtScreenPos` iterates bodies in reverse render order. When two body circles overlap on screen, clicking the visually topmost (last-drawn) body selects it.  
**Test**: At high zoom, if disk and dwarf overlap, click the foreground circle — correct body is selected, not the background one.

### QA-TP-04 — Cursor feedback on desktop
**Requirement**: When `tp.isActive` is true and the mouse pointer is within the hit radius of any body, `canvas.style.cursor = 'pointer'`. Otherwise `cursor = 'default'` (or `'grab'`/`'grabbing'` when panning).  
**Test**: Activate travel tab on desktop, hover over a gas giant — cursor changes to pointer hand. Move off body — cursor reverts.

### QA-TP-05 — Timeline playback syncs sim clock
**Requirement**: When the travel timeline is playing (`tp.timeline.isPlaying = true`), `tickTravelTimeline` advances `tp.timeline.travelDayOffset` each frame and writes to `state.simDayOffset`. The main date display updates in sync.  
**Test**: Select origin + destination, calculate, start timeline — watch the date counter advance and the spacecraft chevron move along the chord.

### QA-TP-06 — Empty-space click clears selection
**Requirement**: Clicking on empty canvas space (no body within hit radius) while the travel planner is active clears `tp.originId`, `tp.destinationId`, and `tp.lastPlan`. The travel results section hides and the panel reverts to the "select origin" empty state.  
**Test**: Select two bodies, click empty space — both selections cleared; calculate button disabled; results hidden.

### QA-TP-07 — Hill sphere selection ring scales with body mass
**Requirement**: When a Gas V (large mass) is selected as origin, the green dashed ring radius must be noticeably larger than when a dwarf planet (tiny mass) is selected. For bodies where `hillPx < visualR * 1.5`, the ring falls back to `visualR + 6` minimum.  
**Test**: Select a gas giant → large green ring. Deselect, select a dwarf → smaller ring (fixed minimum). Sizes must visually differ.

### QA-TP-08 — Passive SOI rings appear for planet bodies
**Requirement**: When the Travel tab is active, all non-star non-moon non-selected bodies with a meaningful Hill sphere (`hillPx ≥ body.radiusPx * camera.zoom * 1.3`) show a faint white dashed SOI circle. Rings disappear when the travel tab is deactivated.  
**Test**: Open Travel tab — faint dashed rings visible around gas giants and larger dwarfs. Switch to System Editor tab — rings disappear immediately.

### QA-TP-09 — Chord endpoints are fixed in space
**Requirement**: After Calculate Transfer, the blue chord goes from origin's departure-time position to destination's arrival-time position. As the timeline plays and bodies orbit, the chord endpoints do NOT move — only the spacecraft chevron slides along the fixed chord.  
**Test**: Calculate a plan. Start timeline. Pan the camera — chord holds its position relative to the star. Observe bodies drifting off chord endpoints as time advances.

### QA-TP-10 — Arrival marker at destination's future position
**Requirement**: A small orange cross is drawn at `screenPosAtTime(destinationId, departureDay + pessimisticArrivalDays)`. This is distinct from the destination body's current animated position.  
**Test**: Set a long-duration transfer (months). Advance time midway — the destination body has moved away from the orange cross marker. The cross stays at the predicted arrival point.

---

## 30. Planned — SOI-Safe Routing (FRD-048)

**Status:** 📋 Planned — not yet implemented.  
**Isolation guarantee:** Zero changes to existing files except one button insertion in `src/uiControls.ts` and additive-only type additions to `src/types.ts`. The entire feature tree hangs off those two hooks and lives in three new files. Revert by deleting those files and the one button — the renderer is unaware of it.

### 29.1 Overview

Extends the existing Hohmann-transfer travel planner with a **SOI-Safe routing mode** that detects when the straight-line chord crosses another body's sphere of influence, and offers two resolutions: a **detour arc** (adds AU, departs now) or a **wait for clear window** (waits N days for bodies to rotate clear).

The existing `buildTravelPlan` and the HRS traversal cost already compute Hill-sphere crossings. This feature adds the UI affordances and the detour/wait math as a distinct, independently testable layer.

### 29.2 New files

| File | Purpose |
|------|---------|
| `src/travelCalc.ts` | Brachistochrone math, body geometry, `TravelBody` types. Pure math — no DOM. |
| `src/soiChecker.ts` | Laplace SOI radius, line-circle intersection, detour approximation, clear-window search. No renderer coupling. |
| `src/travelPanel.ts` | DOM panel, routing-mode toggle, result display. Delegates entirely to the above two files. |

### 29.3 SOI radius formula

The Laplace SOI (used for transit, not for orbital placement) is distinct from the Hill sphere:

```typescript
// r_SOI = a × (m_planet / M_star)^(2/5)
export function soiRadiusAU(orbitalAU: number, planetEM: number, starEM: number): number {
  return orbitalAU * Math.pow(planetEM / starEM, 2 / 5);
}
```

The Hill sphere (`hillSphereAU` in §26.1) uses `cbrt` and the factor `1/3`; Laplace SOI uses the `2/5` exponent and no factor. For display the Hill sphere is used (§26); for routing the Laplace SOI is used here.

### 29.4 Line-circle intersection

```typescript
// Returns chord length (AU) if segment A→B crosses a circle at C with radius r.
// Returns 0 if no intersection or intersection outside the segment.
export function chordThroughCircle(ax,ay,bx,by,cx,cy,r): number
```

Standard parametric line-circle test. The two intersection parameters `t1`, `t2` must both lie in `[0,1]` (the segment); clamp-and-compare to handle partial intersections.

Detour approximation:
```typescript
// Conservative tangent-arc bypass estimate:
// detour ≈ 2√(halfChord² + r²) − chord
export function detourAroundCircle(chordAU: number, soiRadiusAU: number): number
```

### 29.5 Clear-window search

```typescript
// Advances all body angles in 0.5-day steps using Kepler's third law.
// Returns first departure offset where chord has no SOI intersections,
// or null if none found within maxSearchDays (default 365).
export function findClearDepartureWindow(
  origin, destination, obstacles, starEM, starMassSun,
  maxSearchDays?, stepDays?
): { waitDays: number; positionsAtDeparture: TravelBody[] } | null
```

`orbitalPeriodDays` (already in `src/orbitMath.ts`) is the only read-only import from an existing file.

### 29.6 Panel layout

```
┌─────────────────────────────────────────┐
│ ⏱ Travel Calculator              [✕]   │
├─────────────────────────────────────────┤
│ From: [dropdown]   To: [dropdown]       │
│ Accel: [____] G                         │
│ Routing: ○ Direct   ● SOI-Safe          │
├─────────────────────────────────────────┤
│ Distance:    2.31 AU                    │
│ Flight time: 4.2 days                   │
│ ─── SOI INTERSECTIONS ─────────────────│
│ ⚠ Jupiter  +0.08 AU  +0.6 days         │
│ ─── DETOUR ────────────────────────────│
│ Path: 2.39 AU   Total: 4.8d  [Detour]  │
│ ─── WAIT ──────────────────────────────│
│ Wait 18.5d → clear  Total: 22.6d [Wait]│
└─────────────────────────────────────────┘
```

- SOI / Detour / Wait sections hidden entirely in Direct mode (not just empty).
- Recalculate fires on any input change — no submit button.
- "Use Detour" / "Use Wait" are v1 copy-to-clipboard affordances. Canvas path overlay deferred to v1.1.
- Panel state held in module-level variables inside `travelPanel.ts` — no localStorage, no renderer state.

### 29.7 Entry point (only touch to existing files)

```typescript
// In src/uiControls.ts — single insertion, no edits to existing logic:
const travelBtn = document.createElement('button');
travelBtn.id = 'travel-calc-btn';
travelBtn.textContent = '⏱ Travel Calc';
travelBtn.addEventListener('click', () => openTravelPanel(currentSceneBodies, starMassSolar));
controlsContainer.appendChild(travelBtn);
```

### 29.8 Additive types (src/types.ts)

```typescript
// Additive only — no existing type changed:
export interface TravelBody { id, label, distanceAU, angleRad, massEM, hillRadiusAU }
export interface TravelInput { origin, destination, accelG, routingMode, departureOffsetDays }
export interface TravelResult { routingMode, departureOffsetDays, pathDistanceAU,
  flightTimeDays, totalTimeDays, soiIntersections, detourAddedAU, waitAlternative? }
export interface SoiHit { bodyId, bodyLabel, soiRadiusAU, chordAU, detourAddedAU }
export interface WaitResult { waitDays, pathDistanceAU, flightTimeDays, totalTimeDays, clearAtDeparture }
```

### 29.9 Acceptance criteria

- [ ] Existing `?system=` rendering is byte-identical before/after merge (RAF unaffected).
- [ ] Direct mode: `t = 2√(d/(2a))` matches formula within 1% for a known distance.
- [ ] SOI-Safe: path crossing 5 AU between two inner bodies reports non-zero intersection against a Jupiter-analogue placed there.
- [ ] Wait option: returns `waitDays > 0` and `clearAtDeparture: true` within 365-day horizon for the above case.
- [ ] All three new files compile with zero TypeScript errors.

---

*End of FRD-060.*
