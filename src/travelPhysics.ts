import type { SceneBody, Point, BodyType, TravelPlan } from './types';

const G = 6.674e-11; // m³ kg⁻¹ s⁻²
const EM_TO_KG = 5.972e24; // kg
const AU_TO_M = 1.496e11; // m
const EARTH_RADIUS_KM = 6371;
const SECONDS_PER_DAY = 86400;
const AU_TO_KM = 1.496e8;

const SOLAR_TO_EM = 332946; // 1 solar mass in Earth masses

/**
 * Hill sphere radius in AU for a body orbiting a star.
 * Returns 0 for stars and moons (no meaningful Hill sphere in map context).
 */
export function hillSphereAU(
  bodyMassEM: number,
  starMassSolar: number,
  distanceAU: number,
  bodyType: BodyType
): number {
  if (bodyType.startsWith('star') || bodyType === 'moon' || distanceAU <= 0) return 0;
  const massRatio = bodyMassEM / (3 * starMassSolar * SOLAR_TO_EM);
  return distanceAU * Math.cbrt(massRatio);
}

/**
 * Estimate planetary radius in km from mass (Earth masses) and body type.
 * Used because physical radii are not present in the MWG StarSystem payload.
 */
export function estimateRadiusKm(massEM: number, type: BodyType): number {
  if (type.startsWith('gas')) {
    // Gas giant: R ∝ M^0.5, saturate near brown-dwarf limit (~13 Jupiter radii)
    const jupiterRadii = Math.min(Math.pow(massEM, 0.5), 13 * 11.2);
    return EARTH_RADIUS_KM * jupiterRadii;
  }
  if (type === 'dwarf') {
    return EARTH_RADIUS_KM * Math.pow(Math.max(massEM, 0.01), 0.25);
  }
  // Rocky / icy worlds / moons / stars (stars handled separately)
  return EARTH_RADIUS_KM * Math.pow(Math.max(massEM, 0.01), 0.28);
}

/**
 * Calculate escape velocity in km/s for a body.
 * v_esc = sqrt(2 * G * M / R)
 */
export function calculateEscapeVelocityKms(massEM: number, radiusKm: number): number {
  if (radiusKm <= 0 || massEM <= 0) return 0;
  const M = massEM * EM_TO_KG;
  const R = radiusKm * 1000; // metres
  const vEscMps = Math.sqrt((2 * G * M) / R);
  return Math.round((vEscMps / 1000) * 100) / 100;
}

/**
 * Get the position of a body in AU-space at a given day offset from epoch.
 * For L1 bodies: orbits the star directly.
 * For moons: orbits parent, which orbits the star.
 */
export function getBodyPositionAU(
  body: SceneBody,
  dayOffset: number,
  allBodies: SceneBody[]
): Point {
  if (!body.parentId) {
    const angle =
      body.angle +
      (body.periodDays > 0 ? (2 * Math.PI * dayOffset) / body.periodDays : 0);
    return {
      x: Math.cos(angle) * body.distanceAU,
      y: Math.sin(angle) * body.distanceAU,
    };
  }

  // Moon: compute parent position first, then add moon offset
  const parent = allBodies.find((b) => b.id === body.parentId);
  if (!parent) {
    // Fallback: treat as heliocentric at its distanceAU
    const angle =
      body.angle +
      (body.periodDays > 0 ? (2 * Math.PI * dayOffset) / body.periodDays : 0);
    return {
      x: Math.cos(angle) * body.distanceAU,
      y: Math.sin(angle) * body.distanceAU,
    };
  }

  const parentPos = getBodyPositionAU(parent, dayOffset, allBodies);
  const moonAngle =
    body.angle +
    (body.periodDays > 0 ? (2 * Math.PI * dayOffset) / body.periodDays : 0);

  // Moon orbit radius in AU
  const moonOrbitAU = body.moonOrbitAU ?? 0.001; // sensible fallback
  return {
    x: parentPos.x + Math.cos(moonAngle) * moonOrbitAU,
    y: parentPos.y + Math.sin(moonAngle) * moonOrbitAU,
  };
}

/**
 * Calculate synodic period between two orbiting bodies in days.
 * T_synodic = 1 / |1/T1 - 1/T2|
 */
export function calculateSynodicPeriodDays(period1: number, period2: number): number {
  if (period1 <= 0 || period2 <= 0) return 0;
  return 1 / Math.abs(1 / period1 - 1 / period2);
}

/**
 * Find the next favorable launch window (shortest distance) after a given day offset.
 * Searches forward in 1-day steps for one full synodic period.
 */
