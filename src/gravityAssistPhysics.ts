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
 * A body is "viable" if:
 * 1. It lies reasonably close to the transfer chord
 * 2. A flyby at safe altitude provides meaningful ΔV change
 * 3. The assist reduces total mission ΔV compared to direct transfer
 */
export function findAssistOpportunities(
  origin: SceneBody,
  destination: SceneBody,
  allBodies: SceneBody[],
  starMassSolar: number,
  departureDayOffset: number = 0
): GravityAssist[] {
  const assists: GravityAssist[] = [];
  const starMassEM = starMassSolar * SOLAR_TO_EM;

  // Get origin and destination positions at departure
  const oPos = bodyPositionAt(toTravelBody(origin, starMassSolar), departureDayOffset, origin.periodDays ?? 365);
  const dPos = bodyPositionAt(toTravelBody(destination, starMassSolar), departureDayOffset, destination.periodDays ?? 365);

  for (const body of allBodies) {
    if (body.id === origin.id || body.id === destination.id) continue;
    if (body.type.startsWith('star')) continue;
    if (body.mass <= 0) continue;

    const bPos = bodyPositionAt(toTravelBody(body, starMassSolar), departureDayOffset, body.periodDays ?? 365);

    // Check if body is near the chord
    const chordDx = dPos.x - oPos.x;
    const chordDy = dPos.y - oPos.y;
    const chordLen = Math.hypot(chordDx, chordDy);
    if (chordLen < 0.01) continue;

    // Project body onto chord
    const t = ((bPos.x - oPos.x) * chordDx + (bPos.y - oPos.y) * chordDy) / (chordLen * chordLen);
    if (t <= 0.15 || t >= 0.85) continue;

    const projX = oPos.x + chordDx * t;
    const projY = oPos.y + chordDy * t;
    const distToChordAU = Math.hypot(bPos.x - projX, bPos.y - projY);

    // Must be within 20% of chord length
    if (distToChordAU > chordLen * 0.2) continue;

    // Calculate body properties
    const bodyRadiusKm = estimateBodyRadiusKm(body.mass, body.type);
    const safePeriapsisKm = bodyRadiusKm + 500; // 500 km minimum safe altitude
    const mu = bodyMuKm3s2(body.mass);

    // Estimate spacecraft velocity at body (approximate: average of origin and dest orbital velocities)
    const vSpacecraft = circularOrbitalVelocityKms(starMassSolar, origin.distanceAU);
    const vPlanet = circularOrbitalVelocityKms(starMassSolar, body.distanceAU);

    // Simple V∞ estimate: difference in orbital speeds
    const vInfMag = Math.abs(vSpacecraft - vPlanet);
    if (vInfMag < 1) continue; // Too slow for meaningful assist

    // Calculate turning angle at safe periapsis
    const turningAngleRad = calculateTurningAngle(safePeriapsisKm, vInfMag, mu);
    const turningAngleDeg = (turningAngleRad * 180) / Math.PI;
    if (turningAngleDeg < 5) continue; // Too small to be useful

    // Calculate ΔV from assist
    const vInfIn = {
      x: vSpacecraft * Math.cos(origin.angle + Math.PI / 2) - vPlanet * Math.cos(body.angle + Math.PI / 2),
      y: vSpacecraft * Math.sin(origin.angle + Math.PI / 2) - vPlanet * Math.sin(body.angle + Math.PI / 2),
    };

    const planetVel = bodyHeliocentricVelocityKms(body, starMassSolar);

    // Try trailing side (speed up)
    const vOutTrailing = calculateAssistDeltaV(vInfIn, planetVel, turningAngleRad, 'trailing');
    const vInHelio = {
      x: planetVel.x + vInfIn.x,
      y: planetVel.y + vInfIn.y,
    };
    const deltaVTrailing = Math.hypot(vOutTrailing.x - vInHelio.x, vOutTrailing.y - vInHelio.y);

    // Try leading side (slow down)
    const vOutLeading = calculateAssistDeltaV(vInfIn, planetVel, turningAngleRad, 'leading');
    const deltaVLeading = Math.hypot(vOutLeading.x - vInHelio.x, vOutLeading.y - vInHelio.y);

    // Pick the side that gives larger ΔV magnitude
    const isAccelerating = deltaVTrailing >= deltaVLeading;
    const deltaVKms = isAccelerating ? deltaVTrailing : deltaVLeading;

    // Minimum useful ΔV threshold: 0.5 km/s
    if (deltaVKms < 0.5) continue;

    assists.push({
      bodyId: body.id,
      bodyLabel: body.label,
      flybyDayOffset: departureDayOffset + t * 365, // Rough estimate
      flybyAltitudeKm: safePeriapsisKm - bodyRadiusKm,
      vInfinityKms: vInfMag,
      turningAngleDeg,
      deltaVKms,
      isAccelerating,
      isValid: true,
      warning: turningAngleDeg > 60 ? 'High turning angle — check thermal loading' : undefined,
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
