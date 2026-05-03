import type { AppState } from './types';
import { zoomTo, pan } from './camera';
import { handleTravelPlannerClick, refreshTravelPanel, findBodyAtScreenPos } from './travelPlanner';

export function initInputHandlers(state: AppState, onReset: () => void): void {
  const canvas = state.canvas!;
  if (!canvas) return;

  // Mouse drag state
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let lastMouseX = 0;
  let lastMouseY = 0;
  const CLICK_THRESHOLD_PX = 4;

  // Touch state
  let lastTouches: TouchList | null = null;
  let lastPinchDistance = 0;

  // Double-tap detection
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  // Long-press detection
  let longPressTimer: number | null = null;
  let longPressStartPos = { x: 0, y: 0 };
  const LONG_PRESS_MS = 600;
  const LONG_PRESS_MOVE_THRESHOLD = 10;
  let isLongPress = false;

  // Context menu state
  let contextMenuOpen = false;

  function getMousePos(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function getTouchCenter(touches: TouchList): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    let x = 0;
    let y = 0;
    for (let i = 0; i < touches.length; i++) {
      x += touches[i].clientX - rect.left;
      y += touches[i].clientY - rect.top;
    }
    return { x: x / touches.length, y: y / touches.length };
  }

  function getPinchDistance(touches: TouchList): number {
    if (touches.length < 2) return 0;
    const rect = canvas.getBoundingClientRect();
    const dx = (touches[0].clientX - rect.left) - (touches[1].clientX - rect.left);
    const dy = (touches[0].clientY - rect.top) - (touches[1].clientY - rect.top);
    return Math.hypot(dx, dy);
  }

  function hideContextMenu() {
    const menu = document.getElementById('canvas-context-menu');
    if (menu) menu.style.display = 'none';
    contextMenuOpen = false;
  }

  function showContextMenu(screenX: number, screenY: number) {
    const body = findBodyAtScreenPos(screenX, screenY, state);
    if (!body) return;

    let menu = document.getElementById('canvas-context-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'canvas-context-menu';
      menu.className = 'canvas-context-menu';
      document.body.appendChild(menu);
    }

    const tp = state.travelPlanner;
    const isOrigin = tp?.originId === body.id;
    const isDest = tp?.destinationId === body.id;
    const isBarycenter = state.viewMode === 'barycenter';

    menu.innerHTML = `
      ${!isBarycenter ? `
      <div class="ctx-item" data-action="origin" data-body-id="${body.id}">
        ${isOrigin ? '✓ ' : ''}🚀 Set as Origin
      </div>
      <div class="ctx-item" data-action="dest" data-body-id="${body.id}">
        ${isDest ? '✓ ' : ''}🎯 Set as Destination
      </div>
      ` : ''}
      <div class="ctx-item" data-action="details" data-body-id="${body.id}">
        ℹ️ View Details
      </div>
      <div class="ctx-item ctx-cancel" data-action="cancel">✕ Cancel</div>
    `;

    // Position with viewport clamping
    const menuWidth = 180;
    const menuHeight = 160;
    let left = screenX + 10;
    let top = screenY + 10;
    if (left + menuWidth > window.innerWidth) left = screenX - menuWidth - 10;
    if (top + menuHeight > window.innerHeight) top = screenY - menuHeight - 10;
    if (left < 0) left = 4;
    if (top < 0) top = 4;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.display = 'block';
    contextMenuOpen = true;

    // Wire up click handlers
    menu.querySelectorAll('.ctx-item').forEach((el) => {
      const item = el as HTMLElement;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        const bodyId = item.dataset.bodyId;
        if (!bodyId) {
          hideContextMenu();
          return;
        }
        handleContextAction(action!, bodyId);
        hideContextMenu();
      });
    });
  }

  function handleContextAction(action: string, bodyId: string) {
    const tp = state.travelPlanner;
    if (!tp) return;

    const body = state.bodies.find((b) => b.id === bodyId);
    if (!body) return;

    // Switch to Travel tab
    const travelTab = document.querySelector('.tab-btn[data-tab="travel"]') as HTMLElement | null;
    if (travelTab) travelTab.click();

    if (action === 'origin') {
      if (tp.originId === bodyId) {
        tp.originId = null;
      } else {
        tp.originId = bodyId;
      }
    } else if (action === 'dest') {
      if (tp.destinationId === bodyId) {
        tp.destinationId = null;
      } else {
        tp.destinationId = bodyId;
      }
    } else if (action === 'details') {
      // Show a brief alert with body info (placeholder for richer detail view)
      alert(`${body.label}\nType: ${body.type}\nDistance: ${body.distanceAU.toFixed(2)} AU\nMass: ${body.mass} EM`);
      return;
    }

    refreshTravelPanel(state);
  }

  function handleDoubleTap(screenX: number, screenY: number) {
    const body = findBodyAtScreenPos(screenX, screenY, state);
    if (!body) return;

    const tp = state.travelPlanner;
    if (!tp) return;

    // No travel planning in barycenter view
    if (state.viewMode === 'barycenter') return;

    // Switch to Travel tab
    const travelTab = document.querySelector('.tab-btn[data-tab="travel"]') as HTMLElement | null;
    if (travelTab) travelTab.click();

    // Toggle selection: double-tap selected = unselect
    if (body.id === tp.originId) {
      tp.originId = null;
    } else if (body.id === tp.destinationId) {
      tp.destinationId = null;
    } else if (!tp.originId) {
      tp.originId = body.id;
    } else if (!tp.destinationId) {
      tp.destinationId = body.id;
    } else {
      // Both filled → replace destination
      tp.destinationId = body.id;
    }

    refreshTravelPanel(state);
  }

  // ── Wheel zoom ──
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const pos = getMousePos(e);
    const cx = state.width / 2;
    const cy = state.height / 2;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    zoomTo(state.camera, pos, cx, cy, zoomFactor);
  }, { passive: false });

  // ── Mouse drag / click ──
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left click
    isDragging = true;
    const pos = getMousePos(e);
    dragStartX = pos.x;
    dragStartY = pos.y;
    lastMouseX = pos.x;
    lastMouseY = pos.y;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const pos = getMousePos(e);
    const dx = pos.x - lastMouseX;
    const dy = pos.y - lastMouseY;
    pan(state.camera, dx, dy);
    lastMouseX = pos.x;
    lastMouseY = pos.y;
  });

  window.addEventListener('mouseup', (e) => {
    if (isDragging) {
      const dx = lastMouseX - dragStartX;
      const dy = lastMouseY - dragStartY;
      if (Math.hypot(dx, dy) < CLICK_THRESHOLD_PX) {
        // Treat as click
        if (contextMenuOpen) {
          hideContextMenu();
        } else {
          const pos = getMousePos(e);
          if (handleTravelPlannerClick(pos.x, pos.y, state)) {
            refreshTravelPanel(state);
          }
        }
      }
    }
    isDragging = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    const pos = getMousePos(e);
    state.lastMouseX = pos.x;
    state.lastMouseY = pos.y;

    if (!isDragging) {
      const body = findBodyAtScreenPos(pos.x, pos.y, state);
      const prevId = state.hoveredBodyId;
      state.hoveredBodyId = body?.id ?? null;
      if (prevId !== state.hoveredBodyId) {
        canvas.style.cursor = body ? 'pointer' : 'default';
      }
    }
  });

  canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    state.hoveredBodyId = null;
  });

  // ── Right-click context menu (desktop) ──
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const pos = getMousePos(e);
    showContextMenu(pos.x, pos.y);
  });

  // ── Touch: long-press, double-tap, pan, pinch ──
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    hideContextMenu();
    lastTouches = e.touches;

    if (e.touches.length === 2) {
      lastPinchDistance = getPinchDistance(e.touches);
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      isLongPress = false;
      return;
    }

    if (e.touches.length === 1) {
      const pos = getTouchCenter(e.touches);
      longPressStartPos = pos;
      isLongPress = false;

      // Double-tap detection
      const now = Date.now();
      const dist = Math.hypot(pos.x - lastTapX, pos.y - lastTapY);
      if (now - lastTapTime < 300 && dist < 30) {
        // Cancel long press and handle double-tap
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        handleDoubleTap(pos.x, pos.y);
        lastTapTime = 0; // Reset to prevent triple-tap
        return;
      }

      lastTapTime = now;
      lastTapX = pos.x;
      lastTapY = pos.y;

      // Start long-press timer
      longPressTimer = window.setTimeout(() => {
        isLongPress = true;
        showContextMenu(pos.x, pos.y);
      }, LONG_PRESS_MS);
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!lastTouches || e.touches.length === 0) return;

    // Cancel long press if finger moves too far
    if (longPressTimer && e.touches.length === 1) {
      const pos = getTouchCenter(e.touches);
      if (Math.hypot(pos.x - longPressStartPos.x, pos.y - longPressStartPos.y) > LONG_PRESS_MOVE_THRESHOLD) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    const cx = state.width / 2;
    const cy = state.height / 2;

    if (e.touches.length === 1 && lastTouches.length >= 1) {
      // Pan
      const prev = getTouchCenter(lastTouches);
      const curr = getTouchCenter(e.touches);
      pan(state.camera, curr.x - prev.x, curr.y - prev.y);
    } else if (e.touches.length === 2 && lastTouches.length >= 2) {
      // Pinch zoom
      const prevDist = lastPinchDistance || getPinchDistance(lastTouches);
      const currDist = getPinchDistance(e.touches);
      if (prevDist > 0 && currDist > 0) {
        const factor = currDist / prevDist;
        const center = getTouchCenter(e.touches);
        zoomTo(state.camera, center, cx, cy, factor);
        lastPinchDistance = currDist;
      }
    }

    lastTouches = e.touches;
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    // Single-tap detection: if not a long press and finger lifted cleanly
    const changedTouches = e.changedTouches;
    if (changedTouches.length === 1 && !isLongPress && e.touches.length === 0) {
      const pos = getTouchCenter(changedTouches);
      // Only process as tap if we didn't just handle a double-tap
      const now = Date.now();
      if (now - lastTapTime >= 300 || Math.hypot(pos.x - lastTapX, pos.y - lastTapY) >= 30) {
        if (contextMenuOpen) {
          hideContextMenu();
        } else {
          if (handleTravelPlannerClick(pos.x, pos.y, state)) {
            refreshTravelPanel(state);
          }
        }
      }
    }

    lastTouches = e.touches;
    if (e.touches.length < 2) {
      lastPinchDistance = 0;
    }
  });

  canvas.addEventListener('touchcancel', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    lastTouches = null;
    lastPinchDistance = 0;
  });

  // ── Double-click (desktop fallback) ──
  canvas.addEventListener('dblclick', () => {
    // Disabled: double-click now handled by touch logic or right-click menu
    // onReset is still available via the Reset View button
  });
}
