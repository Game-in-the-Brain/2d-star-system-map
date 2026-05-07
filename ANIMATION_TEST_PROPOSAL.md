# 2D Star System Map — Animation & Physics Issues + Testing Proposal

> Audit of gravity assists, waypoints, animation sync, and a proposed deterministic testing framework.

---

## 1. Issues Found

### 1.1 Animation / Time Sync (Critical)

#### Issue A: Shared `simDayOffset` causes planet jumps
**File:** `src/travelPlanner.ts:52-60`

When the travel timeline plays, it overwrites the **global** `state.simDayOffset`:

```typescript
// tickTravelTimeline
state.simDayOffset = departure + tl.travelDayOffset;
```

This means ALL planets instantly snap to the departure date the moment travel playback starts. If the user had the main timeline at day 1000 and opens a travel plan departing at day 0, every planet jumps back to day 0.

**Impact:** Jarring UX, breaks mental model of "watching a voyage".

#### Issue B: Travel timeline progress is linear, but planet motion is angular
**File:** `src/renderer.ts:495-510`

`drawDirectTrajectory` computes ship position as linear interpolation between departure and arrival **screen positions**:

```typescript
const mx = departurePos.x + (arrivalPos.x - departurePos.x) * progress;
```

But planets move on circular orbits. At `progress = 0.5` the ship is at the midpoint of the chord, not the midpoint of the Lambert arc. The visual trajectory is a straight line, not the actual curved transfer orbit.

**Impact:** Ship appears to fly through the star or cut across inner system planets.

#### Issue C: Mixed physics/estimated timing in gravity-assist waypoints
**File:** `src/gravityAssistDraw.ts:260-290`

For the first waypoint, `legTimeDays` comes from real Lambert physics (`assist.leg1TimeDays`). For subsequent waypoints:

```typescript
const interDistPx = Math.hypot(entryPos.x - prevPos.x, entryPos.y - prevPos.y);
legTimeDays = avgSpeedPxPerDay > 0 ? interDistPx / avgSpeedPxPerDay : 0;
```

This uses **screen-pixel distance** divided by an average screen speed to estimate time. It is not physical.

Then all day offsets are scaled to force the ship to arrive at `progress = 1.0`:

```typescript
const scale = totalDays / unscaledTotal;
wp.entryDayOffset *= scale;
wp.exitDayOffset *= scale;
```

**Impact:** Timing of second+ assist flybys is fiction. The ship may appear to arrive at a planet days before/after the planet is actually there.

#### Issue D: Flyby duration is a hardcoded visual constant
**File:** `src/gravityAssistDraw.ts:286`

```typescript
const flybyDuration = Math.min(0.5, totalDays * 0.02);
```

The SOI crossing is always 0.5 days (or 2% of total journey), regardless of actual SOI size or spacecraft velocity.

**Impact:** A Jupiter flyby (massive SOI, fast crossing) and a Mercury flyby (tiny SOI, slow crossing) get the same on-screen duration.

---

### 1.2 Gravity Assist Physics (High)

#### Issue E: Multi-leg chains are invisible
**File:** `src/gravityAssistDraw.ts:194-196`

```typescript
const singleAssists = assists.filter(a => !a.bodyId.includes('+'));
```

Chain assists (e.g., `Venus → Earth → Mars`) are explicitly filtered out of the renderer. The physics engine computes them but the canvas never draws them.

**Impact:** Users who enable "multi-leg chains" see no visual feedback.

#### Issue F: Lambert transfer uses static destination position
**File:** `src/patchedConic.ts:105-115`

```typescript
const r2 = {
  x: destination.distanceAU * Math.cos(destAngle),
  y: destination.distanceAU * Math.sin(destAngle),
};
```

The destination position is computed at **departure time**, not arrival time. The comment admits this: "assume destination hasn't moved much during transfer (small angle approximation)".

For transfers between distant planets (e.g., Jupiter → Neptune, ~10 year transfer), the destination moves ~60°. The Lambert solve targets the wrong point.

**Impact:** Calculated delta-V and time-of-flight are inaccurate for long transfers.

#### Issue G: Planet velocity assumes circular orbits
**File:** `src/gravityAssistPhysics.ts:123-135`

