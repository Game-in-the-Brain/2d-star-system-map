# 2D Star System Map — Collapsible Control Panel Proposal

**Date:** 2026-04-18  
**Project:** `2d-star-system-map`  
**Status:** ✅ Implemented

---

## Problem Statement

On mobile phones and narrow viewports, the control panel ("action tab") occupies a dominant portion of the screen. At widths ≤ 360 px it spans nearly the full width, leaving insufficient space to interact with the canvas — panning, zooming, and selecting bodies become obstructed or impossible.

## Proposed Solution

Add a **collapsible control panel** with the following behaviour:

1. **Close button (✕)** fixed to the top-right corner of the panel. One tap hides the entire panel.
2. **Floating action button (☰)** appears at the same top-left anchor when the panel is hidden. High-contrast styling ensures visibility against the dark starfield.
3. **One-tap restore** — clicking the FAB instantly re-opens the panel.
4. **Mobile-first default** — on viewports ≤ 768 px the panel starts collapsed, so the map is immediately usable on phones.
5. **Smooth transition** — CSS opacity + transform animation (200 ms) avoids jarring state changes.

---

## Implementation Details

### Files Modified

| File | Change |
|---|---|
| `index.html` | Added `#btn-collapse-panel` inside `.control-panel`; added `#btn-expand-panel` (FAB) as sibling outside the panel |
| `src/styles.css` | Added `.panel-header`, `.panel-toggle`, `.panel-fab`, and `.control-panel.collapsed` styles |
| `src/uiControls.ts` | Added `setPanelCollapsed()` helper; wired click handlers to both buttons; auto-collapses on `window.innerWidth <= 768` |

### Visual Design

**Expanded panel** (existing look, now with a close button):
- Close button: 24 × 24 px, subtle translucent background, positioned at the top-right of the panel header.

**Collapsed state**:
- Panel: `opacity: 0; pointer-events: none; transform: translateY(-8px)`
- FAB: 40 × 40 px square, `border: 2px solid rgba(255,255,255,0.9)`, `background: rgba(10,15,30,0.9)`, white ☰ icon, soft drop shadow.
- Hover feedback: scale to 1.05, lighten background.

### Accessibility

- Both buttons carry `aria-label` and `title` attributes.
- The FAB is focusable and keyboard-accessible.
- Panel contents are removed from the tab order when collapsed (`pointer-events: none` on the container).

---

## Rationale

| Approach Considered | Why Chosen / Rejected |
|---|---|
| Bottom sheet (slide up from bottom) | Good for phones, but inconsistent with desktop layout and requires larger layout refactor |
| Draggable panel | Adds complexity; users mainly need "get it out of the way" |
| **Collapsible FAB (chosen)** | Minimal code, works on all viewports, preserves existing layout, high-contrast icon is instantly discoverable |

---

## Acceptance Criteria

- [x] Panel can be closed with a single tap/click.
- [x] Collapsed state reveals a high-contrast icon button.
- [x] Icon button restores the panel with a single tap/click.
- [x] On phone-size viewports the panel defaults to collapsed.
- [x] No TypeScript errors; `vite build` passes.
- [x] Touch interactions (pan, pinch-zoom) remain unobstructed when panel is hidden.

---

## Future Enhancements (Optional)

1. **Persist state in `localStorage`** — remember whether the user prefers open or collapsed across sessions.
2. **Swipe gesture** — swipe left on the panel to dismiss it (mobile-only).
3. **Auto-collapse on canvas interaction** — if the user starts panning/zooming, temporarily hide the panel to maximise screen real estate.
