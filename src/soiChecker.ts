/**
 * Laplace SOI radius, line-circle intersection, detour approximation,
 * and clear-window search.
 * Pure math — no DOM coupling.
 * FRD-060 §30
 */

import type { TravelBody } from './types';

const SOLAR_TO_EM = 332946; // 1 solar mass in Earth masses

/**
 * Laplace SOI radius in AU.
 * r_SOI = a × (m_planet / M_star)^(2/5)
 */
export function soiRadiusAU(orbitalAU: number, planetEM: number, starEM: number): number {
  if (orbitalAU <= 0 || planetEM <= 0 || starEM <= 0) return 0;
  return orbitalAU * Math.pow(planetEM / starEM, 2 / 5);
}

/**
 * Check if line segment A→B intersects a circle at C with radius r.
 * Returns the chord length (distance inside the circle) if the segment
 * passes through the circle. Returns 0 if no intersection.
 */
export function checkLineCircleIntersection(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  r: number
): number {
  if (r <= 0) return 0;

  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;

  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);

  // Clamp to segment [0, 1]
  const tEnter = Math.max(0, Math.min(1, t1));
  const tExit = Math.max(0, Math.min(1, t2));

  if (tExit <= tEnter) return 0;

  // Chord length inside the circle along the segment
  const chordLen = Math.hypot(dx * (tExit - tEnter), dy * (tExit - tEnter));
  return chordLen;
}

/**
 * Conservative tangent-arc bypass estimate.
 * detour ≈ 2√(halfChord² + r²) − chord
 */
export function detourAroundCircle(chordAU: number, soiRadiusAU: number): number {
  if (chordAU <= 0 || soiRadiusAU <= 0) return 0;
  const halfChord = chordAU / 2;
  const bypass = 2 * Math.sqrt(halfChord * halfChord + soiRadiusAU * soiRadiusAU);
  return bypass - chordAU;
}

/**
 * Find the first departure offset where the chord has no SOI intersections.
 * Searches forward in step-day increments.
 */
export function findClearDepartureWindow(
  origin: TravelBody,
  destination: TravelBody,
  obstacles: TravelBody[],
  starMassEM: number,
  maxSearchDays = 365,
  stepDays = 0.5
): { waitDays: number; originPos: { x: number; y: number }; destPos: { x: number; y: number } } | null {
  const steps = Math.ceil(maxSearchDays / stepDays);

  for (let i = 0; i <= steps; i++) {
    const dayOffset = i * stepDays;

    // Compute body positions at this departure time
    const oAngle = origin.angleRad + (2 * Math.PI * dayOffset) / originPeriod(origin);
    const dAngle = destination.angleRad + (2 * Math.PI * dayOffset) / originPeriod(destination);

    const oPos = { x: Math.cos(oAngle) * origin.distanceAU, y: Math.sin(oAngle) * origin.distanceAU };
    const dPos = { x: Math.cos(dAngle) * destination.distanceAU, y: Math.sin(dAngle) * destination.distanceAU };

    let clear = true;
    for (const obs of obstacles) {
      const soiR = soiRadiusAU(obs.distanceAU, obs.massEM, starMassEM);
      if (soiR <= 0) continue;

      const obsAngle = obs.angleRad + (2 * Math.PI * dayOffset) / originPeriod(obs);
      const obsPos = { x: Math.cos(obsAngle) * obs.distanceAU, y: Math.sin(obsAngle) * obs.distanceAU };

      const chord = checkLineCircleIntersection(oPos.x, oPos.y, dPos.x, dPos.y, obsPos.x, obsPos.y, soiR);
      if (chord > 0) {
        clear = false;
        break;
      }
    }

    if (clear) {
      return { waitDays: dayOffset, originPos: oPos, destPos: dPos };
    }
  }

  return null;
}

// Simple period estimator for TravelBody (Kepler's 3rd law, normalized)
function originPeriod(body: TravelBody): number {
  // T ∝ a^(3/2), with T=1 year at 1 AU around 1 M☉
  return Math.pow(body.distanceAU, 1.5) * 365.25;
}
