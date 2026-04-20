import type { AppState } from './types';
import { zoomTo, pan } from './camera';
import { handleTravelPlannerClick, refreshTravelPanel } from './travelPlanner';

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

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const pos = getMousePos(e);
    const cx = state.width / 2;
    const cy = state.height / 2;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    zoomTo(state.camera, pos, cx, cy, zoomFactor);
  }, { passive: false });

  canvas.addEventListener('mousedown', (e) => {
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
        const pos = getMousePos(e);
        if (handleTravelPlannerClick(pos.x, pos.y, state)) {
          // Travel planner consumed the click; refresh panel
          refreshTravelPanel(state);
        }
      }
    }
    isDragging = false;
  });

  canvas.addEventListener('mouseleave', () => {
    isDragging = false;
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    lastTouches = e.touches;
    if (e.touches.length === 2) {
      lastPinchDistance = getPinchDistance(e.touches);
    }

    // Double-tap detection
    if (e.touches.length === 1) {
      const pos = getTouchCenter(e.touches);
      const now = Date.now();
      const dist = Math.hypot(pos.x - lastTapX, pos.y - lastTapY);
      if (now - lastTapTime < 300 && dist < 30) {
        onReset();
      }
      lastTapTime = now;
      lastTapX = pos.x;
      lastTapY = pos.y;
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!lastTouches || e.touches.length === 0) return;

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
    lastTouches = e.touches;
    if (e.touches.length < 2) {
      lastPinchDistance = 0;
    }
  });

  canvas.addEventListener('touchcancel', () => {
    lastTouches = null;
    lastPinchDistance = 0;
  });

  canvas.addEventListener('dblclick', () => {
    onReset();
  });
}
