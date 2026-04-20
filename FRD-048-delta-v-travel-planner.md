# FRD-048: Delta-V Calculator & Orbital Travel Planner

**Project:** 2D Star System Map  
**Version Target:** 1.02+  
**Priority:** P1  
**Depends On:** Core renderer pipeline, FRD-046 (System Editor), FRD-047 (PWA) — ✅ COMPLETE

---

## 1. Overview

The 2D Star System Map gains a **Travel Planner** mode that lets GMs plan realistic interplanetary journeys using delta-V budgets and orbital mechanics. Users select an origin world, a destination world, input their spacecraft's total delta-V capacity, and the system calculates:

1. **Escape requirements** — minimum delta-V to leave the origin and capture into the destination
2. **Fastest travel time** — goal-seeking simulation that finds the earliest possible arrival
3. **Optimistic / pessimistic bounds** — best-case vs worst-case arrival windows as planets move
4. **Visual trajectory** — the planned route drawn on the canvas

The planner assumes **chemical rockets** (short burns, long ballistic coast) and operates within the existing animated star system so departure dates align with the current simulation time.

---

## 2. User Story

> As a GM, I want to know how long it takes to travel from Planet A to Planet B with my ship's delta-V budget, so I can plan campaign timelines and player encounters realistically.

---

## 3. Physics Model

### 3.1 Assumptions

| Parameter | Value | Notes |
|---|---|---|
| Propulsion | Chemical rockets | Short impulse burns, long ballistic coast |
| Gravitational model | Star-centric two-body | Simplified; planet-to-planet transfers treated as heliocentric |
| Orbital shapes | Circular | Existing renderer assumption; period from Kepler's 3rd law |
| Body radius | Estimated from mass | See §3.4; replaces missing physical radius data |
| Delta-V budget | User-supplied km/s | Total propulsive capacity of the spacecraft |

### 3.2 Escape Velocity

The minimum delta-V required to escape a body's gravity well:

```
v_esc = sqrt(2 × G × M / R)
```

Where:
- `G` = 6.674×10⁻¹¹ m³ kg⁻¹ s⁻²
- `M` = body mass in kg (converted from Earth masses)
- `R` = body radius in metres (estimated from mass)

**Implementation:** `src/travelPhysics.ts` `calculateEscapeVelocityKms(bodyMassEM: number, bodyRadiusKm: number): number`

### 3.3 Mass-to-Radius Estimation

Physical planetary radii are not currently present in `StarSystem`. Use standard mass-radius relationships:

```typescript
function estimateRadiusKm(massEM: number, type: BodyType): number {
  const EARTH_RADIUS_KM = 6371;
  if (type.startsWith('gas')) {
    // Gas giant: R ∝ M^0.5, saturates near brown-dwarf limit
    return EARTH_RADIUS_KM * Math.min(Math.pow(massEM, 0.5), 13 * 11.2);
  }
  if (type === 'dwarf') {
    return EARTH_RADIUS_KM * Math.pow(massEM, 0.25); // small bodies compress less
  }
  // Rocky / icy worlds
  return EARTH_RADIUS_KM * Math.pow(massEM, 0.28);
}
```

> **Future:** If MWG later exports physical radii, replace this estimation with actual data.

### 3.4 Transfer Mechanics

Given:
- Origin body `O` at position **P**₀(t₀) at departure
- Destination body `D` at position **P**₁(t) at time `t`
- User delta-V budget `ΔV_budget` (km/s)
- Escape velocities `v_esc_o`, `v_esc_d`

**Available excess velocity:**

```
V_excess = ΔV_budget - v_esc_o - v_esc_d
```

If `V_excess ≤ 0`, the transfer is **impossible** — the ship cannot even escape and capture.

**Distance at time `t`:**

```
d(t) = |P₁(t) - P₀(t₀)|   [AU]
```

Converted to km: `d_km(t) = d(t) × 1.496×10⁸`

**Spacecraft range at time `t`:**

```
range(t) = V_excess × (t - t₀) × 86400   [km]
```

