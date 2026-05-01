/**
 * Gravity Assist Physics Engine
 * FRD-063 Core Implementation
 *
 * Implements hyperbolic flyby mechanics for trajectory planning:
 * - Turning angle from periapsis and V∞
 * - V∞ vector rotation (heliocentric frame)
 * - Assist opportunity search
 * - Multi-leg trajectory construction
 */

import type { SceneBody, TravelBody, GravityAssist, MultiLegPlan, TransferLeg } from './types';
import { bodyPositionAt, toTravelBody, distanceAU, calculateTravel } from './travelCalc';
import { hillSphereAU } from './travelPhysics';
import { patchedConicTransfer, gravityAssistTransfer } from './patchedConic';

// ─── Physical Constants ───
const G = 6.674e-11; // m³ kg⁻¹ s⁻²
const AU_TO_M = 1.496e11;
const EM_TO_KG = 5.972e24;
const KM_TO_M = 1000;
const SOLAR_TO_EM = 332946;

/**
 * Calculate turning angle δ for a hyperbolic flyby.
 *
 * Formula: sin(δ/2) = 1 / (1 + r_p · V∞² / μ)
 * Where:
 *   r_p = periapsis distance (km)
 *   V∞ = hyperbolic excess velocity (km/s)
 *   μ = G · M_planet = standard gravitational parameter (km³/s²)
 */
export function calculateTurningAngle(
  periapsisKm: number,
  vInfinityKms: number,
  planetMuKm3s2: number
): number {
  if (periapsisKm <= 0 || vInfinityKms <= 0 || planetMuKm3s2 <= 0) return 0;
  const ratio = (periapsisKm * vInfinityKms * vInfinityKms) / planetMuKm3s2;
  const sinHalfDelta = 1 / (1 + ratio);
  return 2 * Math.asin(Math.min(1, sinHalfDelta));
}

/**
 * Calculate V∞ (hyperbolic excess velocity) from heliocentric velocities.
 *
 * V∞ = V_spacecraft - V_planet (vector subtraction)
 * Magnitude is preserved before/after flyby.
 */
export function calculateVInfinity(
  spacecraftVelocityKms: { x: number; y: number },
  planetVelocityKms: { x: number; y: number }
): { magnitude: number; direction: { x: number; y: number } } {
  const dx = spacecraftVelocityKms.x - planetVelocityKms.x;
  const dy = spacecraftVelocityKms.y - planetVelocityKms.y;
  const magnitude = Math.hypot(dx, dy);
  if (magnitude === 0) {
    return { magnitude: 0, direction: { x: 0, y: 0 } };
  }
  return {
    magnitude,
    direction: { x: dx / magnitude, y: dy / magnitude },
  };
}

/**
 * Apply a gravity assist: rotate V∞ vector by turning angle δ.
 *
 * Returns the new heliocentric velocity after the assist.
 *
 * side = 'trailing'  → spacecraft passes behind planet (gains speed)
 * side = 'leading'   → spacecraft passes in front of planet (loses speed)
 */
export function calculateAssistDeltaV(
  vInfinityIn: { x: number; y: number },
  planetVelocityKms: { x: number; y: number },
  turningAngleRad: number,
  side: 'leading' | 'trailing'
): { x: number; y: number } {
  // V∞_in in heliocentric frame
  const vInfX = vInfinityIn.x;
  const vInfY = vInfinityIn.y;
  const vInfMag = Math.hypot(vInfX, vInfY);
  if (vInfMag === 0) return { ...planetVelocityKms };

  // Rotation direction
  const rotationSign = side === 'trailing' ? 1 : -1;
  const cosDelta = Math.cos(turningAngleRad * rotationSign);
  const sinDelta = Math.sin(turningAngleRad * rotationSign);

  // Rotate V∞ vector
  const vInfOutX = vInfX * cosDelta - vInfY * sinDelta;
  const vInfOutY = vInfX * sinDelta + vInfY * cosDelta;

  // New heliocentric velocity = V_planet + V∞_out
  return {
    x: planetVelocityKms.x + vInfOutX,
    y: planetVelocityKms.y + vInfOutY,
  };
}

/**
 * Calculate the standard gravitational parameter μ for a body.
 * μ = G · M (in km³/s²)
 */