export function findNextWindowDayOffset(
  origin: SceneBody,
  destination: SceneBody,
  afterDayOffset: number,
  allBodies: SceneBody[]
): number {
  const synodic = calculateSynodicPeriodDays(origin.periodDays, destination.periodDays);
  if (synodic <= 0) return afterDayOffset;

  let minDist = Infinity;
  let bestDay = afterDayOffset;
  const searchDays = Math.min(Math.ceil(synodic), 3650);

  for (let day = 0; day <= searchDays; day++) {
    const t = afterDayOffset + day;
    const oPos = getBodyPositionAU(origin, t, allBodies);
    const dPos = getBodyPositionAU(destination, t, allBodies);
    const dist = Math.hypot(dPos.x - oPos.x, dPos.y - oPos.y);
    if (dist < minDist) {
      minDist = dist;
      bestDay = t;
    }
  }

  return bestDay;
}

interface ArrivalWindow {
  optimistic: number;
  pessimistic: number;
}

/**
 * Goal-seeking arrival calculator.
 * Searches day-by-day from departure to find when the spacecraft can reach the destination.
 *
 * @param origin - Departure body
 * @param destination - Arrival body
 * @param departureDayOffset - Days from epoch when departure occurs
 * @param excessVelocityKms - Delta-V remaining after escape and capture (km/s)
 * @param allBodies - Full scene graph for parent lookups
 * @param maxSearchDays - Maximum days to search (default 10 years)
 * @returns optimistic and pessimistic arrival days, or null if unreachable
 */
export function findArrivalWindow(
  origin: SceneBody,
  destination: SceneBody,
  departureDayOffset: number,
  excessVelocityKms: number,
  allBodies: SceneBody[],
  maxSearchDays = 3650
): ArrivalWindow | null {
  if (excessVelocityKms <= 0) return null;

  const originPos = getBodyPositionAU(origin, departureDayOffset, allBodies);
  let optimistic: number | null = null;

  for (let day = 1; day <= maxSearchDays; day++) {
    const t = departureDayOffset + day;
    const destPos = getBodyPositionAU(destination, t, allBodies);

    const dx = destPos.x - originPos.x;
    const dy = destPos.y - originPos.y;
    const directDistAU = Math.hypot(dx, dy);

    // Angular separation from star for pessimistic path factor
    const angleFromStar = Math.abs(
      Math.atan2(originPos.y, originPos.x) - Math.atan2(destPos.y, destPos.x)
    );
    const wrappedAngle = Math.min(angleFromStar, 2 * Math.PI - angleFromStar);
    const pathFactor = 1 + 0.3 * Math.sin(wrappedAngle / 2);
    const pessimisticDistAU = directDistAU * pathFactor;

    const rangeAU = (excessVelocityKms * day * SECONDS_PER_DAY) / AU_TO_KM;

    if (optimistic === null && rangeAU >= directDistAU) {
      optimistic = day;
    }
    if (rangeAU >= pessimisticDistAU) {
      return {
        optimistic: optimistic ?? day,
        pessimistic: day,
      };
    }
  }

  return null;
}

/**
 * Compute minimum and maximum distance between two orbiting bodies
 * over one full synodic period.
 */
export function computeMinMaxDistanceAU(
  origin: SceneBody,
  destination: SceneBody,
  allBodies: SceneBody[]
): { min: number; max: number } {
  const synodic = calculateSynodicPeriodDays(origin.periodDays, destination.periodDays);
  if (synodic <= 0) return { min: 0, max: 0 };

  let minDist = Infinity;
  let maxDist = 0;
  const steps = Math.min(Math.ceil(synodic), 3650);

  for (let day = 0; day <= steps; day++) {
    const oPos = getBodyPositionAU(origin, day, allBodies);
    const dPos = getBodyPositionAU(destination, day, allBodies);
    const dist = Math.hypot(dPos.x - oPos.x, dPos.y - oPos.y);
    if (dist < minDist) minDist = dist;
    if (dist > maxDist) maxDist = dist;
  }

  return { min: minDist, max: maxDist };
}

/**
 * Calculate additional delta-V cost for traversing through other bodies'
 * Hill Spheres / Spheres of Influence (HRS/SOI) along the transfer path.
 *
 * Algorithm:
 * 1. Sample points along the straight-line chord from origin to destination
 *    at departure time.
 * 2. For each non-star body (excluding origin and destination), check if any
 *    sample point falls within its Hill sphere radius.
 * 3. If so, add that body's escape velocity to the total HRS traversal cost.
 *
 * This is a conservative approximation; actual trajectories may deviate.
 */
