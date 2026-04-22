import type { AppState, SceneBody, ZoneBoundaries, Point } from './types';
import { generateStarfield, drawStarfield, generateNebula, drawNebula } from './starfield';
import { logScaleDistance, resetCamera } from './camera';
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
    const rawDt = (now - state.lastFrameTime) / 1000;
    const dt = Math.min(rawDt, 0.1);
    state.lastFrameTime = now;

    if (state.isPlaying) {
      const direction = state.isReversed ? -1 : 1;
      state.simDayOffset += dt * state.speed * direction;
    }

    // Travel timeline takes over simDayOffset when playing (runs after main sim update)
    tickTravelTimeline(state, dt);

    initCamera();
    draw(state, starfield, nebulas);
    rafId = requestAnimationFrame(loop);
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

  // Travel Planner overlays (selection rings, transfer chord, spacecraft)
  drawTravelPlannerOverlays(ctx, state, frames, originX, originY);
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
    if (!zone || zone.max === null) continue;
    const innerR = logScaleDistance(Math.max(0, zone.min), 80) * zoom;
    const outerR = logScaleDistance(zone.max, 80) * zoom;
    if (outerR <= 0) continue;

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

// Compute a body's screen position at an arbitrary simulation day offset.
// Mirrors the log-scale rendering used by computeBodyFrames.
function bodyScreenPosAtTime(
  body: SceneBody,
  dayOffset: number,
  bodies: SceneBody[],
  originX: number,
  originY: number,
  zoom: number
): Point | null {
  if (!body.parentId) {
    const angle = body.angle + (body.periodDays > 0 ? (2 * Math.PI * dayOffset) / body.periodDays : 0);
    const distPx = body.distanceAU > 0 ? logScaleDistance(body.distanceAU, 80) * zoom : 0;
    return { x: originX + Math.cos(angle) * distPx, y: originY + Math.sin(angle) * distPx };
  }
  const parent = bodies.find((b) => b.id === body.parentId);
  if (!parent) return null;
  const parentPos = bodyScreenPosAtTime(parent, dayOffset, bodies, originX, originY, zoom);
  if (!parentPos) return null;
  const parentDistPx = parent.distanceAU > 0 ? logScaleDistance(parent.distanceAU, 80) * zoom : 0;
  const angle = body.angle + (body.periodDays > 0 ? (2 * Math.PI * dayOffset) / body.periodDays : 0);
  const rawMoonDist = body.moonOrbitAU ? body.moonOrbitAU * 200 * zoom : 0;
  const moonDistPx = Math.max(6, Math.min(parentDistPx * 0.25, rawMoonDist));
  return { x: parentPos.x + Math.cos(angle) * moonDistPx, y: parentPos.y + Math.sin(angle) * moonDistPx };
}