export function bodyMuKm3s2(massEM: number): number {
  // G [m³ kg⁻¹ s⁻²] * M [kg] = μ [m³ s⁻²]
  // Convert to km³/s²: divide by 1e9
  return (G * massEM * EM_TO_KG) / 1e9;
}

/**
 * Calculate circular orbital velocity at a given distance.
 * v_circ = sqrt(μ / r)
 */
export function circularOrbitalVelocityKms(
  starMassSolar: number,
  distanceAU: number
): number {
  const mu = G * starMassSolar * SOLAR_TO_EM * EM_TO_KG; // m³/s²
  const rM = distanceAU * AU_TO_M;
  const vMs = Math.sqrt(mu / rM);
  return vMs / KM_TO_M;
}

/**
 * Estimate a body's heliocentric velocity at a given orbital angle.
 * Assumes circular orbit for simplicity.
 */
export function bodyHeliocentricVelocityKms(
  body: SceneBody,
  starMassSolar: number
): { x: number; y: number } {
  const v = circularOrbitalVelocityKms(starMassSolar, body.distanceAU);
  // Velocity is perpendicular to radius vector
  const angle = body.angle + Math.PI / 2;
  return {
    x: v * Math.cos(angle),
    y: v * Math.sin(angle),
  };
}

/**
 * Search for viable gravity assist opportunities between origin and destination.
 *
 * Uses real patched conic physics:
 * 1. Compute direct transfer (origin → destination) delta-V
 * 2. For each candidate body, compute gravity assist transfer (origin → body → destination)
 * 3. Compare total delta-V: if assist route is cheaper, it's viable
 */
export function findAssistOpportunities(
  origin: SceneBody,
  destination: SceneBody,
  allBodies: SceneBody[],
  starMassSolar: number,
  departureDayOffset: number = 0,
  useMultiLegChains: boolean = false
): GravityAssist[] {
  const assists: GravityAssist[] = [];

  // Compute direct transfer as baseline
  const directTransfer = patchedConicTransfer(origin, destination, starMassSolar, departureDayOffset);
  const directDeltaV = directTransfer?.totalDeltaVKms ?? Infinity;

  // ─── Single-leg assists (origin → body → destination) ───
  for (const body of allBodies) {
    if (body.id === origin.id || body.id === destination.id) continue;
    if (body.type.startsWith('star')) continue;
    if (body.mass <= 0) continue;

    // Must be between origin and destination in orbital distance
    const isBetween = (body.distanceAU > Math.min(origin.distanceAU, destination.distanceAU)) &&
                      (body.distanceAU < Math.max(origin.distanceAU, destination.distanceAU));
    if (!isBetween) continue;

    // Compute gravity assist transfer
    const assistTransfer = gravityAssistTransfer(
      origin, body, destination, starMassSolar, departureDayOffset
    );
    if (!assistTransfer) continue;

    // Only include if the assist provides meaningful benefit
    const benefitRatio = directDeltaV > 0 ? (directDeltaV - assistTransfer.totalDeltaVKms) / directDeltaV : 0;
    const isUseful = benefitRatio > 0.05 || assistTransfer.assistDeltaVKms > 2.0;
    if (!isUseful) continue;

    const isAccelerating = assistTransfer.assistDeltaVKms > 0 &&
      destination.distanceAU > origin.distanceAU;

    assists.push({
      bodyId: body.id,
      bodyLabel: body.label,
      flybyDayOffset: departureDayOffset + assistTransfer.totalTimeDays * 0.5,
      flybyAltitudeKm: 500,
      vInfinityKms: assistTransfer.assistDeltaVKms,
      turningAngleDeg: assistTransfer.flybyTurningAngleDeg,
      deltaVKms: Math.abs(assistTransfer.assistDeltaVKms),
      isAccelerating,
      isValid: true,
      warning: assistTransfer.flybyTurningAngleDeg > 60
        ? 'High turning angle — check thermal loading'
        : undefined,
    });
  }

  // ─── Multi-leg chains (origin → assist1 → assist2 → destination) ───
  if (useMultiLegChains && assists.length > 0) {
    const chains = findTwoLegChains(
      origin, destination, allBodies, starMassSolar, departureDayOffset, directDeltaV
    );
    // Mark chain assists with a note
    for (const chainAssist of chains) {
      chainAssist.bodyLabel += ' (chain)';
      assists.push(chainAssist);
    }
  }

  // Sort by delta-V gain (descending)
  assists.sort((a, b) => b.deltaVKms - a.deltaVKms);

  // Return top results
  return assists.slice(0, useMultiLegChains ? 5 : 3);
}

