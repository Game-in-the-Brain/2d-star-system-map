# FRD-049: Travel Time Slider & Temporal Navigation

**Project:** 2D Star System Map  
**Version Target:** 1.08+  
**Priority:** P1  
**Depends On:** FRD-048 (Delta-V Travel Planner) — ✅ COMPLETE

---

## 1. Overview

The Travel Planner gains **temporal navigation controls** that let the GM:

1. **Save** the current simulation date as the departure date
2. **Jump** to the calculated arrival window (optimistic or pessimistic)
3. **Scrub** through the entire travel duration with a dedicated time slider
4. **Animate** the spacecraft's ballistic coast from origin to destination

This turns the abstract "42–58 days" result into a tangible, scrubbable timeline.

---

## 2. User Story

> As a GM, I want to see exactly where the planets will be when my ship arrives, so I can plan encounters, describe the approach, and know what the sky looks like at the destination on arrival day.

---

## 3. UI Specification

### 3.1 Departure Date Controls

Replace the simple "Use current simulation date" checkbox with explicit date actions:

```
┌─ Departure Date ─────────────────┐
│ Date: 2300-06-15                 │
│ [📌 Use Current] [🎯 Jump to     │
│  Arrival]                        │
└──────────────────────────────────┘
```

| Button | Action |
|---|---|
| **📌 Use Current** | Sets departure date to the current simulation date (`state.simDayOffset`) and snapshots it into the travel plan. |
| **🎯 Jump to Arrival** | Moves the simulation forward to the **optimistic** arrival day. If the panel is showing results, this snaps the orbits to the arrival configuration. |

### 3.2 Travel Duration Slider

A dedicated slider appears once a transfer has been calculated:

```
┌─ Travel Timeline ────────────────┐
│ Departure          Arrival       │
│ |──────────────────|────────────│
│ 0d                42d           58d│
│              [█]  ← scrubber    │
│                                  │
│ [▶ Play] [⏹ Stop] [↺ Loop]    │
└──────────────────────────────────┘
```

**Slider anatomy:**

```
|=======GREEN=======|====YELLOW====|====RED====|
^                   ^              ^
Departure        Optimistic     Pessimistic
```

- **Green zone** (0 → optimistic): spacecraft is still en route, ahead of schedule
- **Yellow zone** (optimistic → pessimistic): the "likely" arrival window
- **Red zone** (pessimistic → end): overdue, but still possible
- **Scrubber handle** shows current day-of-travel

### 3.3 Playback Controls

| Button | Behaviour |
|---|---|
| **▶ Play** | Animates the slider from 0 to pessimistic arrival at 1 travel-day per real-second (scaled by sim speed). |
| **⏸ Pause** | Pauses playback. |
| **⏹ Stop** | Resets slider to 0 and pauses. |
| **↺ Loop** | Toggles loop mode: when playback reaches pessimistic, it snaps back to 0 and restarts. |

### 3.4 Canvas Visuals During Playback

While the travel slider is active (has focus or is playing):

1. **Fixed transfer chord** — a straight line from origin-at-departure to destination-at-arrival. This chord represents the ballistic intercept trajectory; it does NOT connect the planets' current orbital positions.
2. **Spacecraft sprite** — a small arrow/chevron drawn at the interpolated position along the transfer chord
3. **Day counter** — label near the spacecraft: "Day 23 / 58"
4. **Origin/destination rings** — remain visible
5. **Transfer line** — solid blue in the travelled portion, dashed in the remaining portion

---

## 4. Data Model

### 4.1 Types

```typescript
// Additions to src/types.ts

export interface TravelTimelineState {
  /** Day within the travel duration (0 = departure) */
  travelDayOffset: number;
  /** Is the timeline playing? */
  isPlaying: boolean;
  /** Loop mode enabled */
  isLooping: boolean;
  /** Playback speed multiplier */
  playbackSpeed: number;
}

export interface TravelPlannerState {
  // ... existing fields ...
  timeline: TravelTimelineState;
  /** The simDayOffset that was saved as departure */
  pinnedDepartureDayOffset: number | null;
}
```

