import type { AppState, SceneBody, TravelPlan, TravelPlannerState, Point } from './types';
import { buildTravelPlan } from './travelPhysics';
import { logScaleDistance } from './camera';


export function createTravelPlannerState(): TravelPlannerState {
  return {
    originId: null,
    destinationId: null,
    deltaVBudget: 20,
    useSimDate: true,
    customDepartureDayOffset: 0,
    lastPlan: null,
    isActive: false,
  };
}

/**
 * Compute a body's screen position using the same log-scaled orbital
 * distances that the renderer uses.  This is essential for accurate
 * hit-testing against the visually rendered bodies.
 */
function getBodyScreenPos(body: SceneBody, state: AppState): Point | null {
  const { camera, width, height, simDayOffset, bodies } = state;
  const cx = width / 2;
  const cy = height / 2;
  const originX = cx - camera.x * camera.zoom;
  const originY = cy - camera.y * camera.zoom;

  if (!body.parentId) {
    const period = body.periodDays;
    const angle = body.angle + (period > 0 ? (2 * Math.PI * simDayOffset) / period : 0);
    const distPx = body.distanceAU > 0 ? logScaleDistance(body.distanceAU, 80) * camera.zoom : 0;
    return {
      x: originX + Math.cos(angle) * distPx,
      y: originY + Math.sin(angle) * distPx,
    };
  }

  // Moon — compute parent position first, then add moon offset
  const parent = bodies.find((b) => b.id === body.parentId);
  if (!parent) return null;
  const parentPos = getBodyScreenPos(parent, state);
  if (!parentPos) return null;

  const period = body.periodDays;
  const angle = body.angle + (period > 0 ? (2 * Math.PI * simDayOffset) / period : 0);
  const rawMoonDist = body.moonOrbitAU ? body.moonOrbitAU * 200 * camera.zoom : 0;
  const parentDistPx = Math.hypot(parentPos.x - originX, parentPos.y - originY);
  const maxMoonDist = parentDistPx * 0.25;
  const moonDistPx = Math.max(6, Math.min(maxMoonDist, rawMoonDist));

  return {
    x: parentPos.x + Math.cos(angle) * moonDistPx,
    y: parentPos.y + Math.sin(angle) * moonDistPx,
  };
}

/**
 * Find the body at the given screen position.
 *
 * Rules:
 * 1. Iterate in reverse render order (last-drawn = top-most = picked first).
 * 2. Hit radius = body's visual radius × zoom (no minimum floor).
 * 3. Skip bodies whose centre is off-screen (with 40 px margin).
 */
export function findBodyAtScreenPos(
  screenX: number,
  screenY: number,
  state: AppState
): SceneBody | null {
  const { bodies, camera, width, height } = state;
  if (!bodies.length) return null;

  const margin = 40;
  let nearest: SceneBody | null = null;
  let nearestDist = Infinity;

  // Reverse iteration = top-most layer first
  for (let i = bodies.length - 1; i >= 0; i--) {
    const body = bodies[i];
    const screenPos = getBodyScreenPos(body, state);
    if (!screenPos) continue;

    // Visibility culling: skip off-screen centres
    if (
      screenPos.x < -margin ||
      screenPos.x > width + margin ||
      screenPos.y < -margin ||
      screenPos.y > height + margin
    ) {
      continue;
    }

    const dist = Math.hypot(screenPos.x - screenX, screenPos.y - screenY);

    // Hit radius = exact visual size, scaling with zoom
    const hitR = Math.max(body.radiusPx * camera.zoom, 2);
    if (dist < hitR && dist < nearestDist) {
      nearest = body;
      nearestDist = dist;
    }
  }

  return nearest;
}

/**
 * Initialise the Travel Planner UI and wire up controls.
 */
