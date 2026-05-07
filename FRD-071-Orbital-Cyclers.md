# FRD-071: Orbital Cyclers & Inertia Economics

**Status:** Draft  
**Author:** Justin Aquino / Game in the Brain  
**Date:** 2026-05-08  
**Depends on:** FRD-065 (Lambert Solver), FRD-048 (Travel Planner)  

---

## 1. Overview

Orbital cyclers are spacecraft on resonant orbits that repeatedly encounter two or more planets without stopping. Passengers and cargo transfer to/from the cycler at each encounter, while the cycler itself continues on its eternal loop. This FRD specifies:

1. **Cycler Orbit Calculator** — Compute stable resonant orbits, station-keeping ΔV, and encounter schedules
2. **Cycler Schedules** — Multiple synchronized routes serving the same destinations
3. **Inertia Banks** — Infrastructure that stores and sells momentum to departing vessels

---

## 2. Cycler Orbit Calculator

### 2.1 Physics Model

A cycler orbit between planets A and B is a resonant heliocentric ellipse whose period `T_cycler` satisfies:

```
n · T_cycler ≈ m · T_A ≈ k · T_B
```

for small integers `n, m, k`. This ensures the cycler returns to each planet's vicinity at regular intervals.

**Algorithm:**
1. Compute synodic period: `T_syn = 1 / |1/T_A - 1/T_B|`
2. Search integer ratios `p:q` (1..20) minimizing `|p·T_A - q·T_syn|`
3. Cycler period: `T_cycler = p · T_A / q`
4. Semi-major axis from Kepler's 3rd law: `a = (μ · (T_cycler · 86400 / 2π)²)^(1/3)`
5. Orient orbit so periapsis is near the inner planet, apoapsis near the outer

### 2.2 Station-Keeping ΔV

Planetary perturbations and non-circular orbits cause the cycler to drift. Station-keeping is modeled as a continuous low-thrust correction.

**Nuclear-Ion Drive Profile:**
| Parameter | Value |
|-----------|-------|
| Specific Impulse (Isp) | 4,000 s |
| Thrust | 0.25 N |
| Propellant mass flow | `ṁ = F / (Isp · g₀)` |
| Acceleration (1,000 kg) | 2.5×10⁻⁴ m/s² |

**Station-keeping estimate:**
- Inner system cyclers ( < 2 AU ): ~50 m/s/year
- Outer system cyclers ( > 5 AU ): ~10 m/s/year
- Computed from perturbation analysis: integrate cycler state with vs. without correction

### 2.3 Encounter Schedule

For each encounter:
- **Encounter day offset** from departure epoch
- **Relative velocity** at closest approach
- **Transfer ΔV** for passengers/cargo to board/depart
- **Window duration** — how long the cycler stays within rendezvous range

### 2.4 Visualization

- Draw cycler orbit as a distinct colored ellipse (e.g. cyan)
- Animate cycler position along its orbit
- Mark encounter points with planet-colored dots
- Show upcoming encounter schedule in sidebar

---

## 3. Cycler Schedules

Multiple cyclers can serve the same route with staggered departures, providing regular service.

### 3.1 Schedule Generation

Given:
- Route: Planet A ↔ Planet B
- Cycler period: `T_cycler`
- Desired service frequency: `f` (e.g. one departure every 30 days)

Compute:
- Number of cyclers needed: `N = ⌈T_cycler / f⌉`
- Stagger offset for cycler `i`: `offset_i = i · T_cycler / N`

### 3.2 Schedule Display

- Timeline showing all cyclers on the same route
- Gantt-like chart: each cycler as a horizontal bar with encounter markers
- Highlight the "next available departure" for passengers

---

## 4. Inertia Banks

### 4.1 Concept

Inertia banks are orbital infrastructure that store momentum (via spinning masses, electromagnetic tethers, or reaction wheels) and transfer it to departing vessels. This reduces the propellant mass vessels must carry.

### 4.2 Physics

An inertia bank at position `r_bank` can impart ΔV to a vessel:

```
ΔV_bank = √(2μ/r_bank) · (1 - √(2r_bank / (r_bank + r_target)))
```

This is the Oberth effect at the bank's orbital velocity.

### 4.3 Economics

- **Buy inertia:** Vessels arriving at the bank can deposit momentum (braking), earning credits
- **Sell inertia:** Departing vessels purchase momentum (boost), paying credits
- **Price function:** Based on bank's current momentum reserve and demand

### 4.4 Positioning

Optimal inertia bank locations:
- Near periapsis of high-traffic cycler orbits (maximum Oberth effect)
- At Lagrange points (stable, low station-keeping)
- Near major transfer hubs

### 4.5 Visualization

- Render inertia banks as hexagonal stations on the canvas
- Show momentum reserve as a radial gauge
- Animate momentum transfer as glowing energy beams

---

## 5. UI Integration

### 5.1 New "Cycler" Tab

Add a fourth tab alongside Map / System Editor / Travel Planner:

```
[Map] [System Editor] [Travel Planner] [Cycler]
```

### 5.2 Cycler Panel Layout

```
┌─ Route ─────────────────────────┐
│ [Planet A] → [Planet B]         │
│ [🔍 Calculate Cycler]           │
├─ Orbit Parameters ──────────────┤
│ Period: 2.24 years              │
│ Encounters: every 2.13 years    │
│ Station-keeping: 45 m/s/year    │
│ Ion drive: 0.25 N, 4000s Isp    │
├─ Schedule ──────────────────────┤
│ Cycler-1  ●━━━━●━━━━●━━━━●    │
│ Cycler-2    ●━━━━●━━━━●━━━━●  │
├─ Inertia Banks ─────────────────┤
│ [+] Place Bank                  │
│ Bank-1 @ 1.2 AU  ████████░░    │
└─────────────────────────────────┘
```

---

## 6. Implementation Phases

| Phase | Scope | Est. Effort |
|-------|-------|-------------|
| 6.1 | Resonant orbit computation + basic visualization | 2–3 days |
| 6.2 | Station-keeping ΔV + Nuclear-Ion propulsion model | 2–3 days |
| 6.3 | Schedule generation + Gantt display | 2–3 days |
| 6.4 | Inertia bank placement + momentum physics | 3–4 days |
| 6.5 | Economics (buy/sell pricing) + UI polish | 2–3 days |

**Total:** 11–16 days

---

## 7. Open Questions

1. Should cyclers be **player-designed** (custom orbits) or **auto-generated** (optimal resonant orbits)?
2. How does the **Inertia Bank** concept interact with existing delta-V budgets? Is it a discount or a replacement?
3. Should we model **cycler decay** (orbit degradation over decades) requiring periodic refurbishment?
4. What happens when a **third planet** is added to a cycler route? (e.g. Earth-Mars-Jupiter)
