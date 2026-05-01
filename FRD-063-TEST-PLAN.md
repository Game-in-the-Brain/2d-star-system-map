# FRD-063 Gravity Assists — Test & Validation Plan

## Philosophy

Gravity assists are orbital mechanics. The math must be validated against:
1. **Analytical solutions** (known formulas with closed-form answers)
2. **Historical mission data** (NASA trajectory reconstructions)
3. **Conservation laws** (energy, angular momentum must be conserved)
4. **Edge cases** (extreme parameters that break naive implementations)

---

## Test Categories

### Category A: Unit Tests — Hyperbolic Geometry

| Test ID | Description | Input | Expected Output | Tolerance |
|---------|-------------|-------|-----------------|-----------|
| A-01 | Turning angle at grazing flyby (r_p = R_planet) | V∞ = 10 km/s, μ = 1.27e8 km³/s² (Jupiter), R = 71,492 km | δ ≈ 2×arcsin(1/(1+R·V∞²/μ)) | ±0.1° |
| A-02 | Turning angle at distant flyby (r_p = 10×R) | Same as A-01 but r_p = 10R | δ ≈ 2×arcsin(1/(1+10R·V∞²/μ)) | ±0.1° |
| A-03 | Zero turning angle at infinite distance | r_p → ∞ | δ → 0° | ±0.01° |
| A-04 | Maximum turning angle at minimum distance | r_p = R + 500km (atmospheric limit) | δ < 180° | ±0.1° |
| A-05 | V∞ magnitude conservation | Any flyby geometry | \|V∞_in\| = \|V∞_out\| | Exact |
| A-06 | Hyperbolic periapsis distance | V∞ = 10 km/s, δ = 40°, μ = Jupiter | r_p = μ/V∞² × (1/sin(δ/2) - 1) | ±1% |

### Category B: Integration Tests — Gravity Assist ΔV

| Test ID | Description | Input | Expected Output | Tolerance |
|---------|-------------|-------|-----------------|-----------|
| B-01 | Trailing-side assist (speed up) | Planet velocity = 13 km/s, V∞ = 5 km/s, δ = 60° | ΔV ≈ 2×V∞×sin(δ/2) ≈ 8.66 km/s, heliocentric V_out > V_in | ±2% |
| B-02 | Leading-side assist (slow down) | Same but leading side | ΔV same magnitude, heliocentric V_out < V_in | ±2% |
| B-03 | 180° turn (theoretical max) | δ = 180° | V_out = -V_in (complete reversal) | Exact |
| B-04 | Voyager 2 Jupiter assist | V∞ = 10.3 km/s, δ ≈ 40° | ΔV ≈ 7.0 km/s | ±10% (legacy data uncertainty) |
| B-05 | Conservation of heliocentric energy | Any assist | ΔE = 0 (planet does work, but planet mass >> spacecraft) | ±0.1% |

### Category C: Historical Mission Validation

| Test ID | Mission | Assist Body | Known Parameters | Validation Target |
|---------|---------|-------------|------------------|-------------------|
| C-01 | Voyager 2 | Jupiter | V∞ = 10.3 km/s, r_p = 721,670 km (10.1 R_J) | Turning angle ≈ 40°, ΔV ≈ 7.3 km/s |
| C-02 | Voyager 2 | Saturn | V∞ = 7.6 km/s, r_p = 161,000 km (2.7 R_S) | Turning angle ≈ 80°, ΔV ≈ 10.0 km/s |
| C-03 | Cassini | Venus (1st) | V∞ = 11.2 km/s, r_p = 8,500 km (1.4 R_V) | Turning angle ≈ 40° |
| C-04 | Cassini | Earth | V∞ = 9.2 km/s, r_p = 18,000 km (2.8 R_E) | Turning angle ≈ 45° |
| C-05 | Parker Solar Probe | Venus (1st) | V∞ = 9.8 km/s, r_p = 12,000 km (2.0 R_V) | Perihelion lowers by ~10% |

### Category D: Edge Cases & Failure Modes

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| D-01 | Flyby below Roche limit | Reject: "Flyby altitude below Roche limit" |
| D-02 | Flyby below atmosphere | Warn: "Atmospheric entry risk" |
| D-03 | V∞ = 0 (matching planet velocity) | Infinite turning angle — reject as impossible |
| D-04 | δ > δ_max for given r_p | Reject: "Turning angle exceeds maximum for this altitude" |
| D-05 | Origin and destination on opposite sides of star | Assist must route around star, not through it |
| D-06 | Multiple assists in sequence | Cumulative ΔV must equal sum of individual assists |

### Category E: Batch System Tests

| Test ID | Description | Systems | Success Criteria |
|---------|-------------|---------|------------------|
| E-01 | Inner system chain | Mercury→Venus→Earth→Mars | Each assist reduces total ΔV vs direct |
| E-02 | Outer planet grand tour | Earth→Jupiter→Saturn→Uranus | Total ΔV < 20 km/s (Voyager-class) |
| E-03 | Solar probe | Earth→Venus×7→Sun | Each Venus assist lowers perihelion |
| E-04 | Random system batch | 100 random generated systems | No crashes, assists found for 80%+ of systems |

---

## Test Harness Architecture

```typescript
// src/tests/gravityAssistTests.ts

interface TestResult {
  testId: string;
  passed: boolean;
  expected: number | string;
  actual: number | string;
  tolerance?: number;
  error?: string;
}

export function runGravityAssistTests(): TestResult[] {
  const results: TestResult[] = [];
  
  // A-01: Turning angle at grazing flyby
  results.push(testTurningAngle({
    testId: 'A-01',
    vInfinityKms: 10,
    mu: 1.27e8,
    periapsisKm: 71492,
    expectedDeg: 2 * Math.asin(1 / (1 + 71492 * 100 / 1.27e8)) * 180 / Math.PI,
    tolerance: 0.1,
  }));
  
  // ... more tests
  
  return results;
}
```

## Batch Test Execution

```bash
# Run all gravity assist tests
npm run test:gravity-assists

# Run with verbose output
npm run test:gravity-assists -- --verbose

# Run specific category
npm run test:gravity-assists -- --category=A
```

## Acceptance Criteria

- **A category**: 100% pass rate (pure math, no approximations)
- **B category**: ≥95% pass rate (integration tolerances)
- **C category**: ≥80% match with historical data (legacy data has uncertainty)
- **D category**: 100% graceful handling (no crashes, proper error messages)
- **E category**: ≥90% success rate on random systems

---

## Test Data Sources

1. **NASA JPL Horizons** — Ephemeris data for planetary positions and velocities
2. **Voyager Trajectory Reconstruction** — JPL DSN tracking data
3. **Cassini Mission Report** — NASA SP-2006-557
4. **Parker Solar Probe Mission Design** — JPL AAS 18-223

---

## Regression Tests

After each FRD-063 physics update, run:
1. All Category A tests (fast, < 1 second)
2. All Category B tests (fast, < 1 second)
3. Category C-01 and C-02 (Voyager — the canonical validation)
4. Category D-01 through D-04 (edge cases)
5. Category E-04 on 10 random systems (integration smoke test)

Total regression time: < 5 seconds.