export function initTravelPlanner(state: AppState): void {
  if (!state.travelPlanner) {
    state.travelPlanner = createTravelPlannerState();
  }

  const tp = state.travelPlanner;

  // DOM refs
  const travelEmpty = document.getElementById('travel-empty');
  const travelForm = document.getElementById('travel-form');
  const travelOrigin = document.getElementById('travel-origin');
  const travelDestination = document.getElementById('travel-destination');
  const deltaVInput = document.getElementById('travel-delta-v') as HTMLInputElement | null;
  const useSimDateCheck = document.getElementById('travel-use-sim-date') as HTMLInputElement | null;
  const departureDateInput = document.getElementById('travel-departure-date') as HTMLInputElement | null;
  const btnCalculate = document.getElementById('btn-calculate-transfer') as HTMLButtonElement | null;
  const btnClear = document.getElementById('btn-clear-travel') as HTMLButtonElement | null;
  const travelResults = document.getElementById('travel-results');

  // Result fields
  const resEscapeOrigin = document.getElementById('res-escape-origin');
  const resCaptureDest = document.getElementById('res-capture-dest');
  const resExcessDv = document.getElementById('res-excess-dv');
  const resOptimistic = document.getElementById('res-optimistic');
  const resLikely = document.getElementById('res-likely');
  const resPessimistic = document.getElementById('res-pessimistic');
  const resNextWindow = document.getElementById('res-next-window');

  function updatePanel() {
    const hasOrigin = tp.originId !== null;
    const hasDest = tp.destinationId !== null;

    if (travelEmpty) travelEmpty.style.display = hasOrigin ? 'none' : 'block';
    if (travelForm) travelForm.style.display = hasOrigin ? 'flex' : 'none';

    if (travelOrigin && hasOrigin) {
      const body = state.bodies.find((b) => b.id === tp.originId);
      travelOrigin.textContent = body ? `${body.label} (${body.type})` : '—';
    }
    if (travelDestination && hasDest) {
      const body = state.bodies.find((b) => b.id === tp.destinationId);
      travelDestination.textContent = body ? `${body.label} (${body.type})` : '—';
    }

    if (btnCalculate) {
      btnCalculate.disabled = !(hasOrigin && hasDest && tp.originId !== tp.destinationId);
    }
  }

  function formatDays(days: number): string {
    if (days >= 365) {
      const y = Math.floor(days / 365);
      const d = Math.round(days % 365);
      return d > 0 ? `${y}y ${d}d` : `${y}y`;
    }
    return `${Math.round(days)}d`;
  }

  function displayResults(plan: TravelPlan) {
    if (!travelResults) return;
    travelResults.style.display = 'flex';

    if (resEscapeOrigin) resEscapeOrigin.textContent = `${plan.escapeOriginKms} km/s`;
    if (resCaptureDest) resCaptureDest.textContent = `${plan.captureDestKms} km/s`;

    if (resExcessDv) {
      resExcessDv.textContent = `${plan.excessDeltaVKms} km/s`;
      resExcessDv.className = 'travel-result-value ' + (plan.isPossible ? 'possible' : 'impossible');
    }

    if (resOptimistic) {
      resOptimistic.textContent = plan.isPossible ? formatDays(plan.optimisticArrivalDays) : '—';
    }
    if (resLikely) {
      const lo = plan.optimisticArrivalDays;
      const hi = plan.pessimisticArrivalDays;
      resLikely.textContent = plan.isPossible ? `${formatDays(lo)}–${formatDays(hi)}` : '—';
    }
    if (resPessimistic) {
      resPessimistic.textContent = plan.isPossible ? formatDays(plan.pessimisticArrivalDays) : '—';
    }
    if (resNextWindow) {
      const windowDate = new Date(state.epochDate.getTime() + plan.nextWindowDayOffset * 86400000);
      resNextWindow.textContent = windowDate.toISOString().split('T')[0];
    }
  }

  function calculateTransfer() {
    if (!tp.originId || !tp.destinationId) return;
    const origin = state.bodies.find((b) => b.id === tp.originId);
    const destination = state.bodies.find((b) => b.id === tp.destinationId);
    if (!origin || !destination) return;

    const budget = parseFloat(deltaVInput?.value ?? '20');
    const departureOffset = tp.useSimDate
      ? state.simDayOffset
      : tp.customDepartureDayOffset;

    const plan = buildTravelPlan(origin, destination, budget, departureOffset, state.bodies);
    tp.lastPlan = plan;
    displayResults(plan);
  }

  function clearSelection() {
    tp.originId = null;
    tp.destinationId = null;
    tp.lastPlan = null;
    if (travelResults) travelResults.style.display = 'none';
    updatePanel();
  }

  // Track active tab by polling class list (editor.ts handles the actual switching)
  function checkActive() {
    const tabBtn = document.querySelector('.tab-btn[data-tab="travel"]');
    const wasActive = tp.isActive;
    tp.isActive = tabBtn?.classList.contains('active') ?? false;
    if (tp.isActive && !wasActive) {
      updatePanel();
    }
  }
  setInterval(checkActive, 200);

  // Inputs
  if (deltaVInput) {
    deltaVInput.addEventListener('change', () => {
      tp.deltaVBudget = parseFloat(deltaVInput.value) || 20;
    });
  }

  if (useSimDateCheck) {
    useSimDateCheck.addEventListener('change', () => {
      tp.useSimDate = useSimDateCheck.checked;
      if (departureDateInput) {
        departureDateInput.style.display = tp.useSimDate ? 'none' : 'block';
      }
    });
  }

  if (departureDateInput) {
    departureDateInput.addEventListener('change', () => {
      if (departureDateInput.valueAsDate) {
        const msDiff = departureDateInput.valueAsDate.getTime() - state.epochDate.getTime();
        tp.customDepartureDayOffset = Math.round(msDiff / 86400000);
      }
    });
  }

  if (btnCalculate) {
    btnCalculate.addEventListener('click', calculateTransfer);
  }

  if (btnClear) {
    btnClear.addEventListener('click', clearSelection);
  }

  updatePanel();
}

