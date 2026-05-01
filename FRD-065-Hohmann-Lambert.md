# FRD-065: Hohmann Transfer & Lambert Solver

**Status**: Draft  
**Priority**: P1 — Replaces straight-line chord with real orbital mechanics  
**Depends on**: FRD-063 (gravity assist physics foundation)  

---

## Summary

Replace the current straight-line-chord approximation with real orbital transfer mechanics:
1. **Hohmann transfer** — Two-impulse coplanar transfer between circular orbits (most fuel-efficient)
2. **Lambert solver** — Given two positions and a time-of-flight, find the orbital transfer (general case)

**Key insight**: The current renderer draws a straight blue line between origin and destination. Real spacecraft follow elliptical transfer orbits. Drawing the actual transfer ellipse makes the visualization both more accurate and more beautiful.

---

## Physics Model

### 1. Hohmann Transfer

The classic two-impulse transfer between circular orbits:

```
Δv1 = sqrt(μ/r1) × (sqrt(2r2/(r1+r2)) - 1)   [departure burn]
Δv2 = sqrt(μ/r2) × (1 - sqrt(2r1/(r1+r2)))    [arrival burn]
T_transfer = π × sqrt(a³/μ)                    [half orbital period]
a = (r1 + r2) / 2                               [semi-major axis]
```

Where:
- `r1`, `r2` = orbital radii of origin and destination
- `μ` = standard gravitational parameter of central body (star)
- `T_transfer` = time of flight (one half of transfer orbit period)

**When to use**: Planets are at opposite sides of the transfer ellipse (180° apart). Most fuel-efficient but requires specific alignment.

### 2. Lambert's Problem

Given:
- Position vector **r₁** at time t₁
- Position vector **r₂** at time t₂
- Time of flight Δt = t₂ - t₁

Find: Velocity vectors **v₁** and **v₂** that connect the two positions in the given time.

**Solution methods**:
1. **Battin's method** — Robust, works for all cases
2. **Izzo's method** — Fast, uses hypergeometric functions
3. **Universal variable formulation** — Goodstein & Hang

We will implement **Izzo's algorithm** (2015) as it's the modern standard and handles all edge cases.

### 3. Patched Conic Approximation

For multi-leg journeys (with gravity assists), we patch together:
1. Departure hyperbola from origin planet's SOI
2. Interplanetary Lambert arc
3. Arrival hyperbola into destination planet's SOI

```
Total ΔV = Δv_departure_escape + Δv_lambert + Δv_arrival_capture
```

---

## User Stories

### US-065-01: Visualize Hohmann transfer
> As a mission planner, I want to see the Hohmann transfer ellipse drawn on the map, so that I understand the actual spacecraft trajectory.

**Acceptance criteria**:
- Calculate Hohmann transfer between selected origin and destination
- Draw transfer ellipse on canvas (dashed blue ellipse)
- Show departure burn point and arrival capture point
- Display transfer time and delta-V in results panel

### US-065-02: Lambert solver for arbitrary timing
> As a mission planner, I want to plan a transfer for a specific departure date, even if it's not a Hohmann window, so that I have flexibility in mission timing.

**Acceptance criteria**:
- Input: departure date, arrival date (or time of flight)
- Lambert solver computes transfer orbit
- Draw transfer arc on canvas (may be >180° or <180°)
- Show delta-V for departure and arrival burns

### US-065-03: Compare transfer types
> As a mission planner, I want to compare Hohmann vs Lambert transfers side-by-side, so that I can choose between fuel efficiency and timing flexibility.

**Acceptance criteria**:
- "Transfer type" selector: Hohmann / Lambert / Fastest
- For Lambert: allow specifying time of flight
- Display comparison table: ΔV, time, departure angle, arrival angle

### US-065-04: Animated transfer
> As a mission planner, I want to see the spacecraft animate along the transfer ellipse, so that I can visualize the journey.

**Acceptance criteria**:
- Spacecraft moves along elliptical path (not straight chord)
- Speed varies correctly (fastest at periapsis, slowest at apoapsis)
- Timeline scrubber controls position along ellipse

---

## UI Design

### Canvas Visualization

```
        ☉ Star (center)
         │
    ╭────┴────╮
   ╱   Origin  ╲
  │      ●──────│←── Departure burn
  │     /       │
  │    /  [Transfer ellipse]
  │   /         │
  │  /          │
  │ ●───────────│←── Arrival capture
  │Destination  │
   ╲           ╱
    ╰─────────╯
```