/**
 * Search for viable 2-leg gravity assist chains.
 * Origin → assist1 → assist2 → destination
 */
function findTwoLegChains(
  origin: SceneBody,
  destination: SceneBody,
  allBodies: SceneBody[],
  starMassSolar: number,
  departureDayOffset: number,
  directDeltaV: number
): GravityAssist[] {
  const chainAssists: GravityAssist[] = [];
  const candidates = allBodies.filter(b =>
    b.id !== origin.id && b.id !== destination.id &&
    !b.type.startsWith('star') && b.mass > 0
  );

  for (let i = 0; i < candidates.length; i++) {
    const body1 = candidates[i];
    if (body1.distanceAU <= Math.min(origin.distanceAU, destination.distanceAU) ||
        body1.distanceAU >= Math.max(origin.distanceAU, destination.distanceAU)) continue;

    const transfer1 = gravityAssistTransfer(origin, body1, destination, starMassSolar, departureDayOffset);
    if (!transfer1) continue;

    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      const body2 = candidates[j];

      const minDist = Math.min(body1.distanceAU, destination.distanceAU);
      const maxDist = Math.max(body1.distanceAU, destination.distanceAU);
      if (body2.distanceAU <= minDist || body2.distanceAU >= maxDist) continue;

      const midTime = departureDayOffset + transfer1.totalTimeDays * 0.5;
      const transfer2 = gravityAssistTransfer(body1, body2, destination, starMassSolar, midTime);
      if (!transfer2) continue;

      const transfer3 = patchedConicTransfer(body2, destination, starMassSolar, midTime + transfer2.totalTimeDays * 0.5);
      if (!transfer3) continue;

      const totalDeltaV = transfer1.totalDeltaVKms + transfer2.totalDeltaVKms + transfer3.totalDeltaVKms;
      const totalTime = transfer1.totalTimeDays + transfer2.totalTimeDays + transfer3.timeOfFlightDays;

      const benefitRatio = directDeltaV > 0 ? (directDeltaV - totalDeltaV) / directDeltaV : 0;
      if (benefitRatio <= 0.1) continue;

      chainAssists.push({
        bodyId: `${body1.id}+${body2.id}`,
        bodyLabel: `${body1.label} → ${body2.label}`,
        flybyDayOffset: midTime,
        flybyAltitudeKm: 500,
        vInfinityKms: transfer1.assistDeltaVKms + transfer2.assistDeltaVKms,
        turningAngleDeg: transfer1.flybyTurningAngleDeg + transfer2.flybyTurningAngleDeg,
        deltaVKms: Math.abs(directDeltaV - totalDeltaV),
        isAccelerating: destination.distanceAU > origin.distanceAU,
        isValid: true,
        warning: `2-leg chain, total ${totalTime.toFixed(0)}d`,
      });
    }
  }

  chainAssists.sort((a, b) => b.deltaVKms - a.deltaVKms);
  return chainAssists.slice(0, 2);
}

/**
 * Build a multi-leg plan using gravity assists.
 *
 * For now, this is a simplified version that chains the best assist
 * between origin and destination. Full implementation will support
 * multi-assist chains (origin → assist1 → assist2 → destination).
 */
export function buildMultiLegPlan(
  originId: string,
  destinationId: string,
  assistBodyIds: string[],
  allBodies: SceneBody[],
  starMassSolar: number,
  departureDayOffset: number
): MultiLegPlan | null {
  // TODO: Full multi-leg implementation with patched conics
  // For now, return a simplified structure
  return null;
}

// ─── Helper Functions ───

function estimateBodyRadiusKm(massEM: number, type: string): number {
  const EARTH_RADIUS_KM = 6371;
  if (type.includes('gas') || type.includes('jovian')) {
    return EARTH_RADIUS_KM * Math.pow(massEM, 0.5);
  }
  if (type.includes('dwarf')) {
    return EARTH_RADIUS_KM * Math.pow(massEM, 0.25);
  }
  // Rocky/icy
  return EARTH_RADIUS_KM * Math.pow(massEM, 0.28);
}
