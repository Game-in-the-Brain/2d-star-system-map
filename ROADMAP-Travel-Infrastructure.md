# Travel Infrastructure Master Roadmap

**Project**: 2D Star System Map  
**Vision**: From simple point-to-point delta-V calculator to full interplanetary logistics simulation with economics, cyclers, and infrastructure.

---

## Phase 0: Foundation Repair (CRITICAL — Do First)

Before building new features, fix the broken foundations discovered in the travel system audit.

| Item | File | Bug | Impact | Status |
|------|------|-----|--------|--------|
| Fix SOI geometry | `travelCalc.ts` | All bodies assumed collinear on x-axis | SOI detours are wrong for any non-zero orbital angle | 🔄 Pending |
| Fix period for non-solar stars | `soiChecker.ts` | `originPeriod` ignores `starMassSolar` | Clear-window search is wrong for K/M dwarfs and giant stars | 🔄 Pending |
| Unify travel UIs | `travelPlanner.ts` + `travelPanel.ts` | Two separate systems share no state | User selects bodies in sidebar, opens floating panel → selections lost | ✅ **FIXED v2.07** — unified in sidebar |
| Reconcile travel models | `travelPhysics.ts` | `TravelPlan` mixed brachistochrone + budget models | Confusing UX | ✅ **FIXED v2.30** — travel mode toggle (delta-v vs hohmann); brachistochrone removed |
| Cache L1 sort in renderer | `renderer.ts` | `screenPosAtTime` re-sorts on every call | O(N log N) per moon per frame = unnecessary perf hit | ✅ **FIXED v2.29** — `screenPosAtTime` extracted to module level |
| Travel timeline conflict | `travelPlanner.ts` | `tickTravelTimeline` overwrites `simDayOffset` while main loop also advances it | Race condition, animation stutter | ✅ **FIXED v2.27** — auto-pause, independent speed, reverse |
| Straight-line chords | `renderer.ts` | `drawDirectTrajectory` lerps screen pixels | Ship flies through star | ✅ **FIXED v2.29** — `drawCurvedTrajectory` uses Lambert arcs |

**Estimated effort**: 2–3 days  
**Deliverable**: All existing travel features work correctly for angled orbits and non-solar-mass stars.

---

## Phase 1: Orbital Transfer Mechanics

Replace the straight-line-chord approximation with real patched-conic orbital mechanics.

### FRD-063: Gravity Assists & Slingshot Calculator — ✅ DONE
- Model hyperbolic flyby through a planet's SOI
- Calculate delta-V change from gravity assist (Vinfinity in → Vinfinity out, rotated by turning angle)
- Allow user to chain assists: Earth → Venus → Mercury, or Earth → Mars → Jupiter
- Visualize assist trajectories on canvas (hyperbolic arcs within SOI)

### FRD-065: Hohmann Transfer & Lambert Solver — ✅ DONE
- **Hohmann**: Two-impulse coplanar transfer between circular orbits. Draw the transfer ellipse. ✅ v2.20
- **Lambert**: Given departure/arrival positions and time-of-flight, solve for the orbital transfer. ✅ v2.20
- Display transfer orbit on canvas (elliptical arc, not straight chord) ✅ v2.29
- Show departure burn vector and arrival capture burn vector 🔄 Pending

### FRD-068: Patched Conic Trajectory Integration
- Propagate spacecraft state through multiple SOIs
- Handle SOI entry/exit events
- Sum delta-V burns at each patch point
- Visualize full trajectory: departure planet → interplanetary arc → target SOI → capture

**Estimated effort**: 1–2 weeks  
**Deliverable**: Ships follow real orbital arcs, not straight lines. Gravity assists work.

---

## Phase 2: Strategic Planning & Constraints

Add the "mission design" layer — tradeoffs, budgets, deadlines.

### FRD-064: DeltaV Budget vs Deadline Methodology
- User inputs: **delta-V budget** (km/s) and **deadline** (days from now)
- System searches all possible routes (direct, Hohmann, gravity-assist chains) within constraints
- Returns a Pareto frontier: fastest route within budget, cheapest route before deadline, etc.
- Display as a chart: delta-V vs time-of-flight for all viable options

### FRD-069: Roche Limit & Stellar Hazard Avoidance
- Calculate Roche limit for each body: `d = 2.44 · R · (ρM/ρm)^(1/3)`
- Ships cannot plan trajectories that pass within Roche limit of any body (including the star)
- For stars: add "stellar approach budget" — extra delta-V required for thermal shielding and radiation hardening if passing within a certain AU
- Visualize hazard zones on canvas (red dashed rings inside Hill sphere, orange thermal hazard around star)

### FRD-070: Fuel Mass & Tsiolkovsky Rocket Equation
- Add `EngineProfile` type: thrust (N), Isp (s), dry mass (kg), propellant mass (kg)
- Given delta-V budget, calculate required propellant mass: `Δm = m₀ · (1 - e^(-Δv / (Isp·g₀)))`
- Warn if propellant exceeds tank capacity
- Support multiple engine types (chemical, NTR, ion) with different Isp/thrust tradeoffs

**Estimated effort**: 1–1.5 weeks  
**Deliverable**: Users can plan realistic missions with fuel constraints and avoid stellar hazards.

---

## Phase 3: Cyclers & Economics

The "space train" layer — recurring routes driven by economic demand.

### FRD-066: Cycler Orbit Calculator
- Given two planets and a desired encounter period, solve for the cycler orbit
- Support Aldrin-style Earth-Mars cyclers (2.24-year period, 5.5-year round trip)
- Support "ball-of-yarn" cyclers for inner-system routes (Mercury-Venus-Earth)
- Display cycler orbit on canvas as a dashed ellipse
- Show encounter schedule: which departure windows align with the cycler