**Drawing details**:
- Transfer ellipse: dashed blue line, 1.5px stroke
- Departure point: green dot with "DEP" label
- Arrival point: orange dot with "ARR" label
- Current spacecraft position: orange chevron (as existing)
- Burn vectors: small arrows showing thrust direction

### Travel Tab — Transfer Type Selector

```
┌─ Transfer Type ──────────────────────────┐
│ [●] Hohmann (most fuel-efficient)        │
│ [ ] Lambert (custom timing)              │
│     Time of flight: [ 180 ] days         │
│ [ ] Fastest (minimum time)               │
│                                         │
│ Departure: 2300-03-15                   │
│ Arrival:   2300-09-12                   │
│                                         │
│ [🚀 Calculate Transfer]                  │
└─────────────────────────────────────────┘
```

---

## API Design

### New Types

```typescript
interface TransferOrbit {
  semiMajorAxisAU: number;
  eccentricity: number;
  inclinationDeg: number;
  departureTrueAnomalyDeg: number;
  arrivalTrueAnomalyDeg: number;
  departureVelocityKms: { x: number; y: number };
  arrivalVelocityKms: { x: number; y: number };
  timeOfFlightDays: number;
  deltaVDepartureKms: number;
  deltaVArrivalKms: number;
}

interface HohmannResult {
  transferOrbit: TransferOrbit;
  departureBurnKms: number;
  arrivalBurnKms: number;
  totalDeltaVKms: number;
  timeOfFlightDays: number;
  synodicWaitDays: number; // How long to wait for next window
}

interface LambertResult {
  transferOrbit: TransferOrbit;
  shortWay: boolean; // true = <180°, false = >180°
  iterations: number; // Solver convergence count
}
```

### New Functions

```typescript
// Hohmann transfer between two circular orbits
function solveHohmann(
  r1AU: number,
  r2AU: number,
  starMassSolar: number
): HohmannResult;

// Lambert's problem solver (Izzo's algorithm)
function solveLambert(
  r1: { x: number; y: number },
  r2: { x: number; y: number },
  timeOfFlightDays: number,
  starMassSolar: number,
  shortWay?: boolean
): LambertResult;

// Generate points along a transfer orbit for canvas drawing
function sampleTransferOrbit(
  transferOrbit: TransferOrbit,
  numPoints: number
): { x: number; y: number }[];

// Calculate true anomaly at a given time on transfer orbit
function trueAnomalyAtTime(
  transferOrbit: TransferOrbit,
  timeDays: number
): number;
```

---

## Implementation Plan

### Step 1: Hohmann transfer (1 day)
- Implement `solveHohmann`
- Generate ellipse points for canvas
- Draw transfer ellipse in renderer
- Unit tests with known values (Earth→Mars Hohmann)

### Step 2: Lambert solver (2 days)
- Implement Izzo's algorithm
- Handle edge cases (180° transfer, rectilinear orbits)
- Unit tests with analytical solutions
- Compare with Hohmann for Hohmann-compatible cases

### Step 3: Canvas integration (1 day)
- Replace straight chord with transfer ellipse in renderer
- Animate spacecraft along ellipse
- Show departure/arrival markers

### Step 4: UI integration (1 day)
- Add transfer type selector to Travel tab
- Display transfer parameters in results
- Handle custom time-of-flight input

---

## Verification

### Test Cases

| Test | Transfer | Expected ΔV | Expected Time | Source |
|------|----------|-------------|---------------|--------|
| Earth→Mars Hohmann | r1=1.0, r2=1.52 | ~5.5 km/s | ~259 days | NASA trajectory bible |
| Earth→Venus Hohmann | r1=1.0, r2=0.72 | ~5.2 km/s | ~146 days | Known value |
| Earth→Moon (approx) | r1=1.0, r2=0.997 | ~3.9 km/s | ~5 days | Apollo trajectory |
| Lambert 90° transfer | r1=1.0, r2=1.52, θ=90° | > Hohmann ΔV | < Hohmann time | Should be suboptimal |

### Regression Tests

- For Hohmann-compatible geometry, Lambert solver should give same result as Hohmann
- Energy must be conserved: v₁²/2 - μ/r₁ = v₂²/2 - μ/r₂
- Angular momentum must be conserved: r₁ × v₁ = r₂ × v₂

---

## Open Questions

1. Should we support **bi-elliptic transfers**? (Three-impulse, sometimes cheaper than Hohmann for large r2/r1)
2. How to handle **non-coplanar transfers**? (Inclination change is very expensive in delta-V)
3. Should we include **low-thrust spirals**? (Ion drives — continuous thrust, not impulsive)
