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
  departureDayOffset: number = 0
): GravityAssist[] {
  const assists: GravityAssist[] = [];

  // Compute direct transfer as baseline
  const directTransfer = patchedConicTransfer(origin, destination, starMassSolar, departureDayOffset);
  const directDeltaV = directTransfer?.totalDeltaVKms ?? Infinity;

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
    // (either reduces total delta-V or provides significant velocity change)
    const benefitRatio = directDeltaV > 0 ? (directDeltaV - assistTransfer.totalDeltaVKms) / directDeltaV : 0;

    // Accept if:
    // 1. Total delta-V is less than direct, OR
    // 2. Assist provides > 2 km/s velocity change (useful even if total is higher due to extra leg)
    const isUseful = benefitRatio > 0.05 || assistTransfer.assistDeltaVKms > 2.0;
    if (!isUseful) continue;

    // Determine if accelerating or decelerating
    const isAccelerating = assistTransfer.assistDeltaVKms > 0 &&
      destination.distanceAU > origin.distanceAU; // Simplified: outbound = accelerate

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

  // Sort by delta-V gain (descending)
  assists.sort((a, b) => b.deltaVKms - a.deltaVKms);

  // Return top 3
  return assists.slice(0, 3);
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
