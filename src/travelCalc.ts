/**
 * Brachistochrone travel math and body geometry.
 * Pure math — no DOM coupling.
 * FRD-060 §30
 */

import type { TravelBody, TravelInput, TravelResult, SoiHit, WaitResult, RoutingMode } from './types';
import { hillSphereAU } from './travelPhysics';
import { soiRadiusAU, checkLineCircleIntersection, detourAroundCircle, findClearDepartureWindow } from './soiChecker';

const G_MS2 = 9.80665; // 1 G in m/s²
const AU_TO_M = 1.496e11;
const DAY_TO_S = 86400;

/**
 * Convert a scene body to a TravelBody.
 */
export function toTravelBody(body: { id: string; label: string; distanceAU: number; angle: number; mass: number; type: string }, starMassSolar: number): TravelBody {
  return {
    id: body.id,
    label: body.label,
    distanceAU: body.distanceAU,
    angleRad: body.angle,
    massEM: body.mass,
    hillRadiusAU: hillSphereAU(body.mass, starMassSolar, body.distanceAU, body.type as import('./types').BodyType),
  };
}

/**
 * Position of a body in AU-space at a given day offset from epoch.
 */
export function bodyPositionAt(body: TravelBody, dayOffset: number, periodDays: number): { x: number; y: number } {
  const angle = body.angleRad + (periodDays > 0 ? (2 * Math.PI * dayOffset) / periodDays : 0);
  return {
    x: Math.cos(angle) * body.distanceAU,
    y: Math.sin(angle) * body.distanceAU,
  };
}

/**
 * Euclidean distance between two AU-space points.
 */
export function distanceAU(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Brachistochrone flight time under constant acceleration.
 * t = 2 * √(d / (2a))
 * where d = distance in metres, a = acceleration in m/s²
 */
export function brachistochroneTimeDays(distanceAU: number, accelG: number): number {
  if (distanceAU <= 0 || accelG <= 0) return 0;
  const dM = distanceAU * AU_TO_M;
  const aMs2 = accelG * G_MS2;
  const tS = 2 * Math.sqrt(dM / (2 * aMs2));
  return tS / DAY_TO_S;
}

/**
 * Build obstacles list (all bodies except origin and destination).
 */
export function buildObstacles(allBodies: TravelBody[], originId: string, destId: string, starMassEM: number): TravelBody[] {
  return allBodies.filter(b => b.id !== originId && b.id !== destId && b.massEM > 0);
}

/**
 * Calculate SOI intersections for a straight-line chord.
 */
export function findSoiIntersections(
  origin: TravelBody,
  destination: TravelBody,
  obstacles: TravelBody[],
  starMassEM: number
): SoiHit[] {
  const hits: SoiHit[] = [];
  const aPos = { x: origin.distanceAU, y: 0 }; // simplified — use actual angles
  const bPos = { x: destination.distanceAU, y: 0 };

  for (const obs of obstacles) {
    const soiR = soiRadiusAU(obs.distanceAU, obs.massEM, starMassEM);
    if (soiR <= 0) continue;

    const chordLen = checkLineCircleIntersection(
      origin.distanceAU, 0,
      destination.distanceAU, 0,
      obs.distanceAU, 0,
      soiR
    );

    if (chordLen > 0) {
      const detour = detourAroundCircle(chordLen, soiR);
      hits.push({
        bodyId: obs.id,
        bodyLabel: obs.label,
        soiRadiusAU: soiR,
        chordAU: chordLen,
        detourAddedAU: detour,
      });
    }
  }

  return hits;
}

/**
 * Main travel calculation.
 */
export function calculateTravel(input: TravelInput, allBodies: TravelBody[], starMassEM: number): TravelResult {
  const { origin, destination, accelG, routingMode, departureOffsetDays } = input;

  const directDist = distanceAU(
    { x: origin.distanceAU, y: 0 },
    { x: destination.distanceAU, y: 0 }
  );

  let pathDist = directDist;
  let detourAdded = 0;
  let soiHits: SoiHit[] = [];
  let waitAlt: WaitResult | null = null;

  if (routingMode === 'soi-safe') {
    const obstacles = buildObstacles(allBodies, origin.id, destination.id, starMassEM);
    soiHits = findSoiIntersections(origin, destination, obstacles, starMassEM);

    detourAdded = soiHits.reduce((sum, h) => sum + h.detourAddedAU, 0);
    pathDist = directDist + detourAdded;

    // Wait alternative
    const clearWindow = findClearDepartureWindow(origin, destination, obstacles, starMassEM, 365, 0.5);
    if (clearWindow) {
      const waitDist = distanceAU(
        { x: clearWindow.originPos.x, y: clearWindow.originPos.y },
        { x: clearWindow.destPos.x, y: clearWindow.destPos.y }
      );
      waitAlt = {
        waitDays: clearWindow.waitDays,
        pathDistanceAU: waitDist,
        flightTimeDays: brachistochroneTimeDays(waitDist, accelG),
        totalTimeDays: clearWindow.waitDays + brachistochroneTimeDays(waitDist, accelG),
        clearAtDeparture: true,
      };
    }
  }

  const flightTime = brachistochroneTimeDays(pathDist, accelG);

  return {
    routingMode,
    departureOffsetDays,
    pathDistanceAU: pathDist,
    flightTimeDays: flightTime,
    totalTimeDays: flightTime,
    soiIntersections: soiHits,
    detourAddedAU: detourAdded,
    waitAlternative: waitAlt,
  };
}