### 3.5 Goal-Seeking Arrival Calculation

The system searches forward day-by-day from `t₀`:

```typescript
for (let day = 1; day <= MAX_SEARCH_DAYS; day++) {
  const t = t0 + day;
  const destPos = getBodyPosition(destination, t);
  const distKm = distance(originPos, destPos) * AU_TO_KM;
  const rangeKm = excessVelocityKms * day * 86400;

  if (rangeKm >= distKm) {
    return day; // earliest possible arrival
  }
}
```

This is the **optimistic** bound — assumes straight-line ballistic flight.

### 3.6 Pessimistic Bound

Real trajectories curve under stellar gravity. Apply a path-lengthening factor based on the angular separation `θ` of the two bodies as seen from the star:

```
path_factor = 1 + 0.3 × sin(θ/2)
```

**Pessimistic distance:** `d_pessimistic = d × path_factor`

**Pessimistic arrival:** solve `range(t) ≥ d_pessimistic(t)` using the same day-by-day search.

This yields a range: *"Arrival in 42–58 days"*.

### 3.7 Synodic Period Consideration

For repeating routes, the system also reports the **next favorable window** — when the origin and destination align for shortest transfer (opposition/conjunction). Computed from their orbital periods:

```
T_synodic = 1 / |1/T_o - 1/T_d|   [days]
```

---

## 4. UI Specification

### 4.1 New Tab: "Travel Planner"

Add a third tab to the existing tab bar in the control panel:

```
┌─ Tabs ───────────────────────────┐
│ [Map] [System Editor] [Travel ➡] │  ← New
└──────────────────────────────────┘
```

### 4.2 Travel Planner Panel Layout

```
┌─ Travel Planner ─────────────────┐
│                                  │
│ 1. Select Origin                 │
│    [Click a body on the map]     │
│    Origin: G2 Terrestrial        │  ← populated on click
│                                  │
│ 2. Select Destination            │
│    [Click a body on the map]     │
│    Destination: F5 Gas IV        │  ← populated on click
│                                  │
│ 3. Spacecraft Delta-V            │
│    [ 15.0 ] km/s                 │
│                                  │
│ 4. Departure Date                │
│    [ Use Current Sim Date ] ☑    │
│    [ 2300-06-15 ]                │  ← editable if unchecked
│                                  │
│ [🚀 Calculate Transfer]          │
│                                  │
│ ── Results ───────────────────── │
│ Escape Origin:     11.2 km/s     │
│ Capture Dest:       8.5 km/s     │
│ Excess ΔV:          5.3 km/s  ✅ │
│                                  │
│ Earliest Arrival:   42 days      │
│ Likely Arrival:     48–54 days   │
│ Pessimistic:        61 days      │
│                                  │
│ Next Window:        +127 days    │
│                                  │
│ [Clear Selection]                │
└──────────────────────────────────┘
```

### 4.3 Canvas Interaction Mode

When the Travel Planner tab is active, the canvas enters **selection mode**:

1. **First click** on any body (star, planet, moon, disk) sets it as **Origin**:
   - Draw a green ring/pulse around the body
   - Show tooltip: "Origin: {label}"
   - Populate the Origin field in the panel

2. **Second click** on a different body sets it as **Destination**:
   - Draw an orange ring/pulse around the body
   - Show tooltip: "Destination: {label}"
   - Populate the Destination field in the panel

3. **Third click** anywhere resets selection (or use "Clear Selection" button)

4. **Hover** over bodies while in selection mode shows a subtle highlight ring and tooltip with name + escape velocity.

> Moons are valid origins/destinations. The transfer is computed from the moon's orbital position (which orbits its parent, which orbits the star).

### 4.4 Visual Feedback on Canvas

After clicking **Calculate Transfer**:

- Draw a **dashed arc** from Origin to Destination showing the optimistic trajectory path
- Color gradient: green (origin) → yellow → orange (destination)
- Animate a small **ship icon** moving along the path at the calculated velocity
- Show a **countdown label** near the ship: "T-42d"
- The ship animation syncs with the simulation speed controls

