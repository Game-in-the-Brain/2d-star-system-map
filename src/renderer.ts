import type { AppState, SceneBody } from './types';
import { generateStarfield, drawStarfield, generateNebula, drawNebula } from './starfield';
import { logScaleDistance, resetCamera } from './camera';

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
    // Cap dt to prevent huge jumps when the tab regains focus after being backgrounded
    const rawDt = (now - state.lastFrameTime) / 1000;
    const dt = Math.min(rawDt, 0.1);
    state.lastFrameTime = now;

    if (state.isPlaying) {
      const direction = state.isReversed ? -1 : 1;
      state.simDayOffset += dt * state.speed * direction;
    }

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

function draw(
  state: AppState,
  starfield: ReturnType<typeof generateStarfield>,
  nebulas: ReturnType<typeof generateNebula>
): void {
  const { ctx, width, height, bodies, camera, simDayOffset } = state;
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

  // Orbits
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (const body of bodies) {
    if (body.distanceAU <= 0) continue;
    const r = logScaleDistance(body.distanceAU, 80) * camera.zoom;
    ctx.beginPath();
    ctx.arc(cx - camera.x * camera.zoom, cy - camera.y * camera.zoom, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Bodies
  for (const body of bodies) {
    drawBody(ctx, body, camera, cx, cy, simDayOffset, width, height);
  }
}

const DISK_COLOURS = ['#8B7355', '#A0522D', '#CD853F'];

function drawBody(
  ctx: CanvasRenderingContext2D,
  body: SceneBody,
  camera: { x: number; y: number; zoom: number },
  cx: number,
  cy: number,
  simDayOffset: number,
  width: number,
  height: number
): void {
  const period = body.periodDays;
  const angle = body.angle + (period > 0 ? (2 * Math.PI * simDayOffset) / period : 0);
  const distPx = logScaleDistance(body.distanceAU, 80) * camera.zoom;
  const visualPos = {
    x: cx + Math.cos(angle) * distPx - camera.x * camera.zoom,
    y: cy + Math.sin(angle) * distPx - camera.y * camera.zoom,
  };

  // Simple off-screen culling for non-disk bodies (with a 20px margin)
  if (body.type !== 'disk') {
    const margin = 20;
    if (
      visualPos.x < -margin ||
      visualPos.x > width + margin ||
      visualPos.y < -margin ||
      visualPos.y > height + margin
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
        const ptAngle = angle + pt.angle;
        const ptRadius = distPx + distPx * pt.radiusOffset;
        const x = cx + Math.cos(ptAngle) * ptRadius - camera.x * camera.zoom;
        const y = cy + Math.sin(ptAngle) * ptRadius - camera.y * camera.zoom;
        ctx.globalAlpha = pt.opacity;
        ctx.beginPath();
        ctx.arc(x, y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      // Fallback to dashed ring if no points generated
      ctx.strokeStyle = body.strokeColour;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(visualPos.x, visualPos.y, body.radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } else {
    ctx.fillStyle = body.colour;
    ctx.strokeStyle = body.strokeColour;
    ctx.lineWidth = body.isMainWorld ? 2 : 1;
    ctx.beginPath();
    ctx.arc(visualPos.x, visualPos.y, body.radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Label culling: only draw labels for important bodies at very low zoom
  const shouldDrawLabel =
    body.isMainWorld ||
    body.type.startsWith('star') ||
    body.type === 'disk' ||
    camera.zoom >= 0.35;

  if (shouldDrawLabel) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(body.label, visualPos.x, visualPos.y + body.radiusPx + 12);
  }

  ctx.restore();
}
