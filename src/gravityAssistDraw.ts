/**
 * Gravity Assist Path Visualization
 * FRD-063 — Drawing multi-leg trajectories with hyperbolic flyby arcs
 *
 * This module handles canvas rendering of gravity-assist trajectories.
 * The physics engine (separate) computes waypoints; this module draws them.
 */

import type { SceneBody, AppState } from './types';

export interface AssistWaypoint {
  bodyId: string;
  bodyLabel: string;
  bodyPos: { x: number; y: number };
  entryPos: { x: number; y: number };
  exitPos: { x: number; y: number };
  periapsisPos: { x: number; y: number };
  turnAngleDeg: number;
  deltaVKms: number;
  side: 'leading' | 'trailing';
  soiRadiusPx: number;
}

/**
 * Draw a smooth hyperbolic arc through an assist waypoint.
 * Uses a quadratic Bezier curve for visual approximation.
 */
function drawHyperbolicArc(
  ctx: CanvasRenderingContext2D,
  entry: { x: number; y: number },
  periapsis: { x: number; y: number },
  exit: { x: number; y: number }
): void {
  ctx.beginPath();
  ctx.moveTo(entry.x, entry.y);
  ctx.quadraticCurveTo(periapsis.x, periapsis.y, exit.x, exit.y);
  ctx.stroke();
}

/**
 * Draw a velocity vector arrow at a given position.
 */
function drawVelocityArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleRad: number,
  length: number,
  color: string
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.7;

  const endX = x + Math.cos(angleRad) * length;
  const endY = y + Math.sin(angleRad) * length;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Arrowhead
  const headLen = 4;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - headLen * Math.cos(angleRad - Math.PI / 6),
    endY - headLen * Math.sin(angleRad - Math.PI / 6)
  );
  ctx.lineTo(
    endX - headLen * Math.cos(angleRad + Math.PI / 6),
    endY - headLen * Math.sin(angleRad + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draw the turn-angle arc showing how much the trajectory bends.
 */
function drawTurnAngleMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  entryAngle: number,
  exitAngle: number,
  radius: number
): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);

  const startAngle = Math.min(entryAngle, exitAngle);
  const endAngle = Math.max(entryAngle, exitAngle);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.stroke();

  // Label the angle
  const midAngle = (startAngle + endAngle) / 2;
  const labelX = cx + Math.cos(midAngle) * (radius + 10);
  const labelY = cy + Math.sin(midAngle) * (radius + 10);
  const turnDeg = Math.abs(((exitAngle - entryAngle) * 180) / Math.PI);

  ctx.fillStyle = 'rgba(250, 204, 21, 0.8)';
  ctx.font = '9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${turnDeg.toFixed(0)}°`, labelX, labelY);

  ctx.restore();
}

/**
 * Main entry point: draw a complete multi-leg gravity-assist trajectory.
 */