```typescript
export function bodyHeliocentricVelocityKms(body, starMassSolar) {
  const v = circularOrbitalVelocityKms(starMassSolar, body.distanceAU);
  const angle = body.angle + Math.PI / 2;
  return { x: v * Math.cos(angle), y: v * Math.sin(angle) };
}
```

All planets are assumed perfectly circular. Eccentricity from the orbit tree is ignored.

**Impact:** V∞ calculations for gravity assists are slightly off for any body with non-zero eccentricity.

---

### 1.3 Waypoint / Trajectory Rendering (Medium)

#### Issue H: Trajectories drawn in screen space, not AU space
**File:** `src/gravityAssistDraw.ts:77-95`

The full path is drawn as straight lines and quadratic curves between **screen-space** points. Because `logScaleDistance` compresses AU non-linearly, a trajectory that looks smooth on screen may correspond to a wildly oscillating path in AU space.

**Impact:** The visual path is not the physical path.

#### Issue I: Direct trajectory doesn't account for planet motion during transfer
**File:** `src/renderer.ts:495-510`

The direct chord is drawn between `screenPosAtTime(origin, departureDay)` and `screenPosAtTime(destination, arrivalDay)`. The ship is interpolated linearly between these two fixed points. But in reality, the destination moves during the transfer. The ship should chase a moving target.

**Impact:** At mid-transfer, the ship is aimed at where the destination **was** at arrival time, not where it **will be**.

---

### 1.4 Planet Position Accuracy (Medium)

#### Issue J: Moon orbit distance cap logic diverges between computeBodyFrames and screenPosAtTime
**Files:** `src/renderer.ts:270-320` vs `src/renderer.ts:430-470`

Both functions compute moon orbit distances with the same formula but `computeBodyFrames` caches `l1Entries` while `screenPosAtTime` rebuilds it on each call. The sort/compare logic has a floating-point tolerance (`< 0.5`) that could cause different parents to be matched.

**Impact:** Very slight chance that a moon's position in the travel planner differs from its position in the main render.

---

## 2. Proposed Testing Framework

### 2.1 Philosophy

Instead of testing pixels (brittle) or mocking the entire canvas (slow), we test **the math pipeline**:

1. **Deterministic state → deterministic positions**
2. **Physics invariants must hold at every timestep**
3. **Ship position must match planet position at rendezvous**

### 2.2 Architecture: `AnimationValidator`

A headless test harness that runs the same math functions the renderer uses, without needing a browser or canvas.

```typescript
// src/tests/animationValidator.ts

interface ValidationFrame {
  dayOffset: number;
  bodies: Record<string, {
    x: number;   // screen pixels
    y: number;
    angle: number; // radians
  }>;
  ship?: {
    x: number;
    y: number;
    progress: number;
  };
}

interface ValidationRule {
  name: string;
  test: (frames: ValidationFrame[]) => { pass: boolean; detail: string };
}
```

### 2.3 Test Categories

#### Category P: Planet Orbit Correctness

**P-01: Circular orbit closure**
After exactly `periodDays`, a planet must return to its starting position (within 1e-6 px).

```typescript
const frame0 = computeFrame(body, 0);
const frameP = computeFrame(body, body.periodDays);
assert(Math.hypot(frame0.x - frameP.x, frame0.y - frameP.y) < 1e-6);
```

**P-02: Angular velocity constant**
At day `t`, angle = `initialAngle + 2πt/period`.

**P-03: Kepler's Third Law (period vs distance)**
For bodies orbiting the same star: `P² ∝ a³`.

**P-04: Moon orbit closure**
A moon must return to its parent-relative position after `periodDays`.

**P-05: Barycenter mass balance**
In a binary system: `M₁ × r₁ = M₂ × r₂` where `r₁ + r₂ = a`.

#### Category S: Ship Trajectory Correctness

**S-01: Ship at origin at departure**
At `travelDayOffset = 0`, ship position must equal origin body position.

**S-02: Ship at destination at arrival**
At `travelDayOffset = totalDays`, ship position must equal destination body position **at arrival day** (not departure-day destination position).

**S-03: Ship never inside a star**
Ship distance from star origin must always be > 0.

**S-04: Gravity assist flyby matches planet position**
At `travelDayOffset = assist.flybyDayOffset`, the ship must be within `assist.soiRadiusPx` of the assist planet.