### 4.5 Invalid States

| Condition | UI Feedback |
|---|---|
| `V_excess ≤ 0` | Red banner: "Insufficient ΔV. Need at least {v_esc_o + v_esc_d} km/s." |
| Origin == Destination | Grey out Calculate button; tooltip: "Select two different bodies" |
| No system loaded | "Load a system to plan travel." |
| Origin is the star | Warning: "Escape from stellar surface is impractical for chemical rockets." Allow anyway for hard-SF edge cases. |

---

## 5. Data Model

### 5.1 New Types

```typescript
// src/types.ts additions

export interface TravelPlan {
  originId: string;
  destinationId: string;
  departureDayOffset: number;     // days from epoch
  deltaVBudgetKms: number;
  escapeOriginKms: number;
  captureDestKms: number;
  excessDeltaVKms: number;
  optimisticArrivalDays: number;
  pessimisticArrivalDays: number;
  synodicPeriodDays: number;
  nextWindowDayOffset: number;
  isPossible: boolean;
}

export interface TravelPlannerState {
  originId: string | null;
  destinationId: string | null;
  deltaVBudget: number;
  useSimDate: boolean;
  customDepartureDayOffset: number;
  lastPlan: TravelPlan | null;
  isSelecting: boolean;
}
```

### 5.2 AppState Extension

Add to `AppState`:

```typescript
export interface AppState {
  // ... existing fields ...
  travelPlanner?: TravelPlannerState;
}
```

---

## 6. Implementation Plan

### 6.1 File Inventory

| File | Role |
|---|---|
| `src/travelPhysics.ts` | **NEW** — Escape velocity, mass-radius estimation, goal-seeking arrival calculator, synodic period |
| `src/travelPlanner.ts` | **NEW** — UI controller for Travel Planner tab, canvas selection mode, result rendering |
| `src/travelRenderer.ts` | **NEW** — Canvas overlays: selection rings, trajectory arc, ship animation |
| `src/types.ts` | Add `TravelPlan`, `TravelPlannerState` |
| `src/main.ts` | Initialise `travelPlanner` state on boot |
| `index.html` | Add "Travel Planner" tab and panel markup |
| `src/uiControls.ts` | Wire tab switching to include Travel Planner |
| `src/input.ts` | Dispatch click events to travel planner when in selection mode |
| `src/renderer.ts` | Call travel renderer overlay if a plan is active |
| `src/styles.css` | Travel planner panel styles, selection ring animations |

### 6.2 Algorithm: `findArrivalWindow()`

```typescript
export function findArrivalWindow(
  origin: SceneBody,
  destination: SceneBody,
  departureDayOffset: number,
  excessVelocityKms: number,
  starMassSolar: number,
  maxSearchDays = 3650 // 10 years
): { optimistic: number; pessimistic: number } | null {
  if (excessVelocityKms <= 0) return null;

  const originPos = getBodyPositionAU(origin, departureDayOffset, starMassSolar);

  for (let day = 1; day <= maxSearchDays; day++) {
    const t = departureDayOffset + day;
    const destPos = getBodyPositionAU(destination, t, starMassSolar);

    const dx = destPos.x - originPos.x;
    const dy = destPos.y - originPos.y;
    const directDistAU = Math.hypot(dx, dy);

    // Angular separation for pessimistic factor
    const angle = Math.atan2(dy, dx);
    const pathFactor = 1 + 0.3 * Math.abs(Math.sin(angle / 2));
    const pessimisticDistAU = directDistAU * pathFactor;

    const rangeAU = (excessVelocityKms * day * 86400) / 1.496e8;

    if (optimistic === null && rangeAU >= directDistAU) {
      optimistic = day;
    }
    if (rangeAU >= pessimisticDistAU) {
      return { optimistic: optimistic ?? day, pessimistic: day };
    }
  }
  return null; // Destination unreachable within search window
}
```

### 6.3 Body Position at Arbitrary Time

