# FRD-064: DeltaV Budget vs Deadline Methodology

**Status**: Draft  
**Priority**: P1 — Core mission planning capability  
**Depends on**: FRD-063 (gravity assists), FRD-060 (SOI-safe routing)  

---

## Summary

Enable mission planners to search for optimal routes given two constraints:
1. **Delta-V budget** — maximum propulsive capability (km/s)
2. **Deadline** — maximum time allowed (days from now)

The system searches all possible route types (direct, Hohmann, gravity-assist chains) and returns a **Pareto frontier** of viable options. Planners can then choose the fastest route within budget, or the cheapest route before the deadline.

**Key insight**: This transforms travel planning from "can I get there?" to "what's the best way to get there given my constraints?"

---

## Physics Model

### Route Types & Their Characteristics

| Route Type | Delta-V | Time | Constraints |
|-----------|---------|------|-------------|
| **Direct (brachistochrone)** | Very high | Very fast | Requires high thrust, lots of fuel |
| **Hohmann transfer** | Low | Slow | Only works when planets are aligned |
| **Gravity assist chain** | Medium | Medium | Requires intermediate bodies, timing-critical |
| **Wait + Hohmann** | Lowest | Slowest + wait | Wait for optimal window, then minimal fuel |
| **Fast transfer** | Medium-High | Medium-Fast | Shorter than Hohmann but more fuel |

### Search Space

For each origin-destination pair, the search space is:
```
{direct, hohmann, wait+hohmann} × {0, 1, 2, ... N assists}
```

With N capped at 3 to prevent combinatorial explosion.

### Pareto Frontier

A route dominates another if it is:
- Faster AND cheaper (strictly better)
- Same speed but cheaper
- Same cost but faster

The Pareto frontier contains only non-dominated routes.

---

## User Stories

### US-064-01: Search within constraints
> As a mission planner, I want to enter my delta-V budget and deadline, then see all viable routes, so that I can pick the best option.

**Acceptance criteria**:
- Input fields: "ΔV Budget (km/s)" and "Deadline (days)"
- System searches all route types within constraints
- Results displayed as a chart: delta-V vs time-of-flight
- Each point on chart is clickable to show route details

### US-064-02: Pareto frontier visualization
> As a mission planner, I want to see the Pareto frontier of all possible routes, so that I understand the tradeoff between speed and fuel.

**Acceptance criteria**:
- Chart shows all viable routes as scatter points
- Pareto frontier highlighted as a connected line
- Points below frontier dimmed (dominated)
- Hover shows route details: type, assists, delta-V, time

### US-064-03: Route comparison
> As a mission planner, I want to compare two specific routes side-by-side, so that I can make an informed decision.

**Acceptance criteria**:
- Select two routes from search results
- Side-by-side comparison table:
  - Total ΔV, flight time, wait time, number of assists
  - Closest approach distances, hazard violations
  - Departure window, arrival date

### US-064-04: Auto-select optimal route
> As a mission planner, I want the system to suggest the "best" route automatically, so that I don't have to analyze every option.

**Acceptance criteria**:
- "Optimization mode" dropdown: "Fastest", "Cheapest ΔV", "Balanced"
- System selects route from Pareto frontier based on mode
- "Balanced" = minimize (ΔV/ΔV_max + time/time_max)

---

## UI Design

### Travel Tab — Route Search Section

```
┌─ Mission Constraints ──────────────────┐
│ ΔV Budget:    [  20  ] km/s            │
│ Deadline:     [ 365  ] days            │
│ Optimization: [ Fastest ▼ ]            │
│                                         │
│ [🔍 Search Routes]                     │
└─────────────────────────────────────────┘

┌─ Route Options ─────────────────────────┐
│ Pareto Frontier (ΔV vs Time)           │
│  ^                                     │
│  │  ×      ×────×                     │
│  │    ×  ×                            │
│  │      ×                             │
│  └───────────────────→                 │
│       Time (days)                      │
│                                         │
│ Selected: Route #3 (Balanced)          │
│ • Type: Gravity assist via Venus       │
│ • ΔV: 14.2 km/s  |  Time: 180 days    │
│ • Assists: 1 (Venus, +3.2 km/s)       │
│ • Departure: 2300-03-15               │
│                                         │
│ [Select This Route]                    │
└─────────────────────────────────────────┘
```

### Route Comparison Modal

```
┌─ Route Comparison ─────────────────────┐
│                  Route A    Route B    │
│ ΔV Budget        14.2       18.5      │
│ Flight Time      180d       120d      │
│ Wait Time        45d        0d        │
│ Assists          1          0         │
│ Hazards          None      Star orange│
│ Departure        2300-03-15 2300-01-01│
│ Arrival          2300-09-12 2300-05-01│
│                                         │
│ [Select A]  [Select B]  [Cancel]      │
└─────────────────────────────────────────┘
```

---

## API Design

### New Types

```typescript
interface RouteOption {
  id: string;
  routeType: 'direct' | 'hohmann' | 'wait-hohmann' | 'gravity-assist';
  assists: GravityAssist[];
  totalDeltaVKms: number;
  flightTimeDays: number;
  waitTimeDays: number;
  departureDayOffset: number;
  arrivalDayOffset: number;
  isOnParetoFrontier: boolean;
  hazardViolations: HazardViolation[];
}

interface RouteSearchInput {
  originId: string;
  destinationId: string;
  deltaVBudgetKms: number;
  deadlineDays: number;
  optimizationMode: 'fastest' | 'cheapest' | 'balanced';
  useGravityAssists: boolean;
  avoidHazards: boolean;
}

interface RouteSearchResult {
  options: RouteOption[];
  paretoFrontier: RouteOption[];
  recommended: RouteOption;
  searchTimeMs: number;
}
```

### New Functions

```typescript
// Search all viable routes given constraints
function searchRoutes(
  input: RouteSearchInput,
  allBodies: SceneBody[],
  starMassSolar: number
): RouteSearchResult;

// Compute Pareto frontier from a set of options
function computeParetoFrontier(options: RouteOption[]): RouteOption[];

// Score a route for "balanced" optimization
function balancedScore(option: RouteOption, maxDeltaV: number, maxTime: number): number;

// Format route for display
function formatRouteSummary(option: RouteOption): string;
```

---

## Implementation Plan

### Step 1: Route generators (2 days)
- Direct brachistochrone route generator
- Hohmann transfer route generator
- Wait-for-window + Hohmann generator
- Gravity-assist chain generator (uses FRD-063)

### Step 2: Search & filter (1 day)
- Generate all route combinations
- Filter by delta-V budget and deadline
- Compute Pareto frontier

### Step 3: Chart visualization (1.5 days)
- Scatter plot: delta-V vs time
- Pareto frontier line
- Interactive hover/selection
- Route comparison modal

### Step 4: UI integration (1 day)
- Add constraint inputs to Travel tab
- Display search results
- Wire "Select Route" button to update timeline

---

## Verification

### Test Cases

| Scenario | Budget | Deadline | Expected Best Route |
|----------|--------|----------|---------------------|
| Earth→Mars, high budget | 30 km/s | 100d | Direct brachistochrone |
| Earth→Mars, low budget | 8 km/s | 500d | Hohmann at next window |
| Earth→Mercury | 15 km/s | 300d | Gravity assist via Venus |
| Earth→Jupiter | 20 km/s | 2y | Gravity assist via Mars/Venus |

---

## Open Questions

1. Should we include aerobraking as a route option? (reduces capture ΔV but adds risk)
2. How do we handle multi-year deadlines where planetary positions change significantly?
3. Should the search be exhaustive or use heuristics (A*, genetic algorithm)?
