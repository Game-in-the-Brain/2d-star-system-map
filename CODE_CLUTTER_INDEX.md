# Code Clutter Index — 2D Star System Map

> Inventory of duplication, scattered logic, magic numbers, and organizational debt.
> Nothing deleted — only indexed for future consolidation.

---

## 1. Duplicated Logic

### 1.1 Planet Screen-Position Calculation (×4)

**What:** Every file that needs a body's screen position re-implements the same `angle → cos/sin → distPx → x/y` pipeline.

| Location | Lines | Notes |
|----------|-------|-------|
| `src/renderer.ts:273-276` | `computeBodyFrames` first pass | L1 bodies, uses `originX, originY, zoom` |
| `src/renderer.ts:413-414` | `screenPosAtTime` (inside `drawTravelPlannerOverlays`) | L1 bodies, uses `starOriginX, starOriginY, camera.zoom` |
| `src/travelPlanner.ts:91-94` | `getBodyScreenPos` | L1 bodies, uses `originX, originY, camera.zoom` |
| `src/gravityAssistDraw.ts:329-332` | `bodyScreenPosAt` | L1 bodies, uses `originX, originY, camera.zoom` |

**Formula (all four):**
```ts
const angle = body.angle + (body.periodDays > 0 ? (2 * Math.PI * dayOffset) / body.periodDays : 0);
const distPx = body.distanceAU > 0 ? logScaleDistance(body.distanceAU, 80) * zoom : 0;
return { x: originX + Math.cos(angle) * distPx, y: originY + Math.sin(angle) * distPx };
```

**Suggested consolidation:** Extract to `src/positioning.ts`:
```ts
export function bodyScreenPosition(body: SceneBody, dayOffset: number, originX: number, originY: number, zoom: number): Point
```

---

### 1.2 Moon Orbit Distance Cap (×3)

**What:** The logic that clamps moon visual orbit distance so it doesn't overflow its parent's gap is duplicated with slight variations.

| Location | Lines | Difference from canonical |
|----------|-------|---------------------------|
| `src/renderer.ts:301-315` | `computeBodyFrames` second pass | Full implementation with sorted L1 distances |
| `src/renderer.ts:421-434` | `screenPosAtTime` moon branch | Rebuilds sorted L1 array on every call |
| `src/travelPlanner.ts:106-108` | `getBodyScreenPos` moon branch | Simplified: only `parentDistPx * 0.25`, no gap calculation |

**Formula (canonical):**
```ts
const rawMoonDist = body.moonOrbitAU ? body.moonOrbitAU * 200 * zoom : 0;
const maxMoonDist = Math.min(parentDistPx * 0.25, gapPx * 0.38);
const moonDistPx = Math.max(4, Math.min(maxMoonDist, rawMoonDist));
```

**Risk:** `travelPlanner.ts` uses a simpler cap (`parentDistPx * 0.25` only). Moons in hit-testing may have different positions than moons on screen.

**Suggested consolidation:** Extract to `src/positioning.ts`:
```ts
export function moonOrbitPx(moonOrbitAU: number, parentDistPx: number, gapPx: number, zoom: number): number
```

---

### 1.3 Body Radius Estimation (×3)

**What:** Three functions estimate planetary radius from mass, with different signatures and slightly different formulas.

| Location | Function | Gas giant formula | Dwarf formula | Rocky formula |
|----------|----------|-------------------|---------------|---------------|
| `src/travelPhysics.ts:31-43` | `estimateRadiusKm` | `EARTH_RADIUS_KM * min(mass^0.5, 13*11.2)` | `EARTH_RADIUS_KM * max(mass,0.01)^0.25` | `EARTH_RADIUS_KM * max(mass,0.01)^0.28` |
| `src/gravityAssistPhysics.ts:338-348` | `estimateBodyRadiusKm` | `EARTH_RADIUS_KM * mass^0.5` | `EARTH_RADIUS_KM * mass^0.25` | `EARTH_RADIUS_KM * mass^0.28` |
| `src/patchedConic.ts:366-375` | `estimateBodyRadiusKm` | `EARTH_RADIUS_KM * mass^0.5` | `EARTH_RADIUS_KM * mass^0.25` | `EARTH_RADIUS_KM * mass^0.28` |

**Differences:**
- `travelPhysics.ts` clamps gas giants at brown-dwarf limit and uses `max(mass, 0.01)` for dwarfs/rocky.
- `gravityAssistPhysics.ts` and `patchedConic.ts` are identical to each other but lack the safety clamps.

**Suggested consolidation:** Move the clamped version (`travelPhysics.ts`) to `src/physicsConstants.ts` and have all consumers import it. Delete the two private copies.

---

### 1.4 Circular Orbital Velocity (×2)

**What:** Two implementations of circular orbital velocity exist.

| Location | Function | Used by |
|----------|----------|---------|
| `src/gravityAssistPhysics.ts:116-125` | `circularOrbitalVelocityKms` | `bodyHeliocentricVelocityKms`, `patchedConic.ts` |
| `src/orbitMath.ts:59-77` | `calculateOrbitalVelocityKms` | `dataAdapter.ts` for scene body velocity |

