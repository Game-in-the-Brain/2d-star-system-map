import type { AppState, SceneBody, ZoneBoundaries } from './types';
import { generateStarfield, drawStarfield, generateNebula, drawNebula } from './starfield';
import { logScaleDistance, resetCamera } from './camera';
import { hillSphereAU, calculateEscapeVelocityKms, estimateRadiusKm, getBodyPositionAU } from './travelPhysics';
import { tickTravelTimeline } from './travelPlanner';

export function resizeCanvas(state: AppState): void {
  if (!state.canvas) return;
  const dpr = window.devicePixelRatio || 1;
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  state.canvas.width = Math.floor(state.width * dpr);
  state.canvas.height = Math.floor(state.height * dpr);
  state.canvas.style.width = `${state.width}px`;
  state.canvas.style.height = `${state.height}px`;
  if (state.ctx) {
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

export function initRenderer(state: AppState): () => void {
  let rafId = 0;
  let starfield = generateStarfield(state.starfieldSeed, state.width, state.height);
  let nebulas = generateNebula(state.starfieldSeed, state.width, state.height);
  let cameraInitialized = false;

  function updateStarfield() {
    starfield = generateStarfield(state.starfieldSeed, state.width, state.height);
    nebulas = generateNebula(state.starfieldSeed, state.width, state.height);
  }

  function initCamera() {
    if (cameraInitialized) return;
    const maxAU = state.bodies.length > 0 ? Math.max(...state.bodies.map((b) => b.distanceAU)) : 1;
    resetCamera(state.camera, state.width, state.height, maxAU);
    cameraInitialized = true;
  }

  // Expose update function on state so UI can trigger it
  (state as unknown as Record<string, () => void>).updateStarfield = updateStarfield;
  (state as unknown as Record<string, () => void>).initCamera = initCamera;

  function loop(now: number) {
    rafId = requestAnimationFrame(loop);

    const rawDt = (now - state.lastFrameTime) / 1000;
    const dt = Math.min(rawDt, 0.1);
    state.lastFrameTime = now;

    if (state.isPlaying) {
      const direction = state.isReversed ? -1 : 1;
      state.simDayOffset += dt * state.speed * direction;
    }

    tickTravelTimeline(state, dt);

    try {
      initCamera();
      draw(state, starfield, nebulas);
    } catch (err) {
      console.error('[renderer] frame error:', err);
    }
  }

  state.lastFrameTime = performance.now();
  rafId = requestAnimationFrame(loop);

  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(rafId);
  });

  return () => {
    cancelAnimationFrame(rafId);
  };
}

interface BodyFrame {
  x: number;
  y: number;
  angle: number;
  distPx: number;
}

