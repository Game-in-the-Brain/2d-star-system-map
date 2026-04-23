# Issue: Loading a JSON world produces no 2D map output

**Severity**: Critical  
**Status**: Under investigation / fix in progress  
**Discovered**: 2026-04-23  
**Reporter**: User (regression observed after FRD-049 rollback staging)

---

## Summary

After the FRD-049 (Travel Timeline Slider) feature was staged for rollback, loading any star-system JSON via the paste interface produces a blank canvas — no planets, no stars, no zone bands. Nothing appears. The regression is not user error; the animation loop is being permanently killed by a thrown exception within the first rendered frame.

---

## Symptom

1. User pastes a valid MWG star-system JSON into the paste box.
2. Clicks "Load System".
3. Canvas remains completely black. No system renders.
4. Subsequent loads also produce nothing (not just the first one).
5. No visible error or alert is shown to the user.

---

## Root Cause Analysis

### Root Cause Chain

```
FRD-049 rollback (staged) reverted safety fixes from commit a74fda1
  └─► RAF scheduling moved BACK to end of loop body (Bug 1)
        └─► drawZoneBands: innerR >= outerR guard REMOVED (Bug 2)
              └─► createRadialGradient throws DOMException
                    └─► Exception propagates up, RAF never re-scheduled
                          └─► Animation loop dies permanently
                                └─► State updates (bodies, camera) are applied
                                      but draw() is never called again → blank canvas
```

### Bug 1 — RAF loop permanently dies on frame exception (CRITICAL)

**File**: `src/renderer.ts`  
**Introduced by**: Staged FRD-049 rollback (inadvertent revert of `a74fda1`)

The commit `a74fda1` moved `requestAnimationFrame(loop)` to the **first** line of the loop body and wrapped the render code in try/catch:

```typescript
// CORRECT (a74fda1 / HEAD)
function loop(now: number) {
  rafId = requestAnimationFrame(loop);   // ← scheduled FIRST
  ...
  try {
    initCamera();
    draw(state, starfield, nebulas);
  } catch (err) {
    console.error('[renderer] frame error:', err);
  }
}
```

The staged rollback reverted this to:

```typescript
// BROKEN (staged FRD-049 rollback)
function loop(now: number) {
  ...
  initCamera();
  draw(state, starfield, nebulas);
  rafId = requestAnimationFrame(loop);   // ← scheduled LAST — dies if draw() throws
}
```

If `draw()` throws any exception (see Bug 2), the `requestAnimationFrame` call is never reached. The loop exits permanently. Updating `state.bodies` after this point has zero visual effect — the canvas never repaints.

**Impact**: Any rendering error (transient or not) causes a permanent black screen with no recovery path.

---

### Bug 2 — Zone band gradient crashes on compact systems (CRITICAL — TRIGGER)

**File**: `src/renderer.ts`, function `drawZoneBands`  
**Introduced by**: Staged FRD-049 rollback (inadvertent revert of `a74fda1`)

The Canvas API `createRadialGradient(x, y, r0, x, y, r1)` throws a `DOMException` when `r0 >= r1`. The fix in `a74fda1` added a guard:

```typescript
// CORRECT (a74fda1 / HEAD)
if (!zone || zone.max == null) continue;        // catches both null AND undefined
if (outerR <= 0 || innerR >= outerR) continue;  // guards degenerate gradient
```

The staged rollback removed the `innerR >= outerR` guard and reverted the null check:

```typescript
// BROKEN (staged)
if (!zone || zone.max === null) continue;  // misses undefined zone.max
if (outerR <= 0) continue;                // no innerR >= outerR guard
```

**When does `innerR >= outerR` occur?**  
- M9 / K-class compact systems where the habitable zone is extremely narrow (conservative zone min ≈ max ≈ 0.05–0.1 AU).
- Any system where zone.max is undefined (some non-standard JSON formats set zone.max to `undefined` rather than `null`).
- At very low zoom values where log-scaling compresses zone widths below floating-point precision.

**Exact error**: `DOMException: The start radius provided is greater than or equal to the end radius.`

This is the actual exception that kills the RAF loop via Bug 1.

---

### Bug 3 — gasClass string normalization removed (FUNCTIONAL)

**File**: `src/dataAdapter.ts`, `src/types.ts`  
**Introduced by**: Staged FRD-049 rollback (also inadvertently reverted commit `705c34a`)

MWG outputs `gasClass` as Roman numeral strings (`"I"`, `"II"`, `"III"`, `"IV"`, `"V"`). Commit `705c34a` added `normalizeGasClass()` to convert these to integers before the switch statement. The staged rollback removed this function:

```typescript
// BROKEN (staged) — switch never matches Roman strings
switch (p.gasClass) {       // p.gasClass = "V" (string)
  case 1: ...               // never matches
  case 5: ...               // never matches
}
// type defaults to 'gas-i' → all gas worlds render yellow as Gas I
```

Also, `types.ts` was reverted from `gasClass: number | string` to `gasClass: number`. At runtime (not compile time), the actual value is a string from MWG, so the type mismatch causes all gas giants to render identically as Gas I / yellow.

**Impact**: Non-crashing but functionally wrong. Gas giants render with wrong color and class label.

