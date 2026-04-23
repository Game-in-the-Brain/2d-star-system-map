# FRD-062: 2D Star System Map — Hill Sphere / SOI Display

## 1. Purpose

Display the Hill Sphere (Sphere of Influence) radius for every planetary body in the 2D Star System Map. This provides:

1. **Visual reference** for end users to understand each body's gravitational domain
2. **Verification** that the HRS/SOI traversal costs calculated by the Travel Planner are correct
3. **Cross-check** with the MWG System Viewer (FRD-062-MWG) — both tools show the same values

## 2. Hill Sphere Formula

Same as MWG (FRD-062-MWG):

```
r_H = a * ∛(m / (3 * M))
```

Where:
- `a` = orbital distance from star (AU)
- `m` = body mass (Earth Masses)
- `M` = star mass (Solar Masses)

Already implemented in `src/travelPhysics.ts` as `hillSphereAU()`.

## 3. UI Design — Body Hover Tooltip

### 3.1 Trigger

When the user hovers the mouse over any body on the canvas for ≥200ms, a tooltip appears near the cursor.

### 3.2 Content

```
┌─────────────────────────┐
│  {label} ({type})       │
│  ─────────────────────  │
│  Distance:  {dist} AU   │
│  Mass:      {mass} M⊕   │
│  Hill Sphere: {hs} AU   │
│  Esc Vel:   {esc} km/s  │
└─────────────────────────┘
```

### 3.3 Display Rules

- **Hill Sphere**: shown in scientific notation with 3 significant figures (e.g., `1.847e-4 AU`)
- **Hidden for**: stars, disks, rings (no meaningful Hill sphere)
- **Escape Velocity**: calculated from `calculateEscapeVelocityKms()` in `travelPhysics.ts`

### 3.4 Behaviour

- Tooltip follows the cursor with a small offset (12px right, 12px down)
- Tooltip hides when cursor leaves the body or moves off-canvas
- On mobile/touch: no tooltip (touch has no hover state)
- Does not interfere with click, drag, or travel-planner selection

## 4. Component Changes

### 4.1 `src/types.ts`

Add to `AppState`:
```typescript
hoveredBodyId: string | null;
```

### 4.2 `src/input.ts`

On `mousemove` over canvas:
1. Call `findBodyAtScreenPos(mouseX, mouseY, state)`
2. If body found → `state.hoveredBodyId = body.id`
3. If no body → `state.hoveredBodyId = null`
4. Debounce: only update if body changes (avoid excessive DOM updates)

### 4.3 `src/renderer.ts`

In `draw()`, after all bodies are drawn:
1. If `state.hoveredBodyId` is set, find the body and its screen position
2. Draw tooltip on canvas OR update HTML tooltip element

**Recommended**: Update an HTML `#body-tooltip` element (easier styling, no canvas text layout issues).

### 4.4 `index.html`

Add after `#app`:
```html
<div id="body-tooltip" class="body-tooltip" style="display:none;"></div>
```

### 4.5 `src/styles.css`

```css
.body-tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 50;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  color: #e5e7eb;
  font-size: 12px;
  line-height: 1.5;
  min-width: 140px;
  transition: opacity 0.15s ease;
}
.body-tooltip .tt-title {
  font-weight: 600;
  color: #ffe4b5;
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 2px;
}
.body-tooltip .tt-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.body-tooltip .tt-label {
  color: #9ca3af;
}
.body-tooltip .tt-value {
  font-variant-numeric: tabular-nums;
}
```

## 5. Implementation — `updateBodyTooltip(state)`

```typescript
function updateBodyTooltip(state: AppState): void {
  const tooltip = document.getElementById('body-tooltip');
  if (!tooltip) return;

  if (!state.hoveredBodyId) {
    tooltip.style.display = 'none';
    return;
  }

  const body = state.bodies.find(b => b.id === state.hoveredBodyId);
  if (!body) {
    tooltip.style.display = 'none';
    return;
  }

  const starMass = state.bodies.find(b => b.type === 'star-primary')?.mass ?? 1;
  const hs = hillSphereAU(body.mass, starMass, body.distanceAU, body.type);
  const esc = calculateEscapeVelocityKms(body.mass, estimateRadiusKm(body.mass, body.type));

  tooltip.innerHTML = `
    <div class="tt-title">${body.label} (${body.type})</div>
    <div class="tt-row"><span class="tt-label">Distance</span><span class="tt-value">${body.distanceAU.toFixed(2)} AU</span></div>
    <div class="tt-row"><span class="tt-label">Mass</span><span class="tt-value">${body.mass.toFixed(2)} M⊕</span></div>
    ${hs > 0 ? `<div class="tt-row"><span class="tt-label">Hill Sphere</span><span class="tt-value">${hs.toExponential(3)} AU</span></div>` : ''}
    ${esc > 0 ? `<div class="tt-row"><span class="tt-label">Esc Vel</span><span class="tt-value">${esc.toFixed(2)} km/s</span></div>` : ''}
  `;

  // Position near cursor (requires storing last mouse pos in state)
  tooltip.style.display = 'block';
}
```

## 6. QA Acceptance

### QA-HS2D-01 — Tooltip appears on hover
**Test**: Load any system, hover mouse over a planet for 200ms. Tooltip appears with correct label, distance, mass, Hill Sphere, and escape velocity.

### QA-HS2D-02 — Tooltip hidden for stars and disks
**Test**: Hover over the primary star or a circumstellar disk. Hill Sphere row is omitted from tooltip.

### QA-HS2D-03 — Tooltip follows cursor
**Test**: Move mouse across multiple bodies. Tooltip updates content and position smoothly without flicker.

### QA-HS2D-04 — Consistency with MWG
**Test**: Generate a system in MWG, note a body's Hill Sphere. Paste into 2D map, hover over same body. Values match within rounding.

### QA-HS2D-05 — No interference with travel planner
**Test**: Activate Travel Planner tab, hover over a body, then click it. Body is selected as origin/destination. Tooltip hides on click.

## 7. Version

- **FRD Version**: 1.0
- **Target 2D Map Version**: Next release after v2.02