function draw(
  state: AppState,
  starfield: ReturnType<typeof generateStarfield>,
  nebulas: ReturnType<typeof generateNebula>
): void {
  const { ctx, width, height, bodies, camera, simDayOffset, zones } = state;
  if (!ctx) return;

  // Clear background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, width, height);

  // Nebula (behind stars)
  drawNebula(ctx, nebulas);

  // Starfield
  drawStarfield(ctx, starfield);

  const cx = width / 2;
  const cy = height / 2;
  const originX = cx - camera.x * camera.zoom;
  const originY = cy - camera.y * camera.zoom;

  // Zone bands (behind orbits)
  if (zones) {
    drawZoneBands(ctx, zones, originX, originY, camera.zoom, width, height);
  }

  // Pre-compute all body frames
  const frames = computeBodyFrames(bodies, originX, originY, simDayOffset, camera.zoom);

  // Orbits (L1 bodies)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (const body of bodies) {
    if (body.parentId) continue; // Moon orbits drawn separately
    if (body.distanceAU <= 0) continue;
    const r = logScaleDistance(body.distanceAU, 80) * camera.zoom;
    ctx.beginPath();
    ctx.arc(originX, originY, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Moon orbits (small circles around parents)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (const body of bodies) {
    if (!body.parentId || !body.moonOrbitAU) continue;
    const parentFrame = frames.get(body.parentId);
    if (!parentFrame) continue;
    const moonFrame = frames.get(body.id);
    if (!moonFrame) continue;
    // Orbit radius matches the computed offset (see computeBodyFrames)
    ctx.beginPath();
    ctx.arc(parentFrame.x, parentFrame.y, moonFrame.distPx, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Bodies
  for (const body of bodies) {
    const frame = frames.get(body.id);
    if (!frame) continue;
    drawBody(ctx, body, frame, originX, originY, width, height, camera.zoom);
  }

  // Travel Planner selection rings (drawn on top)
  drawTravelPlannerOverlays(ctx, state, frames);

  // Body hover tooltip (FRD-062)
  updateBodyTooltip(state);
}

/** Update the HTML body tooltip based on hovered body (FRD-062) */
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

  // Position near cursor with offset, clamped to viewport
  const offset = 14;
  let left = state.lastMouseX + offset;
  let top = state.lastMouseY + offset;
  const rect = tooltip.getBoundingClientRect();
  if (left + rect.width > state.width) left = state.lastMouseX - rect.width - offset;
  if (top + rect.height > state.height) top = state.lastMouseY - rect.height - offset;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.display = 'block';
}

const DISK_COLOURS = ['#8B7355', '#A0522D', '#CD853F'];

const ZONE_BANDS: { key: keyof ZoneBoundaries; inner: string; outer: string }[] = [
  { key: 'infernal', inner: 'rgba(255,60,60,0.18)', outer: 'rgba(255,60,60,0.02)' },
  { key: 'hot', inner: 'rgba(255,140,40,0.12)', outer: 'rgba(255,140,40,0.02)' },
  { key: 'conservative', inner: 'rgba(40,220,100,0.10)', outer: 'rgba(40,220,100,0.02)' },
  { key: 'cold', inner: 'rgba(60,140,255,0.10)', outer: 'rgba(60,140,255,0.02)' },
];

function drawZoneBands(
  ctx: CanvasRenderingContext2D,
  zones: ZoneBoundaries,
  originX: number,
  originY: number,
  zoom: number,
  width: number,
  height: number
): void {
  for (const band of ZONE_BANDS) {
    const zone = zones[band.key];
    if (!zone || zone.max == null) continue;
    const innerR = logScaleDistance(Math.max(0, zone.min), 80) * zoom;
    const outerR = logScaleDistance(zone.max, 80) * zoom;
    if (outerR <= 0 || innerR >= outerR) continue;

    const gradient = ctx.createRadialGradient(originX, originY, innerR, originX, originY, outerR);
    gradient.addColorStop(0, band.inner);
    gradient.addColorStop(1, band.outer);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(originX, originY, outerR, 0, Math.PI * 2);
    ctx.arc(originX, originY, innerR, 0, Math.PI * 2, true);
    ctx.fill();
  }
}

function computeBodyFrames(
  bodies: SceneBody[],
  originX: number,
  originY: number,
  simDayOffset: number,
  zoom: number
): Map<string, BodyFrame> {
  const frames = new Map<string, BodyFrame>();

  // First pass: L1 bodies (no parent)
  for (const body of bodies) {
    if (body.parentId) continue;
    const period = body.periodDays;
    const angle = body.angle + (period > 0 ? (2 * Math.PI * simDayOffset) / period : 0);
    const distPx = body.distanceAU > 0 ? logScaleDistance(body.distanceAU, 80) * zoom : 0;
    frames.set(body.id, {
      x: originX + Math.cos(angle) * distPx,
      y: originY + Math.sin(angle) * distPx,
      angle,
      distPx,
    });
  }

  // Second pass: moons (need parent position)
  for (const body of bodies) {
    if (!body.parentId) continue;
    const parentFrame = frames.get(body.parentId);
    if (!parentFrame) continue;
    const period = body.periodDays;
    const angle = body.angle + (period > 0 ? (2 * Math.PI * simDayOffset) / period : 0);
    // Scale moon orbit so it's visible but never exceeds a fraction of the parent's orbit.
    // Coefficient 200 (was 3000) prevents moons from appearing to orbit the star at high zoom.
    const rawMoonDist = body.moonOrbitAU ? body.moonOrbitAU * 200 * zoom : 0;
    const maxMoonDist = parentFrame.distPx * 0.25;
    const moonDistPx = Math.max(6, Math.min(maxMoonDist, rawMoonDist));
    frames.set(body.id, {
      x: parentFrame.x + Math.cos(angle) * moonDistPx,
      y: parentFrame.y + Math.sin(angle) * moonDistPx,
      angle,
      distPx: moonDistPx,
    });
  }

  return frames;
}

function drawTravelPlannerOverlays(
  ctx: CanvasRenderingContext2D,
  state: AppState,
  frames: Map<string, BodyFrame>
): void {
  const tp = state.travelPlanner;
  if (!tp || !tp.isActive) return;

  const { camera, bodies, width, height, simDayOffset } = state;
  const starMassSolar = bodies.find(b => b.type === 'star-primary')?.mass ?? 1;

  // Star position on screen (all orbits are centred here)
  const starOriginX = width / 2 - camera.x * camera.zoom;
  const starOriginY = height / 2 - camera.y * camera.zoom;

  // Compute a body's screen position at any arbitrary day offset.
  // Mirrors computeBodyFrames logic but for a single body at a chosen time.
  function screenPosAtTime(bodyId: string, dayOffset: number): { x: number; y: number } | null {
    const body = bodies.find(b => b.id === bodyId);
    if (!body) return null;
    if (!body.parentId) {
      const angle = body.angle + (body.periodDays > 0 ? (2 * Math.PI * dayOffset) / body.periodDays : 0);
      const distPx = body.distanceAU > 0 ? logScaleDistance(body.distanceAU, 80) * camera.zoom : 0;
      return { x: starOriginX + Math.cos(angle) * distPx, y: starOriginY + Math.sin(angle) * distPx };
    }
    const parent = bodies.find(b => b.id === body.parentId);
    if (!parent) return null;
    const parentPos = screenPosAtTime(parent.id, dayOffset);
    if (!parentPos) return null;
    const angle = body.angle + (body.periodDays > 0 ? (2 * Math.PI * dayOffset) / body.periodDays : 0);
    const rawMoonDist = body.moonOrbitAU ? body.moonOrbitAU * 200 * camera.zoom : 0;
    const maxMoonDist = logScaleDistance(parent.distanceAU, 80) * camera.zoom * 0.25;
    const moonDistPx = Math.max(6, Math.min(maxMoonDist, rawMoonDist));
    return { x: parentPos.x + Math.cos(angle) * moonDistPx, y: parentPos.y + Math.sin(angle) * moonDistPx };
  }

  // Current screen position of a body (from precomputed frames)
  function currentScreenPos(bodyId: string | null): { x: number; y: number } | null {
    if (!bodyId) return null;
    const frame = frames.get(bodyId);
    return frame ? { x: frame.x, y: frame.y } : null;
  }

  // Hill sphere radius in screen pixels for a body
  function hillPxFor(body: { mass: number; distanceAU: number; type: string }): number {
    const hillAU = hillSphereAU(body.mass, starMassSolar, body.distanceAU, body.type as import('./types').BodyType);
    if (hillAU <= 0) return 0;
    const localScale = 80 / ((body.distanceAU + 1) * Math.LN10);
    return hillAU * localScale * camera.zoom;
  }

  // Passive SOI rings — faint dashed circles around every planet-class body
  // (not stars, not moons) so each orbit ring has its gravitational domain visible.
  ctx.save();
  ctx.setLineDash([2, 5]);
  ctx.lineWidth = 0.7;
  for (const body of bodies) {
    if (body.type.startsWith('star') || body.type === 'moon') continue;
    if (body.id === tp.originId || body.id === tp.destinationId) continue;
    const frame = frames.get(body.id);
    if (!frame) continue;
    const hillPx = hillPxFor(body);
    const visualR = body.radiusPx * camera.zoom;
    if (hillPx < visualR * 1.3) continue; // skip if SOI is barely larger than the body dot
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(frame.x, frame.y, hillPx, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Selection rings for origin (green) and destination (orange)
  function drawSelectionRing(bodyId: string | null, color: string) {
    if (!bodyId) return;
    const body = bodies.find(b => b.id === bodyId);
    if (!body) return;
    const frame = frames.get(bodyId);
    if (!frame) return;

    const visualR = body.radiusPx * camera.zoom;
    const hillPx = hillPxFor(body);
    const r = hillPx > visualR * 1.5 ? hillPx : Math.max(visualR + 6, 14);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(frame.x, frame.y, r, 0, Math.PI * 2);
    ctx.stroke();

    if (hillPx > visualR * 1.5) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.04;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(frame.x, frame.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawSelectionRing(tp.originId, '#4ade80');
  drawSelectionRing(tp.destinationId, '#fb923c');

  // Nothing more to draw if only one body selected
  const originCurrent = currentScreenPos(tp.originId);
  const destCurrent = currentScreenPos(tp.destinationId);
  if (!originCurrent || !destCurrent || !tp.originId || !tp.destinationId) return;

  const plan = tp.lastPlan;
  const tl = tp.timeline;

  if (plan?.isPossible) {
    // Chord endpoints are FIXED in time:
    //   start = origin's position when the ship departed
    //   end   = destination's position when the ship is expected to arrive
    const departureDay = tl.pinnedDepartureDayOffset ?? plan.departureDayOffset;
    const arrivalDay = departureDay + plan.pessimisticArrivalDays;

    const departurePos = screenPosAtTime(tp.originId, departureDay);
    const arrivalPos = screenPosAtTime(tp.destinationId, arrivalDay);
    if (!departurePos || !arrivalPos) return;

    const progress = plan.pessimisticArrivalDays > 0
      ? Math.max(0, Math.min(1, tl.travelDayOffset / plan.pessimisticArrivalDays))
      : 0;
    const mx = departurePos.x + (arrivalPos.x - departurePos.x) * progress;
    const my = departurePos.y + (arrivalPos.y - departurePos.y) * progress;

    ctx.save();

    // Travelled segment (solid blue)
    ctx.strokeStyle = 'rgba(96,165,250,0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(departurePos.x, departurePos.y);
    ctx.lineTo(mx, my);
    ctx.stroke();

    // Remaining segment (dashed blue)
    ctx.strokeStyle = 'rgba(96,165,250,0.25)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(arrivalPos.x, arrivalPos.y);
    ctx.stroke();

    // Arrival marker — small cross at the destination's predicted arrival position
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(251,146,60,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(arrivalPos.x - 5, arrivalPos.y);
    ctx.lineTo(arrivalPos.x + 5, arrivalPos.y);
    ctx.moveTo(arrivalPos.x, arrivalPos.y - 5);
    ctx.lineTo(arrivalPos.x, arrivalPos.y + 5);
    ctx.stroke();

    // Spacecraft chevron at current position along chord
    const angle = Math.atan2(arrivalPos.y - departurePos.y, arrivalPos.x - departurePos.x);
    ctx.fillStyle = 'rgba(251,146,60,0.9)';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(mx + Math.cos(angle) * 6, my + Math.sin(angle) * 6);
    ctx.lineTo(mx + Math.cos(angle + 2.5) * 4, my + Math.sin(angle + 2.5) * 4);
    ctx.lineTo(mx + Math.cos(angle - 2.5) * 4, my + Math.sin(angle - 2.5) * 4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  } else {
    // No plan or impossible: dashed distance line between current positions
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(originCurrent.x, originCurrent.y);
    ctx.lineTo(destCurrent.x, destCurrent.y);
    ctx.stroke();

    // Current AU distance label
    const midX = (originCurrent.x + destCurrent.x) / 2;
    const midY = (originCurrent.y + destCurrent.y) / 2;
    const oAU = getBodyPositionAU(bodies.find(b => b.id === tp.originId)!, simDayOffset, bodies);
    const dAU = getBodyPositionAU(bodies.find(b => b.id === tp.destinationId)!, simDayOffset, bodies);
    const distAU = Math.hypot(dAU.x - oAU.x, dAU.y - oAU.y);

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${distAU.toFixed(2)} AU`, midX, midY + 14);
    ctx.restore();

    // Failure reason on canvas
    if (plan?.failureReason) {
      ctx.save();
      ctx.fillStyle = 'rgba(251,146,60,0.85)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(plan.failureReason, midX, midY + 28);
      ctx.restore();
    }
  }
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  body: SceneBody,
  frame: BodyFrame,
  originX: number,
  originY: number,
  width: number,
  height: number,
  zoom: number
): void {
  const pos = { x: frame.x, y: frame.y };

  // Simple off-screen culling for non-disk bodies (with a 20px margin)
  if (body.type !== 'disk') {
    const margin = 20;
    if (
      pos.x < -margin ||
      pos.x > width + margin ||
      pos.y < -margin ||
      pos.y > height + margin
    ) {
      return;
    }
  }

  ctx.save();

  // Draw body
  if (body.type === 'disk') {
    if (body.diskPoints && body.diskPoints.length > 0) {
      const colour = DISK_COLOURS[body.id.length % DISK_COLOURS.length];
      ctx.fillStyle = colour;
      for (const pt of body.diskPoints) {
        const ptAngle = frame.angle + pt.angle;
        const ptRadius = frame.distPx + frame.distPx * pt.radiusOffset;
        const x = originX + Math.cos(ptAngle) * ptRadius;
        const y = originY + Math.sin(ptAngle) * ptRadius;
        ctx.globalAlpha = pt.opacity;
        ctx.beginPath();
        ctx.arc(x, y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = body.strokeColour;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, body.radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } else {
    ctx.fillStyle = body.colour;
    ctx.strokeStyle = body.strokeColour;
    ctx.lineWidth = body.isMainWorld ? 2 : 1;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, body.radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Label culling: only draw labels for important bodies at very low zoom
  const shouldDrawLabel =
    body.isMainWorld ||
    body.type.startsWith('star') ||
    body.type === 'disk' ||
    zoom >= 0.35;

  if (shouldDrawLabel) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(body.label, pos.x, pos.y + body.radiusPx + 12);
  }

  // Velocity label (at higher zoom or for main worlds)
  if (body.velocityKms && (body.isMainWorld || zoom >= 1.0)) {
    ctx.fillStyle = 'rgba(200,220,255,0.6)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${body.velocityKms} km/s`, pos.x, pos.y + body.radiusPx + (shouldDrawLabel ? 24 : 12));
  }

  ctx.restore();
}
