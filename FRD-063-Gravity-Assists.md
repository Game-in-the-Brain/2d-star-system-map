# FRD-063: Gravity Assists & Slingshot Calculator

**Status**: Draft  
**Priority**: P1 — Unlocks all subsequent travel infrastructure  
**Depends on**: Phase 0 foundation fixes (FRD-063-FIX-01 through FIX-04)  

---

## Summary

Enable spacecraft to use planetary gravity assists (slingshots) to change velocity without expending propellant. This transforms the travel planner from a simple origin→destination calculator into a route optimizer that can find cheaper paths via intermediate bodies.

**Key insight**: A gravity assist is not free delta-V — it is a **rotation of the hyperbolic excess velocity vector** (V∞). The planet's gravity field bends the trajectory. The change in heliocentric velocity depends on the flyby altitude and which side of the planet you pass.

---

## Physics Model

### 1. Hyperbolic Flyby Geometry

When a spacecraft enters a planet's sphere of influence (SOI) with velocity **V∞** (hyperbolic excess velocity relative to the planet), the planet's gravity deflects the trajectory by turning angle **δ**:

```
sin(δ/2) = 1 / (1 + r_p · V∞² / μ)
```

Where:
- `r_p` = periapsis (closest approach) radius
- `μ = G · M_planet` = standard gravitational parameter of the planet
- `V∞` = magnitude of hyperbolic excess velocity

The maximum turning angle (at `r_p = R_planet`, i.e., surface grazing):
```
δ_max = 2 · arcsin(1 / (1 + R · V∞² / μ))
```

### 2. Velocity Change in Heliocentric Frame

Before the assist, the spacecraft's heliocentric velocity is:
```
V_in = V_planet + V∞_in
```

After the assist:
```
V_out = V_planet + V∞_out
```

Where `V∞_out` has the same magnitude as `V∞_in` but is rotated by angle `δ`.

The delta-V provided by the assist is:
```
ΔV_assist = |V_out - V_in| = 2 · V∞ · sin(δ/2)
```

### 3. Leading vs Trailing Side