### FRD-071: Economic Route Demand Model
- Two economies exchange: **material** (bulk cargo), **people** (passengers), **data** (low mass, high value)
- Each body has export/import commodities based on its trade codes
- Demand function: `demand = f(population, tech level, resource availability, starport class)`
- Generate "profitable route" suggestions: high-demand pairs with viable cycler or transfer windows

### FRD-072: Ship Schedule & Fleet Simulation
- Given a cycler orbit or transfer route, generate a schedule of departures
- Ships have: capacity, engine type, operating cost per day
- Fleet optimization: minimum ships needed to maintain service frequency given transfer time
- Display as a Gantt-style timeline: ship departures, arrivals, maintenance windows

**Estimated effort**: 2–3 weeks  
**Deliverable**: The map shows recurring "space train" routes with published schedules.

---

## Phase 4: Infrastructure

Physical infrastructure that changes the economics of travel.

### FRD-073: Inertia Banks (Momentum Exchange Tethers)
- Model a rotating tether in orbit around a body
- Incoming ship matches tether tip velocity → momentum transfer → ship departs at higher velocity
- Calculate maximum tether length given material strength (carbon nanotube: ~100 GPa tensile strength)
- Calculate maximum tip velocity before material failure: `v_tip = sqrt(σ/ρ)`
- Display tethers on canvas as rotating lines extending from body
- Show delta-V "buy" and "sell" prices: how much momentum the tether can transfer per encounter

### FRD-074: Lagrange Point Infrastructure
- Display L1, L2, L3, L4, L5 points for each planet-star and planet-moon system
- Infrastructure can be built at Lagrange points: refueling stations, observation posts, tether anchor points
- Ships can plan routes that stop at Lagrange waypoints
- Fuel cost = 0 for coasting along Interplanetary Transport Network paths between nearby Lagrange points

**Estimated effort**: 2 weeks  
**Deliverable**: Canvas shows rotating tethers and Lagrange point stations. Ships can use them to save fuel.

---

## Phase 5: Interstellar

Multi-year journeys between star systems.

### FRD-075: Interstellar Hohmann Transfer
- Scale Hohmann/Lambert to interstellar distances (light-years, not AU)
- Account for stellar proper motion during multi-year transfer
- Display transfer arc on galactic map (if we ever integrate with the 3D map)
- In 2D map: show as a "departure countdown" and "arrival ETA" with no visual arc (too long)

### FRD-076: Generation Ships & Sleeper Routes
- For routes > 50 years: classify as generation ship, sleeper ship, or fast courier
- Economics: passengers vs cargo vs data have different time-value-of-money curves
- Display route classification and expected ship type on the schedule

**Estimated effort**: 1 week  
**Deliverable**: Interstellar routes are planned with realistic multi-decade timelines.

---

## Summary Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| 0: Foundation Repair | 2–3 days | All existing travel features work correctly |
| 1: Orbital Transfers | 1–2 weeks | Real patched-conic trajectories, gravity assists |
| 2: Strategic Planning | 1–1.5 weeks | Budget/deadline optimizer, fuel mass, hazard zones |
| 3: **Cyclers & Inertia Banks** | 2–3 weeks | Recurring routes, schedules, inertia economy |
| 4: Infrastructure | 2 weeks | Tethers, Lagrange points, momentum exchange |
| 5: Interstellar | 1 week | Multi-year transfers, generation ships |

**Total estimated effort**: 7–11 weeks of focused development.

---

## Phase 3: Cyclers & Inertia Banks (FRD-071)

### 3.1 Cycler Orbit Calculator
- Select two planets → compute resonant orbit that loops between them
- Nuclear-Ion drive model: Isp 4,000 s, thrust 0.25 N, continuous low-thrust station-keeping
- Calculate period, encounter frequency, and station-keeping ΔV
- Visualize cycler orbit on canvas as a distinct elliptical path

### 3.2 Cycler Schedules
- Generate multiple synchronized cyclers on the same route
- Staggered departures so there's always a cycler approaching
- Gantt-style timeline showing all active cyclers and their encounter windows

### 3.3 Inertia Banks
- Place orbital stations that store momentum (spinning masses, EM tethers)
- Vessels can **sell inertia** (brake at bank) or **buy inertia** (boost from bank)
- Price based on bank's momentum reserve and Oberth effect at bank's orbital velocity
- Visualize as hexagonal stations with radial momentum gauges

**See:** `FRD-071-Orbital-Cyclers.md` for full specification.

---

## Immediate Next Steps

1. ✅ **Phase 0 foundations** — Fixed in v2.27–v2.30
2. ✅ **FRD-063 (Gravity Assists)** — Implemented v2.20–v2.24
3. ✅ **FRD-065 (Hohmann/Lambert)** — Implemented v2.20, curved arcs v2.29
4. 🔄 **Next: FRD-071 (Cyclers & Inertia Banks)** — Start with resonant orbit visualization

---

## Open Questions

1. Do we want to support **non-coplanar orbits** (inclination)? Currently 2D only.
2. Do we want **aerobraking** as a capture option? Reduces delta-V but adds risk/heat shield mass.
3. What **engine types** should be modeled? Chemical, NTR, ion, fusion, antimatter?
4. Should cyclers be **player-designed** or **auto-generated** from economic demand?
5. How does the **Inertia Bank** interact with cycler economics? Does a tether at L1 make cyclers obsolete for some routes?