export function calculateHrsTraversalCostKms(
  origin: SceneBody,
  destination: SceneBody,
  departureDayOffset: number,
  allBodies: SceneBody[],
  starMassSolar: number
): { hrsCostKms: number; bodiesEncountered: string[] } {
  const originPos = getBodyPositionAU(origin, departureDayOffset, allBodies);
  const destPos = getBodyPositionAU(destination, departureDayOffset, allBodies);

  const dx = destPos.x - originPos.x;
  const dy = destPos.y - originPos.y;
  const chordLength = Math.hypot(dx, dy);
  const samples = Math.max(20, Math.ceil(chordLength * 50)); // ~0.02 AU resolution

  const encountered: string[] = [];
  let totalCost = 0;

  for (const body of allBodies) {
    if (body.id === origin.id || body.id === destination.id) continue;
    if (body.type.startsWith('star')) continue;

    const hillR = hillSphereAU(body.mass, starMassSolar, body.distanceAU, body.type);
    if (hillR <= 0) continue;

    const bodyPos = getBodyPositionAU(body, departureDayOffset, allBodies);

    // Check minimum distance from body center to the chord line segment
    let minDistToChord = Infinity;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const px = originPos.x + dx * t;
      const py = originPos.y + dy * t;
      const dist = Math.hypot(px - bodyPos.x, py - bodyPos.y);
      if (dist < minDistToChord) minDistToChord = dist;
      if (minDistToChord <= hillR) break; // Early exit
    }

    if (minDistToChord <= hillR) {
      const bodyRadiusKm = estimateRadiusKm(body.mass, body.type);
      const escKms = calculateEscapeVelocityKms(body.mass, bodyRadiusKm);
      totalCost += escKms;
      encountered.push(body.label);
    }
  }

  return { hrsCostKms: Math.round(totalCost * 100) / 100, bodiesEncountered: encountered };
}

/**
 * Build a complete TravelPlan from user inputs.
 */
export function buildTravelPlan(
  origin: SceneBody,
  destination: SceneBody,
  deltaVBudgetKms: number,
  departureDayOffset: number,
  allBodies: SceneBody[],
  starMassSolar = 1
): TravelPlan {
  const originRadiusKm = estimateRadiusKm(origin.mass, origin.type);
  const destRadiusKm = estimateRadiusKm(destination.mass, destination.type);

  const escapeOriginKms = calculateEscapeVelocityKms(origin.mass, originRadiusKm);
  const captureDestKms = calculateEscapeVelocityKms(destination.mass, destRadiusKm);

  // HRS/SOI traversal cost
  const { hrsCostKms, bodiesEncountered } = calculateHrsTraversalCostKms(
    origin, destination, departureDayOffset, allBodies, starMassSolar
  );

  const totalCostKms = escapeOriginKms + captureDestKms + hrsCostKms;
  const excessDeltaVKms = Math.round((deltaVBudgetKms - totalCostKms) * 100) / 100;

  let failureReason: string | undefined;
  if (deltaVBudgetKms < escapeOriginKms) {
    failureReason = `Insufficient ΔV to escape ${origin.label} (${escapeOriginKms.toFixed(2)} km/s required).`;
  } else if (deltaVBudgetKms < escapeOriginKms + captureDestKms) {
    failureReason = `Insufficient ΔV to capture at ${destination.label} (${captureDestKms.toFixed(2)} km/s required).`;
  } else if (excessDeltaVKms <= 0) {
    failureReason = `HRS/SOI traversal cost (${hrsCostKms.toFixed(2)} km/s) exceeds remaining budget.`;
    if (bodiesEncountered.length > 0) {
      failureReason += ` Encountered: ${bodiesEncountered.join(', ')}.`;
    }
  }

  const synodicPeriodDays = calculateSynodicPeriodDays(origin.periodDays, destination.periodDays);
  const nextWindowDayOffset = findNextWindowDayOffset(
    origin,
    destination,
    departureDayOffset,
    allBodies
  );

  const window =
    excessDeltaVKms > 0
      ? findArrivalWindow(
          origin,
          destination,
          departureDayOffset,
          excessDeltaVKms,
          allBodies
        )
      : null;

  if (!window && excessDeltaVKms > 0) {
    failureReason = (failureReason ? failureReason + ' ' : '') +
      'Transfer window not found within search horizon (10 years).';
  }

  return {
    originId: origin.id,
    destinationId: destination.id,
    departureDayOffset,
    deltaVBudgetKms,
    escapeOriginKms,
    captureDestKms,
    excessDeltaVKms,
    optimisticArrivalDays: window?.optimistic ?? 0,
    pessimisticArrivalDays: window?.pessimistic ?? 0,
    synodicPeriodDays,
    nextWindowDayOffset,
    isPossible: excessDeltaVKms > 0 && window !== null,
    failureReason,
    hrsCostKms,
    totalCostKms,
  };
}