**Difference:** `gravityAssistPhysics.ts` version uses full `G * M * EM_TO_KG` calculation. `orbitMath.ts` version uses `sqrt(G*M/r)` with different unit conversions. They should produce the same result but via different code paths.

---

## 2. Scattered Physical Constants

### 2.1 Constants Defined in Multiple Files

| Constant | Value | Files where defined |
|----------|-------|---------------------|
| `AU_TO_M` | `1.496e11` | `gravityAssistPhysics.ts`, `orbitMath.ts`, `patchedConic.ts`, `travelCalc.ts`, `travelPhysics.ts` |
| `SOLAR_TO_EM` | `332946` | `gravityAssistPhysics.ts`, `patchedConic.ts`, `soiChecker.ts`, `travelCalc.ts`, `travelPanel.ts`, `travelPhysics.ts` |
| `DAY_TO_S` | `86400` | `patchedConic.ts`, `travelCalc.ts`, `travelPanel.ts` |
| `EM_TO_KG` | `5.972e24` | `gravityAssistPhysics.ts`, `orbitMath.ts`, `travelPhysics.ts` |
| `EARTH_RADIUS_KM` | `6371` | `gravityAssistPhysics.ts`, `patchedConic.ts`, `travelPhysics.ts` |
| `G` | `6.674e-11` | `gravityAssistPhysics.ts`, `orbitMath.ts`, `patchedConic.ts` |
| `AU_TO_KM` | `1.496e8` | `patchedConic.ts`, `travelPhysics.ts` |

**Suggested consolidation:** Create `src/physicsConstants.ts` with a single source of truth for every constant. All files import from there.

---

## 3. Magic Numbers

### 3.1 Visual Scale Constants

| Number | Meaning | Locations | Should be named |
|--------|---------|-----------|-----------------|
| `80` | Log-scale reference distance (AU at which log scale = 1) | `renderer.ts` (×5), `travelPlanner.ts`, `gravityAssistDraw.ts` (×2), `dataAdapter.ts` | `LOG_SCALE_REFERENCE_AU` |
| `200` | Moon visual orbit scale factor (AU → px multiplier) | `renderer.ts` (×2), `travelPlanner.ts`, `gravityAssistDraw.ts` | `MOON_VISUAL_SCALE_PX_PER_AU` |
| `0.25` | Moon max orbit = 25% of parent orbit radius | `renderer.ts` (×2), `travelPlanner.ts` | `MOON_MAX_PARENT_FRACTION` |
| `0.38` | Moon max orbit = 38% of nearest gap | `renderer.ts` (×2) | `MOON_MAX_GAP_FRACTION` |
| `4` | Minimum moon orbit radius in pixels | `renderer.ts` (×2) | `MIN_MOON_ORBIT_PX` |
| `6` | Minimum moon orbit radius in pixels (travelPlanner) | `travelPlanner.ts` | `MIN_MOON_ORBIT_PX` (inconsistent with 4!) |

### 3.2 Physics/Animation Constants

| Number | Meaning | Locations | Should be named |
|--------|---------|-----------|-----------------|
| `500` | Parking orbit radius (km) | `patchedConic.ts` (×2) | `PARKING_ORBIT_RADIUS_KM` |
| `0.5` | Flyby SOI passage duration (days) | `gravityAssistDraw.ts` | `FLYBY_SOI_PASSAGE_DAYS` |
| `0.02` | Flyby duration = 2% of total journey (max cap) | `gravityAssistDraw.ts` | `FLYBY_MAX_JOURNEY_FRACTION` |
| `500` | Flyby altitude above surface (km) | `gravityAssistPhysics.ts` (×2) | `DEFAULT_FLYBY_ALTITUDE_KM` |
| `0.46` | Holman-Wiegert S-type critical fraction | `generator.ts` | `HW_S_TYPE_FRACTION` |
| `2.39` | Holman-Wiegert P-type critical fraction | `generator.ts` | `HW_P_TYPE_FRACTION` |
| `3` | Hierarchical stability ratio min | `generator.ts` | `HIERARCHICAL_RATIO_MIN` |
| `10` | Hierarchical re-roll max | `generator.ts` | `HIERARCHICAL_REROLL_MAX` |

### 3.3 UI/Interaction Constants

| Number | Meaning | Locations | Should be named |
|--------|---------|-----------|-----------------|
| `18` | Hit radius for body selection (px) | `travelPlanner.ts` | `BODY_HIT_RADIUS_PX` |
| `40` | Off-screen margin for culling | `travelPlanner.ts` | `CULLING_MARGIN_PX` |
| `0.1` | Max frame delta time (seconds) | `renderer.ts` | `MAX_FRAME_DT_SECONDS` |

---

## 4. Mixed-Concern Files

### 4.1 `src/renderer.ts` (697 lines)

**Does:**
- Canvas resizing & DPR handling
- Animation loop (`requestAnimationFrame`)
- Background rendering (starfield, nebula)
- Body frame computation (`computeBodyFrames`) — **physics**
- Orbit ring drawing
- Moon orbit drawing
- Body sprite drawing
- Zone band drawing
- Direct trajectory drawing — **physics + animation**
- Gravity assist trajectory drawing — **delegates but orchestrates**
- Travel planner overlay drawing — **UI + physics**
- Hill sphere ring drawing
- Selection ring drawing
- Body label drawing
- Roche limit display
- Barycenter marker drawing