function drawTravelPlannerOverlays(
  ctx: CanvasRenderingContext2D,
  state: AppState,
  frames: Map<string, BodyFrame>,
  originX: number,
  originY: number,
): void {
  const tp = state.travelPlanner;
  if (!tp || !tp.isActive) return;

  const zoom = state.camera.zoom;

  function getFrame(bodyId: string | null) {
    if (!bodyId) return null;
    return frames.get(bodyId) ?? null;
  }

  function drawRing(bodyId: string | null, color: string) {
    const frame = getFrame(bodyId);
    if (!frame) return;
    const body = state.bodies.find((b) => b.id === bodyId);
    const r = Math.max((body?.radiusPx ?? 4) * zoom + 4, 8);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(frame.x, frame.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const plan = tp.lastPlan;

  if (plan?.isPossible && tp.originId && tp.destinationId) {
    // Fixed transfer chord: origin where it was at launch → destination where it will be at arrival
    const originBody = state.bodies.find((b) => b.id === tp.originId);
    const destBody = state.bodies.find((b) => b.id === tp.destinationId);

    if (originBody && destBody) {
      const departure = tp.timeline.pinnedDepartureDayOffset ?? plan.departureDayOffset;
      const arrival = departure + plan.pessimisticArrivalDays;

      const launchPos = bodyScreenPosAtTime(originBody, departure, state.bodies, originX, originY, zoom);
      const arrivalPos = bodyScreenPosAtTime(destBody, arrival, state.bodies, originX, originY, zoom);

      if (launchPos && arrivalPos) {
        const t = Math.min(Math.max(tp.timeline.travelDayOffset / plan.pessimisticArrivalDays, 0), 1);
        const shipX = launchPos.x + (arrivalPos.x - launchPos.x) * t;
        const shipY = launchPos.y + (arrivalPos.y - launchPos.y) * t;
        const chordAngle = Math.atan2(arrivalPos.y - launchPos.y, arrivalPos.x - launchPos.x);

        // Travelled portion (solid blue)
        ctx.save();
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(launchPos.x, launchPos.y);
        ctx.lineTo(shipX, shipY);
        ctx.stroke();

        // Remaining portion (dashed, dimmer)
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.25)';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(shipX, shipY);
        ctx.lineTo(arrivalPos.x, arrivalPos.y);
        ctx.stroke();
        ctx.restore();

        // Destination arrival marker (small circle where ship is headed)
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(arrivalPos.x, arrivalPos.y, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Spacecraft chevron at interpolated position
        ctx.save();
        ctx.translate(shipX, shipY);
        ctx.rotate(chordAngle);
        ctx.fillStyle = '#60a5fa';
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(-5, -3.5);
        ctx.lineTo(-5, 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Day label near ship
        {
          const label = tp.timeline.travelDayOffset > 0
            ? `Day ${Math.round(tp.timeline.travelDayOffset)}`
            : 'Launch';
          const offset = 10;
          ctx.save();
          ctx.font = '10px system-ui, sans-serif';
          const w = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(10, 15, 30, 0.8)';
          ctx.fillRect(shipX + offset, shipY - 14, w + 6, 14);
          ctx.fillStyle = 'rgba(200, 220, 255, 0.95)';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(label, shipX + offset + 3, shipY - 3);
          ctx.restore();
        }
      }
    }
  } else {
    // No active plan: draw a simple current-distance line between selected bodies
    const originFrame = getFrame(tp.originId);
    const destFrame = getFrame(tp.destinationId);
    if (originFrame && destFrame) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(originFrame.x, originFrame.y);
      ctx.lineTo(destFrame.x, destFrame.y);
      ctx.stroke();
      ctx.restore();

      const midX = (originFrame.x + destFrame.x) / 2;
      const midY = (originFrame.y + destFrame.y) / 2;
      const originBody = state.bodies.find((b) => b.id === tp.originId);
      const destBody = state.bodies.find((b) => b.id === tp.destinationId);
      if (originBody && destBody) {
        const oPos = { x: Math.cos(originFrame.angle) * originBody.distanceAU, y: Math.sin(originFrame.angle) * originBody.distanceAU };
        const dPos = { x: Math.cos(destFrame.angle) * destBody.distanceAU, y: Math.sin(destFrame.angle) * destBody.distanceAU };
        const distAU = Math.hypot(dPos.x - oPos.x, dPos.y - oPos.y);
        const label = `${distAU.toFixed(2)} AU`;
        ctx.save();
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const metrics = ctx.measureText(label);
        const pad = 4;
        ctx.fillStyle = 'rgba(10, 15, 30, 0.75)';
        ctx.beginPath();
        ctx.roundRect(midX - metrics.width / 2 - pad, midY - 8 - pad, metrics.width + pad * 2, 16 + pad * 2, 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(200, 220, 255, 0.9)';
        ctx.fillText(label, midX, midY);
        ctx.restore();
      }
    }
  }

  // Selection rings always on current body positions
  drawRing(tp.originId, '#4ade80');   // green = origin
  drawRing(tp.destinationId, '#fb923c'); // orange = destination
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
