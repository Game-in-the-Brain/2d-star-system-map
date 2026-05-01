# FRD-069: Roche Limit & Stellar Hazard Avoidance

**Status**: Draft  
**Priority**: P1 — Safety-critical for trajectory planning  
**Depends on**: FRD-063 (gravity assist physics)  

---

## Summary

Prevent spacecraft trajectories from passing within the **Roche limit** of any body (where tidal forces would break the spacecraft apart). For stars, add a **stellar approach budget** that accounts for thermal shielding and radiation hardening costs when passing close.

**Key insight**: The Roche limit is where a fluid body would be torn apart by tidal forces. For a rigid spacecraft, the actual limit is higher. We use a conservative safety margin.

---

## Physics Model

### 1. Roche Limit

For a rigid body:
```
d_Roche = R_planet × (2 × ρ_planet / ρ_spacecraft)^(1/3)
```

For a fluid body (more conservative, used as safety floor):
```
d_Roche ≈ 2.44 × R_planet × (ρ_planet / ρ_spacecraft)^(1/3)
```

Where:
- `R_planet` = body radius
- `ρ_planet` = body density
- `ρ_spacecraft` = spacecraft density (assume ~1000 kg/m³ for typical spacecraft)

**Simplified formula** (using mass and radius):
```
d_Roche = 2.44 × R × (M / m_spacecraft)^(1/3)
```

For trajectory planning, we use:
```
d_Roche = 2.44 × R × (ρ_body / 1000)^(1/3)
```

With a **safety margin multiplier of 2×** for crewed missions, **1.5×** for unmanned.

### 2. Stellar Thermal Hazard Zone

For stars, the hazard is not tidal but thermal and radiative:

```
P_received = L_star / (4πd²)   [W/m²]  — flux at distance d
```

Hazard zones:
- **Red zone**: P > 100 kW/m² (instantaneous destruction)
- **Orange zone**: P > 10 kW/m² (requires heavy shielding)
- **Yellow zone**: P > 1 kW/m² (requires standard shielding)

**Delta-V penalty for stellar approach**:
- Passing through yellow zone: +0.5 km/s (shielding mass)
- Passing through orange zone: +2.0 km/s (heavy shielding + cooling)
- Passing through red zone: **Route rejected**

---

## User Stories

### US-069-01: Roche limit warning
> As a mission planner, I want to be warned if my trajectory passes within the Roche limit of any body, so that I don't plan an impossible route.

**Acceptance criteria**:
- System calculates Roche limit for every body along the trajectory
- If planned periapsis < 2× Roche limit, show warning: "⚠ Periapsis within Roche limit of [Body]"
- If planned periapsis < 1.5× Roche limit, reject route: "❌ Route impossible — periapsis below safe altitude"
- Visualize Roche limit on canvas as red dashed ring inside Hill sphere

### US-069-02: Stellar approach budget
> As a mission planner, I want to know the extra delta-V cost of passing close to the star, so that I can decide if a faster but hotter route is worth it.

**Acceptance criteria**:
- System calculates stellar flux at closest approach
- Adds thermal shielding delta-V to total budget
- Shows hazard zone classification (yellow/orange/red)
- Visualizes thermal hazard zones around star on canvas

### US-069-03: Auto-avoid hazards
> As a mission planner, I want the system to automatically route around hazardous zones, so that I don't have to manually adjust every trajectory.

**Acceptance criteria**:
- "Auto-avoid hazards" toggle in Travel tab
- When enabled, system adds detours around Roche limits and thermal zones
- Detour cost shown in results panel
- If no safe route exists, show "No hazard-free route found"

---

## UI Design

### Canvas Visualization

```
Body center ─┬─ [Red dashed ring]  ← Roche limit (2.44×R)
             ├─ [Orange dashed ring] ← Thermal hazard (if star)
             ├─ [Yellow dashed ring] ← Thermal warning (if star)
             └─ [White faint ring]   ← Hill sphere (existing)
```

### Travel Tab — Hazard Section

```
┌─ Hazard Analysis ────────────────────────┐
│ Closest approach:                        │
│   • Jupiter: 12,000 km (safe) ✓          │
│   • Star (Sol): 0.8 AU (yellow zone) ⚠   │
│     Thermal shielding: +0.5 km/s         │
│                                          │
│ [☑️ Auto-avoid hazards]                  │
│   Detour cost: +1.2 km/s                 │
└──────────────────────────────────────────┘
```

---

## API Design

### New Functions

```typescript
// Calculate Roche limit in km
function rocheLimitKm(bodyRadiusKm: number, bodyDensityKgM3: number): number;

// Calculate safe periapsis (Roche limit × safety margin)
function safePeriapsisKm(bodyRadiusKm: number, bodyDensityKgM3: number, isCrewed: boolean): number;

// Calculate stellar flux at distance
function stellarFluxWM2(luminositySolar: number, distanceAU: number): number;

// Determine hazard zone from flux
function hazardZoneFromFlux(fluxWM2: number): 'none' | 'yellow' | 'orange' | 'red';

// Calculate thermal shielding delta-V penalty
function thermalShieldingDeltaV(hazardZone: 'yellow' | 'orange'): number;

// Check if trajectory passes through any hazard
function checkTrajectoryHazards(
  waypoints: AssistWaypoint[],
  allBodies: SceneBody[],
  starMassSolar: number
): HazardReport;

interface HazardReport {
  isSafe: boolean;
  violations: HazardViolation[];
  totalPenaltyDeltaVKms: number;
}

interface HazardViolation {
  bodyId: string;
  bodyLabel: string;
  violationType: 'roche-limit' | 'thermal-orange' | 'thermal-red';
  closestApproachKm: number;
  limitKm: number;
  penaltyDeltaVKms?: number;
}
```

---

## Implementation Plan

### Step 1: Core physics (1 day)
- Implement `rocheLimitKm`, `safePeriapsisKm`
- Implement `stellarFluxWM2`, `hazardZoneFromFlux`
- Unit tests with known values (Jupiter's moon Metis is inside Jupiter's Roche limit)

### Step 2: Trajectory checking (1 day)
- Implement `checkTrajectoryHazards`
- Integrate with `findAssistOpportunities` to filter out unsafe assists
- Add hazard rings to canvas renderer

### Step 3: UI integration (1 day)
- Add hazard section to Travel tab results
- Add "Auto-avoid hazards" toggle
- Color-code hazard rings on canvas

### Step 4: Testing (0.5 day)
- Test with known systems:
  - Jupiter + Metis (moon inside Roche limit)
  - M-dwarf + close planet (strong thermal hazard)
  - Compact system with overlapping Roche limits

---

## Verification

### Test Cases

| Test | Body | Expected Roche Limit | Source |
|------|------|---------------------|--------|
| Earth | R = 6371 km, ρ = 5514 | ~16,000 km | Known: geostationary orbit at 42,164 km is well outside |
| Jupiter | R = 71,492 km, ρ = 1326 | ~175,000 km | Known: Metis at 128,000 km is inside |
| Sun | R = 696,340 km, ρ = 1408 | ~1.5 million km | Known: No solid body can orbit closer |

---

## Open Questions

1. Should we model spacecraft structural strength (rigid vs fluid Roche limit)?
2. Should thermal penalty depend on spacecraft material (carbon composite vs steel)?
3. Do we need to model radiation belts (Van Allen belts, Jupiter's magnetosphere)?