### 4.2 Computed Positions

Given `travelDayOffset` and a `TravelPlan`, the spacecraft position is interpolated along the **transfer chord** — the straight-line ballistic path from the origin's departure position to the destination's **future** arrival position:

```typescript
function getSpacecraftPosition(
  plan: TravelPlan,
  travelDayOffset: number,
  allBodies: SceneBody[]
): Point {
  // Origin at the moment of departure (fixed)
  const originPos = getBodyPositionAU(
    originBody,
    plan.departureDayOffset,
    allBodies
  );

  // Destination at the moment of arrival (fixed target)
  const destPos = getBodyPositionAU(
    destBody,
    plan.departureDayOffset + plan.pessimisticArrivalDays,
    allBodies
  );

  // Linear interpolation along the transfer chord
  const t = travelDayOffset / plan.pessimisticArrivalDays;
  return {
    x: originPos.x + (destPos.x - originPos.x) * t,
    y: originPos.y + (destPos.y - originPos.y) * t,
  };
}
```

> **Key insight:** The spacecraft does not chase the destination's *current* position. It aims at where the destination **will be** at arrival time and coasts ballistically toward that intercept point. The transfer line is therefore drawn from origin-at-departure → destination-at-arrival, and the spacecraft scrubs along that fixed chord.

---

## 5. Interaction Flow

### 5.1 Typical Session

```
1. GM clicks Travel Planner tab
2. Selects Origin (Earth) and Destination (Mars)
3. Clicks 🚀 Calculate Transfer → results: 42–58 days
4. Clicks 📌 Use Current → departure date locked to today
5. Clicks ▶ Play on timeline → watches spacecraft coast for 58 sim-days
6. At day 42, clicks ⏸ Pause → inspects Mars position at optimistic arrival
7. Clicks 🎯 Jump to Arrival → simulation jumps to day 42
8. GM switches to Map tab → sees Mars exactly where the ship arrives
```

### 5.2 Pinning Behaviour

- **Before pinning:** "Use current simulation date" checkbox behaviour (live-linked)
- **After pinning:** Departure date is frozen. Scrubbing the timeline does NOT affect the departure date — it only changes the "current travel day" overlay.
- **Unpin:** Clicking 📌 again re-snapshots the current simulation date.

---

## 6. Implementation Plan

### 6.1 Files

| File | Change |
|---|---|
| `src/types.ts` | Add `TravelTimelineState`, extend `TravelPlannerState` |
| `src/travelTimeline.ts` | **NEW** — Slider logic, playback loop, spacecraft position interpolation |
| `src/travelRenderer.ts` | **NEW** — Draw spacecraft sprite, day counter, coloured timeline zones on canvas |
| `src/travelPlanner.ts` | Wire 📌 and 🎯 buttons; initialise timeline; update distance context from slider |
| `index.html` | Add timeline slider, playback buttons, zone-coloured track |
| `src/styles.css` | Slider styling with green/yellow/red zones |
| `src/renderer.ts` | Call travel renderer during timeline playback |

### 6.2 Playback Loop

```typescript
// Inside travelTimeline.ts
let lastFrame = performance.now();

function tick(now: number) {
  if (!timeline.isPlaying) return;
  const dt = (now - lastFrame) / 1000; // real seconds
  lastFrame = now;

  // 1 sim-day per real-second × playbackSpeed
  timeline.travelDayOffset += dt * timeline.playbackSpeed;

  if (timeline.travelDayOffset >= plan.pessimisticArrivalDays) {
    if (timeline.isLooping) {
      timeline.travelDayOffset = 0;
    } else {
      timeline.travelDayOffset = plan.pessimisticArrivalDays;
      timeline.isPlaying = false;
    }
  }

  // Sync simulation date to departure + travel offset
  state.simDayOffset = plan.departureDayOffset + timeline.travelDayOffset;

  requestAnimationFrame(tick);
}
```