/**
 * Handle a canvas click while the Travel Planner is active.
 * Returns true if the click was consumed (body selected).
 */
export function handleTravelPlannerClick(
  screenX: number,
  screenY: number,
  state: AppState
): boolean {
  const tp = state.travelPlanner;
  if (!tp || !tp.isActive) return false;

  const body = findBodyAtScreenPos(screenX, screenY, state);

  if (!body) {
    // Click on empty space → clear everything
    tp.originId = null;
    tp.destinationId = null;
    tp.lastPlan = null;
    refreshTravelPanel(state);
    return true;
  }

  if (body.id === tp.originId) {
    // Click origin again → clear origin, promote destination if present
    tp.originId = tp.destinationId;
    tp.destinationId = null;
  } else if (body.id === tp.destinationId) {
    // Click destination again → clear destination only
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
  return true;
}

/**
 * Refresh the Travel Planner panel UI (called after selection changes).
 */
export function refreshTravelPanel(state: AppState): void {
  const tp = state.travelPlanner;
  if (!tp) return;

  const travelEmpty = document.getElementById('travel-empty');
  const travelForm = document.getElementById('travel-form');
  const travelOrigin = document.getElementById('travel-origin');
  const travelDestination = document.getElementById('travel-destination');
  const btnCalculate = document.getElementById('btn-calculate-transfer') as HTMLButtonElement | null;

  const hasOrigin = tp.originId !== null;
  const hasDest = tp.destinationId !== null;

  if (travelEmpty) travelEmpty.style.display = hasOrigin ? 'none' : 'block';
  if (travelForm) travelForm.style.display = hasOrigin ? 'flex' : 'none';

  if (travelOrigin && hasOrigin) {
    const body = state.bodies.find((b) => b.id === tp.originId);
    travelOrigin.textContent = body ? `${body.label} (${body.type})` : '—';
  }
  if (travelDestination && hasDest) {
    const body = state.bodies.find((b) => b.id === tp.destinationId);
    travelDestination.textContent = body ? `${body.label} (${body.type})` : '—';
  }

  if (btnCalculate) {
    btnCalculate.disabled = !(hasOrigin && hasDest && tp.originId !== tp.destinationId);
  }
}