- **Leading-side flyby** (pass in front of planet's motion): spacecraft loses heliocentric velocity (decelerates)
- **Trailing-side flyby** (pass behind planet's motion): spacecraft gains heliocentric velocity (accelerates)

This is controlled by the **aiming parameter b** (impact parameter, perpendicular offset from the planet's velocity vector).

---

## User Stories

### US-063-01: Chain a gravity assist
> As a mission planner, I want to fly from Earth to Mercury by first doing a Venus gravity assist, so that I can reduce my total delta-V budget.

**Acceptance criteria**:
- User selects origin (Earth), destination (Mercury), and optionally adds Venus as an intermediate waypoint
- System calculates the total delta-V with the Venus assist
- System shows delta-V savings compared to direct transfer
- Canvas draws the full trajectory: Earth → Venus SOI → Mercury

### US-063-02: View assist parameters
> As a mission planner, I want to see the flyby altitude, turning angle, and V∞ for each gravity assist, so that I can assess feasibility.

**Acceptance criteria**:
- For each assist body, display:
  - Flyby altitude (km above surface)
  - Hyperbolic excess velocity V∞ (km/s)
  - Turning angle δ (degrees)
  - Delta-V change (km/s)
  - Leading or trailing side
- Warn if flyby altitude is below atmospheric/thermal limit

### US-063-03: Auto-discover assist opportunities
> As a mission planner, I want the system to suggest intermediate bodies that could provide a gravity assist, so that I don't have to manually try every combination.

**Acceptance criteria**:
- Given origin and destination, system searches all other bodies for viable assists
- "Viable" means: the assist reduces total delta-V by > 5%
- Display top 3 suggestions ranked by delta-V savings
- Show the assist trajectory on canvas when hovered

---

## UI Design

### Gravity Assist Panel (new section in Travel sidebar)

```
┌─ Gravity Assist Chain ───────────────────┐
│ Origin: Earth                            │
│ Destination: Mercury                     │
│                                          │
│ Suggested assists:                       │
│ [+] Venus    ΔV saved: 2.3 km/s  [View]  │
│ [+] Earth-Moon ΔV saved: 0.8 km/s        │
│                                          │
│ Custom waypoint: [ dropdown: —Select— ]   │
│                                          │
│ Chain: Earth → Venus → Mercury           │
│ Total ΔV: 8.4 km/s  (direct: 10.7)       │
│ Savings: 2.3 km/s (21%)                  │
│                                          │
│ Flyby details:                           │
│  Venus: altitude 500 km, δ = 47°         │
│  V∞ = 4.2 km/s, trailing side            │
│  [⚠️ Close to thermal limit]             │
└──────────────────────────────────────────┘
```

### Canvas Visualization

- **Normal transfer**: solid blue line from origin to destination
- **Gravity assist trajectory**: 
  - Solid line from origin to assist body
  - Curved hyperbolic arc inside assist body's SOI (dashed)
  - Solid line from assist body to destination
- **Assist body highlight**: green ring around body when assist is selected
- **Flyby point marker**: small arrow showing entry/exit directions

---

## API Design

### New Types

```typescript
interface GravityAssist {
  bodyId: string;
  bodyLabel: string;
  flybyDayOffset: number;        // When the assist occurs
  flybyAltitudeKm: number;       // Periapsis above surface
  vInfinityKms: number;          // Hyperbolic excess velocity
  turningAngleDeg: number;       // δ
  deltaVKms: number;             // Magnitude of heliocentric ΔV
  isAccelerating: boolean;       // Trailing side = true (gains speed)
  isValid: boolean;              // Flyby altitude above minimum
  warning?: string;              // "Close to thermal limit", "Atmospheric entry", etc.
}

interface TransferLeg {
  fromBodyId: string;
  toBodyId: string;
  departureDayOffset: number;
  arrivalDayOffset: number;
  deltaVKms: number;             // Burn required at departure (or 0 for coasting)
  transferType: 'hohmann' | 'lambert' | 'coast';
  trajectory: TrajectoryPoint[]; // For canvas drawing
}

interface MultiLegPlan {
  legs: TransferLeg[];
  assists: GravityAssist[];
  totalDeltaVKms: number;
  totalTimeDays: number;
  directComparison: { deltaVKms: number; timeDays: number };
}
```

### New Functions

```typescript
// Calculate hyperbolic turning angle
calculateTurningAngle(
  flybyRadiusKm: number,
  vInfinityKms: number,
  planetMu: number
): number;

// Calculate V∞ from heliocentric approach velocity
calculateVInfinity(
  spacecraftVelocityKms: Vector2,
  planetVelocityKms: Vector2
): { magnitude: number; direction: Vector2 };

// Apply gravity assist rotation
calculateAssistDeltaV(
  vInfinityIn: Vector2,
  planetVelocityKms: Vector2,
  turningAngleRad: number,
  side: 'leading' | 'trailing'
): Vector2; // Returns new heliocentric velocity

// Search for viable assists between origin and destination
findAssistOpportunities(
  origin: SceneBody,
  destination: SceneBody,
  allBodies: SceneBody[],
  starMassSolar: number,
  departureDayOffset: number
): GravityAssist[];

// Build multi-leg plan with assists
buildMultiLegPlan(
  originId: string,
  destinationId: string,
  assistBodyIds: string[],
  allBodies: SceneBody[],
  starMassSolar: number,
  departureDayOffset: number
): MultiLegPlan | null;
```

---

## Implementation Plan

### Step 1: Fix Phase 0 foundations (prerequisite)
- Fix SOI geometry to use real orbital angles (`travelCalc.ts`)
- Fix `originPeriod` for non-solar stars (`soiChecker.ts`)
- Cache L1 sort in renderer (`renderer.ts`)

### Step 2: Core physics (2 days)
- Implement `calculateTurningAngle`, `calculateVInfinity`, `calculateAssistDeltaV`
- Add unit tests with known values (e.g., Voyager Jupiter assist: V∞ ≈ 10 km/s, δ ≈ 40°)

### Step 3: Assist search (2 days)
- Implement `findAssistOpportunities`
- Brute-force search: for each non-star body, try trailing-side flyby at various periapsis altitudes
- Rank by delta-V savings

### Step 4: Multi-leg planner (2 days)
- Implement `buildMultiLegPlan`
- Chain Lambert transfers between each leg
- Sum delta-V at each departure/capture point

### Step 5: UI & visualization (2 days)
- Add Gravity Assist section to travel sidebar
- Draw hyperbolic arcs and assist trajectories on canvas
- Add flyby detail tooltips

### Step 6: Integration & testing (1 day)
- Wire into existing travel planner state
- Test with known real-world trajectories (Voyager, Cassini, Parker Solar Probe)

**Total estimated effort**: 7–9 days.

---

## Verification

### Test Case 1: Voyager 2 Jupiter Assist
- Origin: Earth
- Assist: Jupiter
- Destination: Saturn
- Expected: V∞ at Jupiter ≈ 10.3 km/s, turning angle ≈ 40°, heliocentric ΔV ≈ 7.3 km/s
- Tolerance: ±10%

### Test Case 2: Parker Solar Probe Venus Assist
- Origin: Earth
- Assist: Venus (repeatedly)
- Destination: Sun (0.05 AU perihelion)
- Expected: Each Venus assist reduces orbital energy, lowering perihelion
- Tolerance: Perihelion decreases monotonically with each assist

### Test Case 3: Earth → Mercury via Venus
- Direct Hohmann: ~10.7 km/s
- With Venus assist: ~8.4 km/s (≈ 21% savings)
- System should find and display this savings

---

## Open Questions

1. **Atmospheric limit**: Should we model aerobraking as an intentional assist option, or only vacuum flybys?
2. **Moon assists**: Should the system consider Earth-Moon, Jupiter-moon assists (like Cassini's Earth-Moon-Venus-Venus-Earth-Jupiter chain)?
3. **Optimal periapsis**: Should the system optimize flyby altitude for maximum delta-V gain, or use a fixed safe altitude (e.g., 500 km above surface)?
4. **Plane change**: Current system is 2D (coplanar). Should we add a simplified inclination penalty for out-of-plane assists?