### 6.3 Canvas Spacecraft Drawing

The spacecraft is drawn along the **fixed transfer chord** (origin-at-departure → destination-at-arrival), not between the bodies' current orbital positions:

```typescript
function drawSpacecraft(ctx, plan, travelDayOffset, allBodies, state) {
  const origin = allBodies.find(b => b.id === plan.originId);
  const dest = allBodies.find(b => b.id === plan.destinationId);
  if (!origin || !dest) return;

  // Compute fixed endpoints in AU-space
  const originPosAU = getBodyPositionAU(origin, plan.departureDayOffset, allBodies);
  const destPosAU = getBodyPositionAU(dest, plan.departureDayOffset + plan.pessimisticArrivalDays, allBodies);

  // Convert to screen coordinates
  const cx = state.width / 2;
  const cy = state.height / 2;
  const originScreen = worldToScreen(originPosAU, state.camera, cx, cy);
  const destScreen = worldToScreen(destPosAU, state.camera, cx, cy);

  const t = travelDayOffset / plan.pessimisticArrivalDays;
  const x = originScreen.x + (destScreen.x - originScreen.x) * t;
  const y = originScreen.y + (destScreen.y - originScreen.y) * t;

  // Transfer chord line (solid = travelled, dashed = remaining)
  ctx.save();
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(originScreen.x, originScreen.y);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(destScreen.x, destScreen.y);
  ctx.stroke();
  ctx.restore();

  // Small chevron pointing toward destination-at-arrival
  const angle = Math.atan2(destScreen.y - originScreen.y, destScreen.x - originScreen.x);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -3);
  ctx.lineTo(-4, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Day counter label
  ctx.fillStyle = 'rgba(200,220,255,0.9)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(`Day ${Math.round(travelDayOffset)}`, x + 8, y - 8);
}
```

---

## 7. Milestones

### M1: Pin, Jump, and Timeline Slider

- [ ] 📌 "Use Current" button snapshots departure date
- [ ] 🎯 "Jump to Arrival" button sets `simDayOffset = departure + optimistic`
- [ ] Range slider scrubs from 0 to pessimistic arrival days
- [ ] Slider track coloured green/yellow/red for zones
- [ ] Day counter label updates as slider moves

### M2: Playback & Canvas Sprite

- [ ] ▶ Play / ⏸ Pause / ⏹ Stop / ↺ Loop buttons
- [ ] Spacecraft chevron drawn on canvas at interpolated position
- [ ] Playback loop syncs `simDayOffset` so planets animate in real-time
- [ ] Loop mode restarts automatically

### M3: Polish

- [ ] Transfer line shows solid for travelled portion, dashed for remaining
- [ ] Distance label updates during playback
- [ ] Keyboard shortcuts: `Space` = play/pause, `Home` = day 0, `End` = pessimistic
- [ ] Build passes zero TypeScript errors

---

## 8. Acceptance Criteria

- [x] GM can pin current simulation date as departure with one click
- [x] GM can jump simulation to optimistic arrival date with one click
- [x] Slider scrubs entire travel duration with coloured zones
- [x] Playback animates spacecraft along transfer line at configurable speed
- [x] During playback, planets animate to show their real positions on each travel day
- [x] Loop mode works
- [x] No regression in Map tab, System Editor, or existing travel planner features
- [x] Build passes zero TypeScript errors

---

## 9. Related FRDs

- FRD-048 (Delta-V Travel Planner) — ✅ DONE
- FRD-049 (Travel Time Slider) — THIS DOCUMENT

---

## 10. Open Questions

1. **True ballistic arc vs linear interpolation:** For v1 we lerp. A future version could solve the Lambert problem for a visually curved transfer trajectory.
2. **Mid-course correction burns:** Should the slider allow plotting correction burns (e.g. "day 20, burn 0.5 km/s")? Deferred to v1.1.
3. **Multiple legs:** If a route has a refuelling stop, the timeline would need multiple segments. Deferred until multi-leg journeys are spec'd.