---

### Bug 4 — Silent failure when paste JSON doesn't match expected schema (UX)

**File**: `src/main.ts`, `btnLoadSystem` click handler  
**Introduced by**: Staged FRD-049 rollback

The HEAD version of the load handler had:
1. A try/catch around `loadSystemIntoState` that showed an `alert()` on failure.
2. An `else if (systemPaste.value.trim())` branch that alerted the user when `parseSystemPaste` returned null.

The staged rollback removed both:

```typescript
// BROKEN (staged) — no feedback on failure
if (payload) {
  loadSystemIntoState(state, payload);
  systemPaste.value = '';
}
// no else: user sees nothing if parse fails or throws
```

**Impact**: If the user pastes JSON with an unexpected top-level shape (e.g., a raw world object without `starSystem` or `primaryStar` key), nothing happens and there's no explanation.

---

### Bug 5 — Travel panel doesn't update immediately on body click (UX)

**File**: `src/travelPlanner.ts`, `handleTravelPlannerClick`  
**Introduced by**: Staged FRD-049 rollback (replaced `refreshTravelPanel(state)` call with event dispatch)

`handleTravelPlannerClick` now dispatches `new Event('travel-selection-changed')` but no listener is registered in `initTravelPlanner`. The `setInterval(checkActive, 200)` only calls `updatePanel` on tab activation, not on selection changes.

```typescript
// BROKEN (staged) — dispatches an event nobody listens to
const event = new Event('travel-selection-changed');
document.dispatchEvent(event);
```

**Impact**: After clicking a body in the travel planner, the Origin/Destination labels don't update until the next tab focus transition.

---

## Files Affected

| File | Bugs | Type of Change |
|------|------|----------------|
| `src/renderer.ts` | 1, 2 | Safety-critical regression — must fix |
| `src/dataAdapter.ts` | 3 | Functional regression — must fix |
| `src/types.ts` | 3 | Type regression — must fix |
| `src/main.ts` | 4 | UX regression — must fix |
| `src/travelPlanner.ts` | 5 | UX regression — should fix |

---

## QA Items

### QA-REG-01 — Restore RAF-first scheduling and try/catch in renderer loop

**Priority**: P0 (app is broken without this)  
**File**: `src/renderer.ts`, `loop()` function  
**Fix**: Move `rafId = requestAnimationFrame(loop)` to line 1 of loop body; wrap `initCamera()` + `draw()` in try/catch that logs `[renderer] frame error:` to console.  
**Verify**: Load a compact M9 system → map renders; open DevTools → no DOMException; open a second system → still renders.

---

### QA-REG-02 — Restore zone band degenerate gradient guard

**Priority**: P0 (direct crash trigger)  
**File**: `src/renderer.ts`, `drawZoneBands()`  
**Fix**: Change `=== null` to `== null` for `zone.max` check; add `|| innerR >= outerR` to the continue guard.  
**Verify**: Load an M9 system (e.g., `gasClass: "V"` system with `conservative.min ≈ conservative.max`); confirm no DOMException in console.

---

### QA-REG-03 — Restore normalizeGasClass for MWG string gasClass values

**Priority**: P1 (wrong visual output for gas worlds)  
**File**: `src/dataAdapter.ts`, `src/types.ts`  
**Fix**: Re-add `normalizeGasClass(gasClass: number | string): number` function; use `gasClassNum` variable in switch and label template; update `types.ts` to `gasClass: number | string`.  
**Verify**: Load a system with Gas V world → renders as purple (gas-v), not yellow (gas-i).

---

### QA-REG-04 — Restore user-facing error when paste fails

**Priority**: P1 (user gets no feedback on failure)  
**File**: `src/main.ts`, `initPasteControls()`  
**Fix**: Re-add `else if (systemPaste.value.trim())` alert and try/catch around `loadSystemIntoState`.  
**Verify**: Paste `{"foo": "bar"}` → alert saying "Could not parse system JSON". Paste valid JSON that causes a runtime error in buildSceneGraph → alert with specific error.

---

### QA-REG-05 — Wire travel-selection-changed event to updatePanel

**Priority**: P2 (travel planner UX issue)  
**File**: `src/travelPlanner.ts`, `initTravelPlanner()`  
**Fix**: Add `document.addEventListener('travel-selection-changed', updatePanel)` before the final `updatePanel()` call at the end of `initTravelPlanner`.  
**Verify**: Open Travel tab, click a planet → Origin field updates immediately (not after 200ms delay).

---

## Reproduction Steps

1. Checkout the current staged state of the repo.
2. Run `npm run build` (or dev server).
3. Open the app, paste any valid MWG star-system JSON with zone data.
4. Click "Load System".
5. **Expected**: Planets and zones render within one frame.  
   **Actual**: Canvas is black. Browser console shows `DOMException: The start radius provided is greater than or equal to the end radius.` (for systems with compact zones).

---

## Fix Strategy

All five bugs are targeted, minimal fixes. The FRD-049 rollback intent is preserved — none of these fixes re-add the travel timeline slider or related UI. The fixes only restore safety and correctness behaviors that were present before FRD-049 was ever introduced.