**Should split into:**
- `src/render/background.ts` — starfield, nebula
- `src/render/bodies.ts` — body sprites, labels, orbits
- `src/render/overlays.ts` — travel planner, selection rings, hill spheres
- `src/render/trajectories.ts` — direct, gravity-assist, zone bands
- `src/animation/frameEngine.ts` — RAF loop, time stepping
- `src/positioning.ts` — `computeBodyFrames`, `screenPosAtTime`

### 4.2 `src/travelPlanner.ts` (866 lines)

**Does:**
- Travel timeline state management
- Timeline playback (`tickTravelTimeline`) — **animation**
- Body hit-testing (`findBodyAtScreenPos`) — **physics + UI**
- Body screen position (`getBodyScreenPos`) — **physics**
- DOM event wiring for travel UI — **UI**
- Travel calculation orchestration — **physics**
- Result display updates — **UI**

**Should split into:**
- `src/travel/timeline.ts` — playback, time sync
- `src/travel/hitTesting.ts` — body picking
- `src/travel/ui.ts` — DOM wiring, panel updates
- `src/travel/calculator.ts` — plan computation orchestration

### 4.3 `src/gravityAssistDraw.ts` (456 lines)

**Does:**
- Hyperbolic arc drawing (Bezier curves)
- Velocity vector arrow drawing
- Turn-angle marker drawing
- Full trajectory path drawing
- Spacecraft position interpolation — **animation timing**
- Waypoint generation from physics — **physics estimation**
- SOI radius calculation — **physics**
- Entry/exit/periapsis position calculation — **geometry**
- Day-offset scaling for animation sync — **animation timing**

**Should split into:**
- `src/render/gravityAssistVisuals.ts` — drawing primitives (arcs, arrows, markers)
- `src/travel/waypointGenerator.ts` — physics → waypoint conversion
- `src/travel/shipInterpolator.ts` — time → ship position

---

## 5. Gravity Assist Physics Scattered Across 4 Files

| File | Responsibility | Key functions |
|------|---------------|-------------|
| `gravityAssistPhysics.ts` | Hyperbolic geometry, opportunity search | `calculateTurningAngle`, `calculateVInfinity`, `calculateAssistDeltaV`, `findAssistOpportunities`, `findTwoLegChains` |
| `patchedConic.ts` | Lambert solves, transfer delta-V | `patchedConicTransfer`, `gravityAssistTransfer`, `solveLambertLeg`, `departureHyperbolaDeltaV`, `arrivalHyperbolaDeltaV` |
| `gravityAssistDraw.ts` | Waypoint generation + rendering | `generateRealWaypoints`, `drawGravityAssistTrajectory`, `drawHyperbolicArc` |
| `travelPlanner.ts` | Orchestration + timeline | `tickTravelTimeline`, travel plan execution |

**The bug surface spans all 4 files.** A physics error in `patchedConic.ts` manifests as a visual error in `gravityAssistDraw.ts`, but the root cause is invisible without reading both.

---

## 6. Dead / Unused Code

### 6.1 Unused roll function
**File:** `src/generator.ts`
```ts
function roll3D6(): number { return rollD6() + rollD6() + rollD6(); }
```
Not called anywhere after the heliopause refactor (now uses `roll3D3`).

### 6.2 Unused `testHarness.ts` functions
**File:** `src/testHarness.ts`
Contains batch analysis functions that may be orphaned after data format changes. Need to verify if `batchAdapter.ts` still produces compatible output.

### 6.3 Unused imports in renderer.ts
**File:** `src/renderer.ts:4`
```ts
import { hillSphereAU, calculateEscapeVelocityKms, estimateRadiusKm, getBodyPositionAU, rocheLimitKm } from './travelPhysics';
```
- `hillSphereAU` — used
- `calculateEscapeVelocityKms` — used
- `estimateRadiusKm` — used
- `getBodyPositionAU` — **verify usage**
- `rocheLimitKm` — used

### 6.4 Commented code blocks
None found in current scan, but historical commits may contain commented-out gravity-assist prototypes.

---

## 7. Recommended Consolidation Order

If you want to clean this up incrementally without breaking anything:

1. **Week 1 — Constants:** Create `src/physicsConstants.ts`, migrate all duplicated constants.
2. **Week 2 — Positioning:** Create `src/positioning.ts`, extract `bodyScreenPosition` and `moonOrbitPx`, replace all 4 copies.
3. **Week 3 — Radius estimation:** Deduplicate `estimateRadiusKm` / `estimateBodyRadiusKm` into one exported function.
4. **Week 4 — Renderer split:** Extract `computeBodyFrames` and `screenPosAtTime` from `renderer.ts` into `src/positioning.ts`.
5. **Week 5 — Gravity assist consolidation:** Merge `gravityAssistTransfer` logic from `patchedConic.ts` into `gravityAssistPhysics.ts` so all transfer physics lives in one file.
