# FRD-046: Star Page Save + MWG Inline Editor

**Project:** 2D Star System Map  
**Version Target:** 0.3.0  
**Priority:** P1  
**Depends On:** FRD-044 (MWG integration) — ✅ COMPLETE

---

## 1. Overview

The 2D Star System Map gains the ability to **save a complete HTML page** for any star. The saved page is a self-contained snapshot of that star's 2D view including its MWG system data, and can be viewed offline or shared.

Additionally, a new **MWG Editor tab** inside the 2D map allows inline editing of MWG system data: rename worlds, add GM notes, adjust stats, and export to DOCX/CSV/JSON — without leaving the 2D map.

---

## 2. User Story

> As a GM, I want to save a star's 2D map page complete with its world data so I can reference it during a session or share it with players.

---

## 3. Save Star Page

### 3.1 Save Button

In the 2D map toolbar, add a **💾 Save Page** button:

```
┌─ Toolbar ────────────────────────┐
│ [🎲 Random] [🔍 Search] [💾 Save Page] [📤 Export] │
└──────────────────────────────────┘
```

### 3.2 Saved Page Contents

The downloaded HTML file contains:

1. **Complete 2D map renderer** (self-contained JS)
2. **Star data** (position, spectral type, magnitude)
3. **MWG system data** (if loaded)
4. **GM notes** (if any)
5. **Last updated timestamp**

```html
<!DOCTYPE html>
<html>
<head>
  <title>Sol — Star System Map</title>
  <script>/* inline 2D map renderer */</script>
  <style>/* inline styles */</style>
</head>
<body>
  <div id="star-data" data-json='{...}'></div>
  <div id="mwg-data" data-json='{...}'></div>
  <div id="gm-notes" data-json='{...}'></div>
  <canvas id="map"></canvas>
</body>
</html>
```

### 3.3 Sync to 3D Map

When saving, also push the HTML to the **3D map's IndexedDB** via a shared storage key:

```typescript
// 3D map reads this when user clicks "Open 2D Map" in context panel
localStorage.setItem(`mneme-2dmap-${starId}`, htmlString);
```

---

## 4. MWG Editor Tab

### 4.1 New Tab: "System Editor"

```
┌─ 2D Star System Map ─────────────┐
│ [Map] [Orbits] [System Editor]   │  ← New tab
└──────────────────────────────────┘
```

### 4.2 Editor UI

When MWG data is loaded, show editable fields:

```
┌─ System Editor ──────────────────┐
│ System Name: [Sol____________]   │
│                                  │
│ Primary Star                     │
│   Class: [G ▼] Grade: [2 ▼]     │
│   Mass: 1.04 M☉  Lum: 1.41 L☉   │
│                                  │
│ Main World                       │
│   Type: [Terrestrial ▼]          │
│   Size: 12756 km                 │
│   Gravity: 1.0 g                 │
│   Atmosphere: [Average ▼]        │
│   Temperature: [Average ▼]       │
│   Hazard: [None ▼]               │
│   Habitability: 5                │
│                                  │
│ Inhabitants                      │
│   Population: [8,000,000,000]    │
│   Tech Level: [9]                │
│   Starport: [A ▼]                │
│   Government: [Democracy ▼]      │
│   Travel Zone: [Green ▼]         │
│                                  │
│ GM Notes                         │
│   [Free text area____________]   │
│                                  │
│ [📄 Export DOCX] [📊 Export CSV] │
│ [📤 Export JSON] [💾 Save]       │
└──────────────────────────────────┘
```

### 4.3 Export Functions

Leverage MWG's existing export code (copied or shared):

- **DOCX**: Uses `exportToDocx()` from MWG
- **CSV**: Uses `exportToCSV()` from MWG  
- **JSON**: Standard `JSON.stringify()` of the system object

---

## 5. Data Model: SavedStarPage

```typescript
interface SavedStarPage {
  starId: string;
  starName: string;
  savedAt: string;
  htmlContent: string;      // Full self-contained HTML
  mwgSystem?: StarSystem;   // MWG data (if present)
  gmNotes: string;
  version: string;
}
```

---

## 6. Integration with 3D Map

### 6.1 Storage Sharing

Both apps read/write to the same `localStorage` / IndexedDB namespace:

```
Key: `mneme-2dmap-${starId}`
Value: SavedStarPage (JSON or HTML string)
```

### 6.2 3D Map Context Panel Flow

```
3D Map Context Panel
  ├─ "🗺️ Open 2D Map" 
  │   └─ Checks `localStorage.getItem('mneme-2dmap-' + starId)`
  │   └─ If found → opens saved HTML in new tab
  │   └─ If not found → opens live 2D map with starId param
  │
  └─ "📂 Load MWG JSON"
      └─ File picker → attaches MWG data to star
      └─ Enables "View in MWG" link
```

---

## 7. Acceptance Criteria

- [x] "Save Page" button downloads self-contained HTML
- [x] Saved HTML renders the star correctly offline
- [x] Saved HTML includes MWG data if present
- [x] Saved page syncs to shared storage for 3D map access
- [x] "System Editor" tab appears when MWG data loaded
- [x] Editor allows renaming star and world
- [x] Editor allows editing dropdown fields (class, grade, type, etc.)
- [x] Editor has GM notes free-text area
- [x] Export to DOCX works
- [x] Export to CSV works
- [x] Export to JSON works
- [x] Changes persist to localStorage
- [x] Build passes zero TypeScript errors

---

## 8. Related FRDs

- FRD-044 (MWG Bidirectional Integration) — ✅ DONE
- FRD-045 (3D Starmap Star Generation) — QUEUED
- FRD-047 (MWG Batch Management) — QUEUED