**S-05: Gravity assist timing monotonic**
Waypoint entry/exit day offsets must strictly increase: `exitᵢ < entryᵢ₊₁`.

**S-06: No backward motion in progress**
`progress` must be monotonically increasing with `travelDayOffset`.

#### Category T: Time Sync Correctness

**T-01: Planet positions match between renderers**
`computeBodyFrames()` and `screenPosAtTime()` must return identical positions for the same body at the same day offset.

**T-02: Travel timeline doesn't drift from physics**
After N playback frames at speed X, `state.simDayOffset` must equal `departureDay + N * dt * X`.

**T-03: Determinism**
Two runs with identical initial state and identical `dt` values must produce identical frame sequences.

### 2.4 Integration: Frame-by-Frame Snapshot Test

Run the animation at fixed timesteps and record key positions:

```typescript
function runSnapshotTest(
  system: StarSystem,
  travelPlan: TravelPlan,
  fps: number = 30,
  durationDays: number = travelPlan.pessimisticArrivalDays
): ValidationFrame[] {
  const dt = 1 / fps; // days per frame at speed = 1
  const frames: ValidationFrame[] = [];

  for (let day = 0; day <= durationDays; day += dt) {
    // Compute planet positions at this day
    const bodyFrames = computeBodyFrames(system.bodies, 0, 0, day, 1.0);

    // Compute ship position at this day
    const shipPos = computeShipPosition(travelPlan, day / durationDays);

    frames.push({ dayOffset: day, bodies: bodyFrames, ship: shipPos });
  }

  return frames;
}
```

Then run the validation rules:

```typescript
const frames = runSnapshotTest(solSystem, earthToMarsPlan);
const results = validationRules.map(r => r.test(frames));
```

### 2.5 Visual Regression: "Ghost Overlay"

For manual verification, render two trajectories on top of each other:
1. **Ghost** (blue): Expected ship position computed from pure physics at each frame
2. **Actual** (orange): Ship position from the current renderer

If they diverge, the ghost shows where the ship **should** be.

This can be automated by computing the RMS distance between ghost and actual across all frames:

```typescript
const rmsError = Math.sqrt(
  frames.reduce((sum, f) => {
    const dx = f.ship.x - f.ghost.x;
    const dy = f.ship.y - f.ghost.y;
    return sum + dx*dx + dy*dy;
  }, 0) / frames.length
);
assert(rmsError < 2.0); // pixels
```

### 2.6 Proposed File Layout

```
src/tests/
├── animationValidator.ts      # Core harness + computeFrame helpers
├── orbitValidationRules.ts    # P-01 through P-05
├── shipValidationRules.ts     # S-01 through S-06
├── syncValidationRules.ts     # T-01 through T-03
├── snapshotRunner.ts          # runSnapshotTest + ghost overlay
├── testSystems.ts             # Known-good systems (Sol, random seeded)
└── gravityAssistTests.ts      # (existing) physics unit tests
```

### 2.7 CI Integration

```json
// package.json
"scripts": {
  "test:animation": "tsx src/tests/snapshotRunner.ts",
  "test:gravity-assists": "tsx src/tests/gravityAssistTests.ts",
  "test:all": "npm run test:animation && npm run test:gravity-assists"
}
```

The snapshot runner exits with code 1 if any validation rule fails, printing the failing frames and rule details.

---

## 3. Immediate Fix Priorities

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| P0 | Make travel timeline use its own `travelSimDayOffset` instead of overwriting global `simDayOffset` | Small | Fixes planet jumps |
| P0 | Draw direct trajectory as a curved Lambert arc, not a straight chord | Medium | Fixes ship flying through star |
| P1 | Use real Lambert leg times for ALL waypoint legs, not just the first | Medium | Fixes assist timing |
| P1 | Iterate Lambert solve to target destination at arrival time, not departure time | Medium | Fixes long-transfer accuracy |
| P1 | Render multi-leg chains (remove `!bodyId.includes('+')` filter) | Small | Unlocks chain visualization |
| P2 | Compute actual SOI crossing time from V∞ and SOI radius | Small | Fixes flyby duration realism |
| P2 | Unify moon orbit logic between `computeBodyFrames` and `screenPosAtTime` | Small | Eliminates position drift |
