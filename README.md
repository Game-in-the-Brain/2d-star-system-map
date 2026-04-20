# 2D Star System Map

Standalone 2D animated star system map for the Mneme CE World Generator.

**Live URL:** `https://game-in-the-brain.github.io/2d-star-system-map/`

---

## Quick Start — Get Test Data from MWG

The map accepts a Base64-encoded `StarSystem` payload via the `?system=` query parameter. The easiest way to generate test data is straight from the MWG browser console.

### Step 1: Generate a system in MWG
Open [Mneme CE World Generator](https://game-in-the-brain.github.io/Mneme-CE-World-Generator/), click **Generate System**, then open DevTools → Console.

### Step 2: Run this snippet
```javascript
const system = JSON.parse(localStorage.getItem('mneme_current_system'));
const payload = {
  starSystem: system,
  starfieldSeed: Math.random().toString(36).substring(2, 10).toUpperCase(),
  epoch: { year: 2300, month: 1, day: 1 }
};
const json = JSON.stringify(payload);
const encoded = btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
const url = `https://game-in-the-brain.github.io/2d-star-system-map/?system=${encoded}`;
console.log(url);
window.open(url, '_blank');
```

This will:
1. Read the currently generated system from MWG `localStorage`
2. Wrap it with a random `starfieldSeed` and default epoch
3. Encode it as a Unicode-safe Base64 string
4. Print the full map URL to the console
5. Open the map in a new tab automatically

---

## Development

```bash
npm install
npm run dev
npm run build
```

The app is a plain Vite + TypeScript project with no React dependencies.

---

## Architecture

- **`src/main.ts`** — Bootstrap, payload decode, canvas init
- **`src/dataAdapter.ts`** — `StarSystem` → `SceneBody` mapper
- **`src/renderer.ts`** — Canvas RAF render loop
- **`src/camera.ts`** — Pan/zoom transforms
- **`src/input.ts`** — Mouse drag, wheel zoom, touch pinch/pan
- **`src/orbitMath.ts`** — Kepler period, angle offsets, orbital velocity
- **`src/starfield.ts`** — Mulberry32 PRNG, procedural background
- **`src/uiControls.ts`** — Play/pause, speed, step buttons, seed controls
- **`src/travelPhysics.ts`** — Escape velocity, transfer time calculator (FRD-048)
- **`src/travelPlanner.ts`** — Travel Planner UI & canvas selection mode (FRD-048)
- **`src/travelRenderer.ts`** — Trajectory arc & ship animation overlay (FRD-048)
