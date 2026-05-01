import type { AppState, SceneBody, TravelPlan, TravelPlannerState, TravelTimelineState, Point, TravelBody } from './types';
import { buildTravelPlan, getBodyPositionAU, computeMinMaxDistanceAU } from './travelPhysics';
import { toTravelBody, calculateTravel, brachistochroneTimeDays } from './travelCalc';
import { logScaleDistance } from './camera';

const HIT_RADIUS_PX = 18;

function createTimelineState(): TravelTimelineState {
  return {
    travelDayOffset: 0,
    isPlaying: false,
    isLooping: false,
    playbackSpeed: 1,
    pinnedDepartureDayOffset: null,
  };
}

export function createTravelPlannerState(): TravelPlannerState {
  return {
    originId: null,
    destinationId: null,
    deltaVBudget: 20,
    useSimDate: true,
    customDepartureDayOffset: 0,
    lastPlan: null,
    isActive: false,
    timeline: createTimelineState(),
    routingMode: 'soi-safe',
    accelG: 0.1,
    useGravityAssists: false,
    useMultiLegChains: false,
    lastCalcResult: null,
  };
}

// Called each animation frame from renderer.ts to advance the travel timeline.
export function tickTravelTimeline(state: AppState, dt: number): void {
  const tp = state.travelPlanner;
  if (!tp || !tp.timeline.isPlaying || !tp.lastPlan?.isPossible) return;

  const plan = tp.lastPlan;
  const tl = tp.timeline;

  tl.travelDayOffset += dt * tl.playbackSpeed * state.speed;

  if (tl.travelDayOffset >= plan.pessimisticArrivalDays) {
    if (tl.isLooping) {
      tl.travelDayOffset = 0;
    } else {
      tl.travelDayOffset = plan.pessimisticArrivalDays;
      tl.isPlaying = false;
      const btnPlay = document.getElementById('btn-timeline-play');
      const btnPause = document.getElementById('btn-timeline-pause');
      if (btnPlay) (btnPlay as HTMLButtonElement).style.display = 'inline-block';
      if (btnPause) (btnPause as HTMLButtonElement).style.display = 'none';
    }
  }

  // Sync global sim date to departure + travel offset so planets animate along the voyage
  const departure = tl.pinnedDepartureDayOffset ?? plan.departureDayOffset;
  state.simDayOffset = departure + tl.travelDayOffset;

  // Keep slider and counter in sync
  const slider = document.getElementById('travel-timeline-slider') as HTMLInputElement | null;
  if (slider) slider.value = String(Math.round(tl.travelDayOffset));

  const counter = document.getElementById('travel-day-counter');
  if (counter) {
    counter.textContent = `Day ${Math.round(tl.travelDayOffset)} / ${Math.round(plan.pessimisticArrivalDays)}`;
  }
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

    // Hit radius = fixed screen-space radius (renderer draws bodies at fixed pixel size)
    const hitR = Math.max(body.radiusPx, 8);
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
  const accelInput = document.getElementById('travel-accel') as HTMLInputElement | null;
  const useSimDateCheck = document.getElementById('travel-use-sim-date') as HTMLInputElement | null;
  const departureDateInput = document.getElementById('travel-departure-date') as HTMLInputElement | null;
  const departureWrapper = document.getElementById('travel-departure-wrapper');
  const btnCalculate = document.getElementById('btn-calculate-transfer') as HTMLButtonElement | null;
  const btnClear = document.getElementById('btn-clear-travel') as HTMLButtonElement | null;
  const travelResults = document.getElementById('travel-results');
  const distanceContext = document.getElementById('travel-distance-context');

  // Toggles
  const soiSafeCheck = document.getElementById('travel-soi-safe') as HTMLInputElement | null;
  const gravityAssistCheck = document.getElementById('travel-gravity-assists') as HTMLInputElement | null;
  const multiLegCheck = document.getElementById('travel-multi-leg') as HTMLInputElement | null;
  const multiLegRow = document.getElementById('travel-multi-leg-row');

  // Result fields
  const resCurrentDist = document.getElementById('res-current-dist');
  const resMinDist = document.getElementById('res-min-dist');
  const resMaxDist = document.getElementById('res-max-dist');
  const resEscapeOrigin = document.getElementById('res-escape-origin');
  const resCaptureDest = document.getElementById('res-capture-dest');
  const resHrsCost = document.getElementById('res-hrs-cost');
  const resExcessDv = document.getElementById('res-excess-dv');
  const resFlightTime = document.getElementById('res-flight-time');
  const resDistance = document.getElementById('res-distance');
  const resNextWindow = document.getElementById('res-next-window');
  const resFailureReason = document.getElementById('res-failure-reason');
  const resOptimistic = document.getElementById('res-optimistic');
  const travelSoiSection = document.getElementById('travel-soi-section');
  const travelSoiList = document.getElementById('travel-soi-list');
  const resSoiDetours = document.getElementById('res-soi-detours');
  const travelWaitSection = document.getElementById('travel-wait-section');
  const resWaitTotal = document.getElementById('res-wait-total');

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

    if (distanceContext) {
      distanceContext.style.display = (hasOrigin && hasDest) ? 'flex' : 'none';
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

  function updateDistanceContext() {
    if (!tp.originId || !tp.destinationId) return;
    const origin = state.bodies.find((b) => b.id === tp.originId);
    const destination = state.bodies.find((b) => b.id === tp.destinationId);
    if (!origin || !destination) return;

    const oPos = getBodyPositionAU(origin, state.simDayOffset, state.bodies);
    const dPos = getBodyPositionAU(destination, state.simDayOffset, state.bodies);
    const currentDist = Math.hypot(dPos.x - oPos.x, dPos.y - oPos.y);
    if (resCurrentDist) resCurrentDist.textContent = `${currentDist.toFixed(2)} AU`;

    const { min, max } = computeMinMaxDistanceAU(origin, destination, state.bodies);
    if (resMinDist) resMinDist.textContent = `${min.toFixed(2)} AU`;
    if (resMaxDist) resMaxDist.textContent = `${max.toFixed(2)} AU`;
  }

  function displayResults(plan: TravelPlan) {
    if (!travelResults) return;
    travelResults.style.display = 'flex';

    if (resEscapeOrigin) resEscapeOrigin.textContent = `${plan.escapeOriginKms} km/s`;
    if (resCaptureDest) resCaptureDest.textContent = `${plan.captureDestKms} km/s`;
    if (resHrsCost) {
      if (plan.hrsCostKms && plan.hrsCostKms > 0) {
        resHrsCost.textContent = `${plan.hrsCostKms} km/s`;
        resHrsCost.style.display = '';
        (resHrsCost.previousElementSibling as HTMLElement | null)!.style.display = '';
      } else {
        resHrsCost.style.display = 'none';
        (resHrsCost.previousElementSibling as HTMLElement | null)!.style.display = 'none';
      }
    }

    if (resExcessDv) {
      resExcessDv.textContent = `${plan.excessDeltaVKms} km/s`;
      resExcessDv.className = 'travel-result-value ' + (plan.isPossible ? 'possible' : 'impossible');
    }

    if (resNextWindow) {
      const windowDate = new Date(state.epochDate.getTime() + plan.nextWindowDayOffset * 86400000);
      resNextWindow.textContent = windowDate.toISOString().split('T')[0];
    }
    if (resFailureReason) {
      if (plan.failureReason) {
        resFailureReason.textContent = plan.failureReason;
        resFailureReason.style.display = 'block';
      } else {
        resFailureReason.style.display = 'none';
      }
    }

    // Also update legacy hidden fields
    if (resOptimistic) {
      resOptimistic.textContent = plan.isPossible ? formatDays(plan.optimisticArrivalDays) : '—';
    }

    updateDistanceContext();
  }

  function displaySoiResults(calcResult: import('./types').TravelResult) {
    if (!travelResults) return;
    travelResults.style.display = 'flex';

    if (resFlightTime) {
      resFlightTime.textContent = `${calcResult.flightTimeDays.toFixed(1)}d`;
    }
    if (resDistance) {
      resDistance.textContent = `${calcResult.pathDistanceAU.toFixed(2)} AU`;
    }

    // Gravity assist indicator
    if (tp.useGravityAssists && resFailureReason) {
      if (tp.useMultiLegChains) {
        resFailureReason.textContent = '🔬 Multi-leg gravity assist chains active (up to 2 assists — FRD-063)';
      } else {
        resFailureReason.textContent = '🔬 Single gravity assist visualization active (FRD-063)';
      }
      resFailureReason.style.display = 'block';
      resFailureReason.style.color = '#60a5fa';
    }

    // SOI intersections
    if (travelSoiSection && travelSoiList && resSoiDetours) {
      if (calcResult.soiIntersections.length > 0) {
        travelSoiSection.style.display = 'block';
        resSoiDetours.textContent = `${calcResult.detourAddedAU.toFixed(3)} AU`;
        travelSoiList.innerHTML = calcResult.soiIntersections.map(hit =>
          `<div class="travel-soi-item">⚠ ${hit.bodyLabel} +${hit.detourAddedAU.toFixed(3)} AU</div>`
        ).join('');
      } else {
        travelSoiSection.style.display = 'none';
      }
    }

    // Wait alternative
    if (travelWaitSection && resWaitTotal) {
      if (calcResult.waitAlternative) {
        travelWaitSection.style.display = 'block';
        resWaitTotal.textContent = `${calcResult.waitAlternative.totalTimeDays.toFixed(1)}d (wait ${calcResult.waitAlternative.waitDays.toFixed(1)}d)`;
      } else {
        travelWaitSection.style.display = 'none';
      }
    }
  }

  function calculateTransfer() {
    if (!tp.originId || !tp.destinationId) return;
    const originBody = state.bodies.find((b) => b.id === tp.originId);
    const destBody = state.bodies.find((b) => b.id === tp.destinationId);
    if (!originBody || !destBody) return;

    const starMassSolar = state.bodies.find(b => b.type === 'star-primary')?.mass ?? 1;
    const starMassEM = starMassSolar * 332946;
    const budget = parseFloat(deltaVInput?.value ?? '20');
    const accelG = parseFloat(accelInput?.value ?? '0.1');
    const departureOffset = tp.timeline.pinnedDepartureDayOffset
      ?? (tp.useSimDate ? state.simDayOffset : tp.customDepartureDayOffset);

    // 1. Delta-V budget plan (escape + capture + HRS)
    const plan = buildTravelPlan(originBody, destBody, budget, departureOffset, state.bodies, starMassSolar);
    tp.lastPlan = plan;
    displayResults(plan);

    // 2. SOI-safe / brachistochrone calculation (from travelCalc.ts)
    const allTravelBodies = state.bodies
      .filter(b => !b.type.startsWith('star'))
      .map(b => toTravelBody(b, starMassSolar));
    const origin = toTravelBody(originBody, starMassSolar);
    const destination = toTravelBody(destBody, starMassSolar);

    const calcResult = calculateTravel(
      { origin, destination, accelG, routingMode: tp.routingMode, departureOffsetDays: departureOffset },
      allTravelBodies,
      starMassEM
    );
    tp.lastCalcResult = calcResult;
    displaySoiResults(calcResult);

    if (plan.isPossible) {
      tp.timeline.travelDayOffset = 0;
      if (tp.timeline.pinnedDepartureDayOffset === null) {
        tp.timeline.pinnedDepartureDayOffset = departureOffset;
      }
      showTimeline(plan);
    } else {
      hideTimeline();
    }
  }

  function clearSelection() {
    tp.originId = null;
    tp.destinationId = null;
    tp.lastPlan = null;
    tp.lastCalcResult = null;
    tp.timeline = createTimelineState();
    if (travelResults) travelResults.style.display = 'none';
    if (travelSoiSection) travelSoiSection.style.display = 'none';
    if (travelWaitSection) travelWaitSection.style.display = 'none';
    hideTimeline();
    updatePanel();
  }

  // Track active tab via direct click listeners (FRD §12.5)
  document.querySelector('.tab-btn[data-tab="travel"]')
    ?.addEventListener('click', () => { tp.isActive = true; updatePanel(); });
  document.querySelectorAll('.tab-btn:not([data-tab="travel"])')
    .forEach(btn => btn.addEventListener('click', () => { tp.isActive = false; }));

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

  // Toggle: SOI-safe routing
  if (soiSafeCheck) {
    soiSafeCheck.addEventListener('change', () => {
      tp.routingMode = soiSafeCheck.checked ? 'soi-safe' : 'direct';
      if (tp.lastPlan) calculateTransfer();
    });
  }

  // Toggle: Gravity assists (FRD-063 — visual placeholder active, physics coming)
  if (gravityAssistCheck) {
    gravityAssistCheck.addEventListener('change', () => {
      tp.useGravityAssists = gravityAssistCheck.checked;
      // Show/hide multi-leg option
      if (multiLegRow) {
        multiLegRow.style.display = gravityAssistCheck.checked ? '' : 'none';
      }
      if (!gravityAssistCheck.checked && multiLegCheck) {
        multiLegCheck.checked = false;
        tp.useMultiLegChains = false;
      }
      if (tp.lastPlan) {
        // Re-trigger calculation to update results display
        calculateTransfer();
      }
    });
  }

  // Toggle: Multi-leg gravity assist chains (FRD-063 §4)
  if (multiLegCheck) {
    multiLegCheck.addEventListener('change', () => {
      tp.useMultiLegChains = multiLegCheck.checked;
      if (tp.lastPlan) {
        calculateTransfer();
      }
    });
  }

  // Toggle: Use sim date
  if (useSimDateCheck) {
    useSimDateCheck.addEventListener('change', () => {
      tp.useSimDate = useSimDateCheck.checked;
      if (departureWrapper) {
        departureWrapper.style.display = tp.useSimDate ? 'none' : 'block';
      }
    });
  }

  // --- Travel Timeline (FRD-049) ---
  const timelineSection = document.getElementById('travel-timeline-section');
  const timelineSlider = document.getElementById('travel-timeline-slider') as HTMLInputElement | null;
  const dayCounter = document.getElementById('travel-day-counter');
  const btnTimelinePlay = document.getElementById('btn-timeline-play') as HTMLButtonElement | null;
  const btnTimelinePause = document.getElementById('btn-timeline-pause') as HTMLButtonElement | null;
  const btnTimelineReset = document.getElementById('btn-timeline-reset') as HTMLButtonElement | null;
  const btnTimelineLoop = document.getElementById('btn-timeline-loop') as HTMLButtonElement | null;
  const btnPinDeparture = document.getElementById('btn-pin-departure') as HTMLButtonElement | null;
  const btnJumpArrival = document.getElementById('btn-jump-arrival') as HTMLButtonElement | null;

  function updateTimelineZones(plan: TravelPlan) {
    const zonesEl = document.getElementById('travel-timeline-zones');
    if (!zonesEl) return;
    const opt = (plan.optimisticArrivalDays / plan.pessimisticArrivalDays) * 100;
    // green: 0 → optimistic, yellow: optimistic → 90%, red: 90% → 100%
    const late = Math.max(opt + (100 - opt) * 0.7, opt);
    zonesEl.style.background =
      `linear-gradient(to right, #22c55e 0%, #22c55e ${opt}%, #eab308 ${opt}%, #eab308 ${late}%, #ef4444 ${late}%, #ef4444 100%)`;
  }

  function showTimeline(plan: TravelPlan) {
    if (!timelineSection || !timelineSlider || !plan.isPossible) return;
    timelineSlider.max = String(Math.ceil(plan.pessimisticArrivalDays));
    timelineSlider.value = String(Math.round(tp.timeline.travelDayOffset));
    updateTimelineZones(plan);
    if (dayCounter) dayCounter.textContent = `Day 0 / ${Math.round(plan.pessimisticArrivalDays)}`;
    timelineSection.style.display = 'flex';
  }

  function hideTimeline() {
    if (timelineSection) timelineSection.style.display = 'none';
    tp.timeline.isPlaying = false;
    tp.timeline.travelDayOffset = 0;
  }

  function setTimelinePlayPause(playing: boolean) {
    tp.timeline.isPlaying = playing;
    if (btnTimelinePlay) btnTimelinePlay.style.display = playing ? 'none' : 'inline-block';
    if (btnTimelinePause) btnTimelinePause.style.display = playing ? 'inline-block' : 'none';
    // Pause main sim while timeline is driving simDayOffset
    if (playing) state.isPlaying = false;
  }

  if (timelineSlider) {
    timelineSlider.addEventListener('input', () => {
      const plan = tp.lastPlan;
      if (!plan?.isPossible) return;
      tp.timeline.isPlaying = false;
      setTimelinePlayPause(false);
      tp.timeline.travelDayOffset = parseFloat(timelineSlider.value);
      const departure = tp.timeline.pinnedDepartureDayOffset ?? plan.departureDayOffset;
      state.simDayOffset = departure + tp.timeline.travelDayOffset;
      if (dayCounter) {
        dayCounter.textContent = `Day ${Math.round(tp.timeline.travelDayOffset)} / ${Math.round(plan.pessimisticArrivalDays)}`;
      }
    });
  }

  if (btnTimelinePlay) {
    btnTimelinePlay.addEventListener('click', () => setTimelinePlayPause(true));
  }
  if (btnTimelinePause) {
    btnTimelinePause.addEventListener('click', () => setTimelinePlayPause(false));
  }
  if (btnTimelineReset) {
    btnTimelineReset.addEventListener('click', () => {
      setTimelinePlayPause(false);
      tp.timeline.travelDayOffset = 0;
      if (timelineSlider) timelineSlider.value = '0';
      const plan = tp.lastPlan;
      if (plan) {
        const departure = tp.timeline.pinnedDepartureDayOffset ?? plan.departureDayOffset;
        state.simDayOffset = departure;
        if (dayCounter) dayCounter.textContent = `Day 0 / ${Math.round(plan.pessimisticArrivalDays)}`;
      }
    });
  }
  if (btnTimelineLoop) {
    btnTimelineLoop.addEventListener('click', () => {
      tp.timeline.isLooping = !tp.timeline.isLooping;
      btnTimelineLoop.classList.toggle('active', tp.timeline.isLooping);
    });
  }
  if (btnPinDeparture) {
    btnPinDeparture.addEventListener('click', () => {
      tp.timeline.pinnedDepartureDayOffset = state.simDayOffset;
      tp.timeline.travelDayOffset = 0;
      setTimelinePlayPause(false);
      if (timelineSlider) timelineSlider.value = '0';
      calculateTransfer();
    });
  }
  if (btnJumpArrival) {
    btnJumpArrival.addEventListener('click', () => {
      const plan = tp.lastPlan;
      if (!plan?.isPossible) return;
      setTimelinePlayPause(false);
      tp.timeline.travelDayOffset = plan.optimisticArrivalDays;
      if (timelineSlider) timelineSlider.value = String(Math.round(plan.optimisticArrivalDays));
      const departure = tp.timeline.pinnedDepartureDayOffset ?? plan.departureDayOffset;
      state.simDayOffset = departure + plan.optimisticArrivalDays;
      if (dayCounter) {
        dayCounter.textContent = `Day ${Math.round(plan.optimisticArrivalDays)} / ${Math.round(plan.pessimisticArrivalDays)}`;
      }
    });
  }

  updatePanel();

  // Keep distance context updated while simulation runs
  setInterval(() => {
    if (tp.isActive && tp.originId && tp.destinationId) {
      updateDistanceContext();
    }
  }, 200);
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
