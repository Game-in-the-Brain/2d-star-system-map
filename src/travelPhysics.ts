import type { SceneBody, Point, BodyType, TravelPlan } from './types';

const G = 6.674e-11; // m³ kg⁻¹ s⁻²
const EM_TO_KG = 5.972e24; // kg
const AU_TO_M = 1.496e11; // m
const EARTH_RADIUS_KM = 6371;
const SECONDS_PER_DAY = 86400;
const AU_TO_KM = 1.496e8;

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
 * Compute the minimum and maximum distance between two bodies over one synodic period.
 */
export function computeMinMaxDistanceAU(
  origin: SceneBody,
  destination: SceneBody,
  allBodies: SceneBody[]
): { min: number; max: number } {
  const synodic = calculateSynodicPeriodDays(origin.periodDays, destination.periodDays);
  const searchDays = Math.min(Math.ceil(synodic) || 365, 3650);
  let minDist = Infinity;
  let maxDist = 0;

  for (let day = 0; day <= searchDays; day++) {
    const oPos = getBodyPositionAU(origin, day, allBodies);
    const dPos = getBodyPositionAU(destination, day, allBodies);
    const dist = Math.hypot(dPos.x - oPos.x, dPos.y - oPos.y);
    minDist = Math.min(minDist, dist);
    maxDist = Math.max(maxDist, dist);
  }

  return { min: minDist, max: maxDist };
}

/**
 * Build a complete TravelPlan from user inputs.
 */
export function buildTravelPlan(
  origin: SceneBody,
  destination: SceneBody,
  deltaVBudgetKms: number,
  departureDayOffset: number,
  allBodies: SceneBody[]
): TravelPlan {
  const originRadiusKm = estimateRadiusKm(origin.mass, origin.type);
  const destRadiusKm = estimateRadiusKm(destination.mass, destination.type);

  const escapeOriginKms = calculateEscapeVelocityKms(origin.mass, originRadiusKm);
  const captureDestKms = calculateEscapeVelocityKms(destination.mass, destRadiusKm);
  const excessDeltaVKms = Math.round((deltaVBudgetKms - escapeOriginKms - captureDestKms) * 100) / 100;

  const { min: minDistanceAU, max: maxDistanceAU } = computeMinMaxDistanceAU(
    origin,
    destination,
    allBodies
  );

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

  let failureReason: string | null = null;
  if (deltaVBudgetKms < escapeOriginKms) {
    failureReason = `Cannot escape ${origin.label}. Need ${escapeOriginKms} km/s, have ${deltaVBudgetKms} km/s.`;
  } else if (deltaVBudgetKms < escapeOriginKms + captureDestKms) {
    const remaining = Math.round((deltaVBudgetKms - escapeOriginKms) * 100) / 100;
    failureReason = `Can escape origin (${escapeOriginKms} km/s) but cannot capture at ${destination.label}. Need ${captureDestKms} km/s, only ${remaining} km/s remaining.`;
  } else if (!window) {
    failureReason = `Excess ΔV (${excessDeltaVKms} km/s) too low to reach ${destination.label} within 10 years.`;
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
    minDistanceAU,
    maxDistanceAU,
    failureReason,
  };
}