export function drawGravityAssistTrajectory(
  ctx: CanvasRenderingContext2D,
  originPos: { x: number; y: number },
  destPos: { x: number; y: number },
  waypoints: AssistWaypoint[],
  progress: number // 0.0 → 1.0 along entire journey
): void {
  if (waypoints.length === 0) return;

  ctx.save();

  // Build the full path points: origin → entry1 → ... → exitN → destination
  const pathPoints: { x: number; y: number }[] = [originPos];
  for (const wp of waypoints) {
    pathPoints.push(wp.entryPos);
    pathPoints.push(wp.periapsisPos);
    pathPoints.push(wp.exitPos);
  }
  pathPoints.push(destPos);

  // ── Draw the full planned path (faint background) ──
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
  for (let i = 1; i < pathPoints.length; i++) {
    // Use quadratic curves for the hyperbolic segments (every 3rd segment)
    if (i % 3 === 0 && i > 1) {
      const periapsis = pathPoints[i - 1];
      ctx.quadraticCurveTo(periapsis.x, periapsis.y, pathPoints[i].x, pathPoints[i].y);
    } else {
      ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
    }
  }
  ctx.stroke();

  // ── Draw each interplanetary leg (solid, brighter) ──
  const legs: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
  legs.push({ from: originPos, to: waypoints[0].entryPos });
  for (let i = 0; i < waypoints.length - 1; i++) {
    legs.push({ from: waypoints[i].exitPos, to: waypoints[i + 1].entryPos });
  }
  legs.push({ from: waypoints[waypoints.length - 1].exitPos, to: destPos });

  ctx.strokeStyle = 'rgba(96, 165, 250, 0.6)';
  ctx.lineWidth = 1.5;
  for (const leg of legs) {
    ctx.beginPath();
    ctx.moveTo(leg.from.x, leg.from.y);
    ctx.lineTo(leg.to.x, leg.to.y);
    ctx.stroke();
  }

  // ── Draw hyperbolic arcs at each assist body ──
  for (const wp of waypoints) {
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
    ctx.lineWidth = 1.5;
    drawHyperbolicArc(ctx, wp.entryPos, wp.periapsisPos, wp.exitPos);

    // Draw SOI circle (faint)
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.2)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(wp.bodyPos.x, wp.bodyPos.y, wp.soiRadiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Velocity vectors
    const entryAngle = Math.atan2(wp.periapsisPos.y - wp.entryPos.y, wp.periapsisPos.x - wp.entryPos.x);
    const exitAngle = Math.atan2(wp.exitPos.y - wp.periapsisPos.y, wp.exitPos.x - wp.periapsisPos.x);

    drawVelocityArrow(ctx, wp.entryPos.x, wp.entryPos.y, entryAngle, 12, 'rgba(96, 165, 250, 0.5)');
    drawVelocityArrow(ctx, wp.exitPos.x, wp.exitPos.y, exitAngle, 12, 'rgba(250, 204, 21, 0.7)');

    // Turn angle marker
    drawTurnAngleMarker(ctx, wp.bodyPos.x, wp.bodyPos.y, entryAngle, exitAngle, wp.soiRadiusPx * 0.6);

    // Assist body highlight ring
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(wp.bodyPos.x, wp.bodyPos.y, wp.soiRadiusPx + 4, 0, Math.PI * 2);
    ctx.stroke();

    // Label
    ctx.fillStyle = 'rgba(250, 204, 21, 0.9)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${wp.bodyLabel}  +${wp.deltaVKms.toFixed(1)} km/s`,
      wp.bodyPos.x,
      wp.bodyPos.y - wp.soiRadiusPx - 8
    );
  }

  // ── Draw spacecraft position along path ──
  const totalSegments = legs.length + waypoints.length;
  const segmentProgress = progress * totalSegments;
  const currentSegment = Math.floor(segmentProgress);
  const segmentT = segmentProgress - currentSegment;

  let shipX = originPos.x;
  let shipY = originPos.y;

  if (currentSegment < legs.length) {
    // On an interplanetary leg
    const leg = legs[currentSegment];
    shipX = leg.from.x + (leg.to.x - leg.from.x) * segmentT;
    shipY = leg.from.y + (leg.to.y - leg.from.y) * segmentT;
  } else if (waypoints.length > 0) {
    // On a hyperbolic arc
    const wpIdx = currentSegment - legs.length;
    const wp = waypoints[wpIdx];
    shipX = wp.entryPos.x + (wp.exitPos.x - wp.entryPos.x) * segmentT;
    shipY = wp.entryPos.y + (wp.exitPos.y - wp.entryPos.y) * segmentT;
  }

  // Ship marker
  ctx.fillStyle = 'rgba(251, 146, 60, 0.9)';
  ctx.beginPath();
  ctx.arc(shipX, shipY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

/**
 * Generate placeholder waypoints for visual demonstration.
 * Finds bodies near the chord between origin and destination and creates
 * hypothetical assist waypoints. Used before FRD-063 physics is fully implemented.
 */
export function generatePlaceholderWaypoints(
  state: AppState,
  originId: string,
  destId: string,
  frames: Map<string, { x: number; y: number }>
): AssistWaypoint[] {
  const originFrame = frames.get(originId);
  const destFrame = frames.get(destId);
  if (!originFrame || !destFrame) return [];

  const waypoints: AssistWaypoint[] = [];

  for (const body of state.bodies) {
    if (body.id === originId || body.id === destId) continue;
    if (body.type.startsWith('star')) continue;

    const frame = frames.get(body.id);
    if (!frame) continue;

    // Check if body is near the chord from origin to destination
    const chordDx = destFrame.x - originFrame.x;
    const chordDy = destFrame.y - originFrame.y;
    const chordLen = Math.hypot(chordDx, chordDy);
    if (chordLen < 1) continue;

    // Project body onto chord
    const t = ((frame.x - originFrame.x) * chordDx + (frame.y - originFrame.y) * chordDy) / (chordLen * chordLen);
    if (t <= 0.1 || t >= 0.9) continue; // Must be between origin and destination

    const projX = originFrame.x + chordDx * t;
    const projY = originFrame.y + chordDy * t;
    const distToChord = Math.hypot(frame.x - projX, frame.y - projY);

    // Only include if reasonably close to chord (within ~15% of chord length)
    if (distToChord > chordLen * 0.15) continue;

    // Create a plausible assist waypoint
    const soiPx = Math.max(20, distToChord * 1.5 + 10);

    // Entry and exit points on SOI boundary, offset from chord
    const perpAngle = Math.atan2(frame.y - projY, frame.x - projX);
    const entryAngle = perpAngle + Math.PI / 2;
    const exitAngle = perpAngle - Math.PI / 2;

    const entryPos = {
      x: frame.x + Math.cos(entryAngle) * soiPx,
      y: frame.y + Math.sin(entryAngle) * soiPx,
    };
    const exitPos = {
      x: frame.x + Math.cos(exitAngle) * soiPx,
      y: frame.y + Math.sin(exitAngle) * soiPx,
    };

    // Periapsis is closer to body, on the side toward the chord
    const periapsisPos = {
      x: frame.x + Math.cos(perpAngle) * (soiPx * 0.3),
      y: frame.y + Math.sin(perpAngle) * (soiPx * 0.3),
    };

    // Synthetic turn angle based on proximity (closer = sharper turn)
    const turnAngleDeg = Math.min(120, 30 + (1 - distToChord / (chordLen * 0.15)) * 90);
    const deltaVKms = turnAngleDeg * 0.15; // Rough heuristic

    waypoints.push({
      bodyId: body.id,
      bodyLabel: body.label,
      bodyPos: { x: frame.x, y: frame.y },
      entryPos,
      exitPos,
      periapsisPos,
      turnAngleDeg,
      deltaVKms,
      side: 'trailing',
      soiRadiusPx: soiPx,
    });
  }

  // Sort waypoints by distance from origin along chord
  waypoints.sort((a, b) => {
    const da = Math.hypot(a.bodyPos.x - originFrame.x, a.bodyPos.y - originFrame.y);
    const db = Math.hypot(b.bodyPos.x - originFrame.x, b.bodyPos.y - originFrame.y);
    return da - db;
  });

  // Limit to top 2 assists to avoid visual clutter
  return waypoints.slice(0, 2);
}