```typescript
export function getBodyPositionAU(body: SceneBody, dayOffset: number, starMassSolar: number): Point {
  // For L1 bodies (no parent), compute orbital position around star
  if (!body.parentId) {
    const angle = body.angle + (body.periodDays > 0 ? (2 * Math.PI * dayOffset) / body.periodDays : 0);
    return {
      x: Math.cos(angle) * body.distanceAU,
      y: Math.sin(angle) * body.distanceAU,
    };
  }

  // For moons, compute parent's position first, then add moon offset
  // (Requires lookup of parent body from the scene graph)
  // ... see src/orbitMath.ts patterns ...
}
```

> **Note:** Moons need parent body lookup. `travelPhysics.ts` accepts the full `SceneBody[]` array to resolve parent positions.

---

## 7. Milestones

### M1: Physics Engine & Selection UI

- [ ] `src/travelPhysics.ts` with escape velocity, mass-radius estimation, `findArrivalWindow()`
- [ ] `src/types.ts` extended with `TravelPlan` and `TravelPlannerState`
- [ ] New "Travel Planner" tab in `index.html` with origin/destination/delta-V/departure inputs
- [ ] Canvas click-to-select logic in `src/travelPlanner.ts`
- [ ] Green/orange selection rings drawn on canvas
- [ ] "Calculate Transfer" button computes and displays results in panel

### M2: Trajectory Visualization

- [ ] `src/travelRenderer.ts` draws dashed trajectory arc between origin and destination
- [ ] Animated ship sprite moving along trajectory at calculated velocity
- [ ] Countdown label following ship position
- [ ] Ship animation syncs with simulation speed controls (play/pause/speed)
- [ ] Clear visual distinction between optimistic and pessimistic paths (two arcs or a shaded band)

### M3: Polish & Edge Cases

- [ ] Synodic period and "next window" calculation
- [ ] Hover tooltips showing escape velocity for all bodies in selection mode
- [ ] Invalid-state handling (insufficient ΔV, same body selected, star as origin)
- [ ] Keyboard shortcut: `T` key switches to Travel Planner tab
- [ ] Saved plans persist to `localStorage` (key: `mneme-travel-plans-{systemKey}`)
- [ ] Build passes zero TypeScript errors

---

## 8. Acceptance Criteria

- [x] User can select any two distinct bodies as origin and destination via canvas clicks
- [x] Escape velocity is correctly calculated for each body using mass-radius estimation
- [x] Transfer is marked impossible if `ΔV_budget < v_esc_origin + v_esc_destination`
- [x] Optimistic arrival time uses straight-line ballistic distance
- [x] Pessimistic arrival time accounts for path curvature via angular factor
- [x] Departure date can be set to current simulation date or overridden manually
- [x] Trajectory arc is drawn on canvas after calculation
- [x] Ship animation moves along arc at correct speed relative to simulation time
- [x] Results update automatically if user changes departure date or delta-V
- [x] No regression in existing Map tab, System Editor tab, or payload decoding
- [x] Build passes zero TypeScript errors

---

## 9. Related FRDs

- FRD-046 (Save Page + System Editor) — ✅ DONE
- FRD-047 (PWA) — ✅ DONE
- FRD-048 (Delta-V Travel Planner) — THIS DOCUMENT
- FRD-049 (Sector-Hosted Mode) — PLANNED

---

## 10. Open Questions

1. **Moons as destinations:** Should the transfer model account for the need to escape the parent planet's gravity well *before* escaping the star system? For v1, treat moon transfers as direct heliocentric transfers from the moon's instantaneous position.
2. **Companion stars:** Transfers to companion stars involve much larger distances. The 10-year search window may be insufficient. Consider adaptive max search based on orbital period.
3. **Atmospheric drag:** Should we model atmospheric drag for aerocapture? Deferred to v1.1 — adds a "aerobraking" checkbox that reduces capture ΔV by ~30%.
4. **Multi-leg journeys:** Some routes may need refuelling stops. Deferred to v1.1.
