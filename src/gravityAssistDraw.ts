/**
 * Gravity Assist Path Visualization
 * FRD-063 — Drawing multi-leg trajectories with hyperbolic flyby arcs
 *
 * This module handles canvas rendering of gravity-assist trajectories.
 * The physics engine (separate) computes waypoints; this module draws them.
 */

import type { SceneBody, AppState, GravityAssist } from './types';
import { findAssistOpportunities } from './gravityAssistPhysics';
import { getBodyPositionAU, hillSphereAU } from './travelPhysics';
import { logScaleDistance } from './camera';

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
  /** Days from departure when ship reaches entryPos (for animation). */
  entryDayOffset: number;
  /** Days from departure when ship leaves exitPos (for animation). */
  exitDayOffset: number;
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
  progress: number, // 0.0 → 1.0 along entire journey (time-based)
  totalDays: number // total journey time in days (for scaling)
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

  // ── Draw spacecraft position along path (time-based interpolation) ──
  // Build keyframes: each point has a day offset from departure.
  // The ship spends most of its time on interplanetary legs; the hyperbolic
  // flyby is treated as a brief 0.5-day event for visual smoothness.
  interface Keyframe {
    pos: { x: number; y: number };
    day: number;
  }

  const keyframes: Keyframe[] = [{ pos: originPos, day: 0 }];

  for (const wp of waypoints) {
    keyframes.push({ pos: wp.entryPos, day: wp.entryDayOffset });
    // Periapsis at midpoint of entry→exit window
    const periapsisDay = (wp.entryDayOffset + wp.exitDayOffset) * 0.5;
    keyframes.push({ pos: wp.periapsisPos, day: periapsisDay });
    keyframes.push({ pos: wp.exitPos, day: wp.exitDayOffset });
  }

  keyframes.push({ pos: destPos, day: totalDays });

  // Ensure monotonically increasing days (clamp tiny overlaps)
  for (let i = 1; i < keyframes.length; i++) {
    if (keyframes[i].day < keyframes[i - 1].day + 0.01) {
      keyframes[i].day = keyframes[i - 1].day + 0.01;
    }
  }

  const travelDayOffset = progress * totalDays;

  let shipX = destPos.x;
  let shipY = destPos.y;

  if (progress <= 0) {
    shipX = originPos.x;
    shipY = originPos.y;
  } else if (progress >= 1) {
    shipX = destPos.x;
    shipY = destPos.y;
  } else {
    // Find the segment containing travelDayOffset
    for (let i = 0; i < keyframes.length - 1; i++) {
      const k0 = keyframes[i];
      const k1 = keyframes[i + 1];
      if (travelDayOffset >= k0.day && travelDayOffset <= k1.day) {
        const segmentDuration = k1.day - k0.day;
        const t = segmentDuration > 0 ? (travelDayOffset - k0.day) / segmentDuration : 0;
        shipX = k0.pos.x + (k1.pos.x - k0.pos.x) * t;
        shipY = k0.pos.y + (k1.pos.y - k0.pos.y) * t;
        break;
      }
    }
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
 * Generate real waypoints from the patched-conic physics engine.
 * Converts GravityAssist results into screen-space AssistWaypoints.
 */
export function generateRealWaypoints(
  state: AppState,
  originId: string,
  destId: string,
  starMassSolar: number,
  departureDayOffset: number,
  useMultiLegChains: boolean,
  maxAssists: number,
  totalDays: number
): AssistWaypoint[] {
  const origin = state.bodies.find(b => b.id === originId);
  const destination = state.bodies.find(b => b.id === destId);
  if (!origin || !destination) return [];

  const assists = findAssistOpportunities(
    origin, destination, state.bodies, starMassSolar, departureDayOffset, useMultiLegChains
  );

  // Skip chain assists (bodyId contains "+") for renderer — they need special multi-leg drawing
  const singleAssists = assists.filter(a => !a.bodyId.includes('+'));
  const limitedAssists = singleAssists.slice(0, maxAssists);

  const { camera, width, height } = state;
  const cx = width / 2;
  const cy = height / 2;
  const originX = cx - camera.x * camera.zoom;
  const originY = cy - camera.y * camera.zoom;

  function bodyScreenPosAt(body: SceneBody, dayOffset: number): { x: number; y: number } {
    const angle = body.angle + (body.periodDays > 0 ? (2 * Math.PI * dayOffset) / body.periodDays : 0);
    const distPx = body.distanceAU > 0 ? logScaleDistance(body.distanceAU, 80) * camera.zoom : 0;
    return {
      x: originX + Math.cos(angle) * distPx,
      y: originY + Math.sin(angle) * distPx,
    };
  }

  // Sort chronologically so the animation follows the actual flight order
  limitedAssists.sort((a, b) => a.flybyDayOffset - b.flybyDayOffset);

  const waypoints: AssistWaypoint[] = [];
  let currentDayOffset = 0;

  // Estimate an average px-per-day speed from the direct trajectory for
  // inter-waypoint legs when multiple independent assists are shown.
  const originPos = bodyScreenPosAt(origin, departureDayOffset);
  const destPos = bodyScreenPosAt(destination, departureDayOffset + totalDays);
  const directDistPx = Math.hypot(destPos.x - originPos.x, destPos.y - originPos.y);
  const avgSpeedPxPerDay = directDistPx / Math.max(1, totalDays);

  for (let i = 0; i < limitedAssists.length; i++) {
    const assist = limitedAssists[i];
    const body = state.bodies.find(b => b.id === assist.bodyId);
    if (!body) continue;

    // Body position at flyby time
    const bodyPos = bodyScreenPosAt(body, assist.flybyDayOffset);

    // SOI radius in pixels (from Hill sphere, clamped for visibility)
    const hillAU = hillSphereAU(body.mass, starMassSolar, body.distanceAU, body.type);
    const auToPxRatio = body.distanceAU > 0
      ? (logScaleDistance(body.distanceAU, 80) * camera.zoom) / body.distanceAU
      : 0;
    let soiPx = hillAU * auToPxRatio;
    soiPx = Math.max(18, Math.min(soiPx, 70));

    // Previous waypoint position (origin or previous assist)
    let prevPos: { x: number; y: number };
    if (i === 0) {
      prevPos = originPos;
    } else {
      const prevAssist = limitedAssists[i - 1];
      const prevBody = state.bodies.find(b => b.id === prevAssist.bodyId);
      if (!prevBody) continue;
      prevPos = bodyScreenPosAt(prevBody, prevAssist.flybyDayOffset);
    }

    // Approach direction: from previous position toward body
    const approachDx = bodyPos.x - prevPos.x;
    const approachDy = bodyPos.y - prevPos.y;
    const approachAngle = Math.atan2(approachDy, approachDx);

    // Turn angle from physics
    const turnAngleRad = (assist.turningAngleDeg * Math.PI) / 180;
    const turnSign = assist.isAccelerating ? 1 : -1;

    // Exit direction: rotate approach by turn angle
    const exitAngle = approachAngle + turnSign * turnAngleRad;

    // Entry and exit on SOI boundary
    const entryPos = {
      x: bodyPos.x - Math.cos(approachAngle) * soiPx,
      y: bodyPos.y - Math.sin(approachAngle) * soiPx,
    };
    const exitPos = {
      x: bodyPos.x + Math.cos(exitAngle) * soiPx,
      y: bodyPos.y + Math.sin(exitAngle) * soiPx,
    };

    // Periapsis on the bisector, closer to body
    const midAngle = (approachAngle + exitAngle) / 2;
    const rpPx = Math.max(3, soiPx * 0.12);
    const periapsisPos = {
      x: bodyPos.x + Math.cos(midAngle) * rpPx,
      y: bodyPos.y + Math.sin(midAngle) * rpPx,
    };

    // ── Compute animation timing for this waypoint ──
    // For the first waypoint we have real physics (leg1TimeDays).
    // For subsequent waypoints we estimate from screen distance.
    let legTimeDays: number;
    if (i === 0) {
      legTimeDays = assist.leg1TimeDays;
    } else {
      const interDistPx = Math.hypot(entryPos.x - prevPos.x, entryPos.y - prevPos.y);
      legTimeDays = avgSpeedPxPerDay > 0 ? interDistPx / avgSpeedPxPerDay : 0;
    }

    currentDayOffset += legTimeDays;
    const flybyDuration = Math.min(0.5, totalDays * 0.02); // brief SOI passage
    const entryDayOffset = Math.max(0, currentDayOffset - flybyDuration * 0.5);
    const exitDayOffset = currentDayOffset + flybyDuration * 0.5;
    currentDayOffset = exitDayOffset;

    waypoints.push({
      bodyId: assist.bodyId,
      bodyLabel: assist.bodyLabel,
      bodyPos,
      entryPos,
      exitPos,
      periapsisPos,
      turnAngleDeg: assist.turningAngleDeg,
      deltaVKms: assist.deltaVKms,
      side: assist.isAccelerating ? 'trailing' : 'leading',
      soiRadiusPx: soiPx,
      entryDayOffset,
      exitDayOffset,
    });
  }

  // Scale all day offsets so the final leg (last exit → destination) lands
  // exactly at totalDays.  This preserves the relative timing of the known
  // physics legs while ensuring the ship reaches destPos at progress = 1.0.
  const lastAssist = waypoints[waypoints.length - 1];
  if (lastAssist && totalDays > 0) {
    const finalLegPhysics = limitedAssists[limitedAssists.length - 1]?.leg2TimeDays ?? 0;
    const unscaledTotal = lastAssist.exitDayOffset + finalLegPhysics;
    if (unscaledTotal > 0 && Math.abs(unscaledTotal - totalDays) > 0.1) {
      const scale = totalDays / unscaledTotal;
      for (const wp of waypoints) {
        wp.entryDayOffset *= scale;
        wp.exitDayOffset *= scale;
      }
    }
  }

  return waypoints;
}
