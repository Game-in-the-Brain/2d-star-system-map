/**
 * Patched Conic Trajectory Model
 * FRD-063 / FRD-065 Integration
 *
 * Models spacecraft trajectory as three segments:
 *   1. Departure hyperbola (escape from origin planet's SOI)
 *   2. Interplanetary transfer (Lambert arc between planets)
 *   3. Arrival hyperbola (capture at destination planet's SOI)
 *
 * For gravity assists, adds:
 *   4. Flyby hyperbola (gravity assist at intermediate body)
 */

import type { SceneBody } from './types';
import { solveLambert } from './lambertSolver';
import {
  calculateTurningAngle,
  calculateVInfinity,
  calculateAssistDeltaV,
  bodyMuKm3s2,
  circularOrbitalVelocityKms,
  bodyHeliocentricVelocityKms,
} from './gravityAssistPhysics';

// ─── Constants ───
const AU_TO_KM = 1.496e8;
const KM_TO_AU = 1 / AU_TO_KM;
const AU_TO_M = 1.496e11;
const DAY_TO_S = 86400;
const SOLAR_TO_EM = 332946;
const G = 6.674e-11;
const SOLAR_MU_M3S2 = 1.32712440018e20; // Standard gravitational parameter of Sun
const SOLAR_MU_AU3S2 = SOLAR_MU_M3S2 / Math.pow(AU_TO_M, 3); // ~3.9648e-14

/**
 * Calculate escape delta-V from a planet.
 *
 * Given the spacecraft's heliocentric velocity after the Lambert transfer,
 * calculate the required burn at the planet's surface to achieve that velocity.
 */
export function departureHyperbolaDeltaV(
  vEscapeHeliocentricKms: { x: number; y: number },
  planetHeliocentricVelocityKms: { x: number; y: number },
  planetMuKm3s2: number,
  parkingOrbitRadiusKm: number = 500 // 500 km parking orbit
): number {
  // V∞ = V_spacecraft - V_planet
  const vInf = {
    x: vEscapeHeliocentricKms.x - planetHeliocentricVelocityKms.x,
    y: vEscapeHeliocentricKms.y - planetHeliocentricVelocityKms.y,
  };
  const vInfMag = Math.hypot(vInf.x, vInf.y);

  // Escape velocity from parking orbit
  const vEscapeParking = Math.sqrt((2 * planetMuKm3s2) / parkingOrbitRadiusKm);

  // Required delta-V: sqrt(V_escape² + V∞²) - V_circular
  const vCircularParking = Math.sqrt(planetMuKm3s2 / parkingOrbitRadiusKm);
  const deltaV = Math.sqrt(vEscapeParking * vEscapeParking + vInfMag * vInfMag) - vCircularParking;

  return Math.max(0, deltaV);
}

/**
 * Calculate capture delta-V at a planet.
 *
 * Given the spacecraft's heliocentric velocity before arrival,
 * calculate the required burn to enter a parking orbit.
 */
export function arrivalHyperbolaDeltaV(
  vApproachHeliocentricKms: { x: number; y: number },
  planetHeliocentricVelocityKms: { x: number; y: number },
  planetMuKm3s2: number,
  parkingOrbitRadiusKm: number = 500
): number {
  // V∞ = V_spacecraft - V_planet
  const vInf = {
    x: vApproachHeliocentricKms.x - planetHeliocentricVelocityKms.x,
    y: vApproachHeliocentricKms.y - planetHeliocentricVelocityKms.y,
  };
  const vInfMag = Math.hypot(vInf.x, vInf.y);

  // Capture into parking orbit
  const vCircularParking = Math.sqrt(planetMuKm3s2 / parkingOrbitRadiusKm);
  const deltaV = Math.sqrt(vInfMag * vInfMag + 2 * vCircularParking * vCircularParking) - vCircularParking;

  return Math.max(0, deltaV);
}

/**
 * Compute a patched conic transfer from origin to destination.
 *
 * Returns the total delta-V and time of flight.
 */
export function patchedConicTransfer(
  origin: SceneBody,
  destination: SceneBody,
  starMassSolar: number,
  departureDayOffset: number = 0,
  timeOfFlightDays?: number
): {
  totalDeltaVKms: number;
  departureDeltaVKms: number;
  arrivalDeltaVKms: number;
  timeOfFlightDays: number;
  lambertResult: NonNullable<ReturnType<typeof solveLambert>>;
} | null {
  const starMuAU3s2 = SOLAR_MU_AU3S2 * starMassSolar;

  // Get positions at departure
  const originAngle = origin.angle + (origin.periodDays && origin.periodDays > 0
    ? (2 * Math.PI * departureDayOffset) / origin.periodDays
    : 0);
  const destAngle = destination.angle + (destination.periodDays && destination.periodDays > 0
    ? (2 * Math.PI * departureDayOffset) / destination.periodDays
    : 0);

  const r1 = {
    x: origin.distanceAU * Math.cos(originAngle),
    y: origin.distanceAU * Math.sin(originAngle),
  };

  // If no TOF specified, use Hohmann estimate
  let tofDays = timeOfFlightDays;
  if (!tofDays) {
    const aTransfer = (origin.distanceAU + destination.distanceAU) / 2;
    tofDays = (Math.PI * Math.sqrt(Math.pow(aTransfer, 3) / starMuAU3s2)) / DAY_TO_S;
  }

  const dt = tofDays * DAY_TO_S;

  // Lambert solve: find r2 at arrival time
  // For simplicity, assume destination hasn't moved much during transfer
  // (small angle approximation for first iteration)
  const r2 = {
    x: destination.distanceAU * Math.cos(destAngle),
    y: destination.distanceAU * Math.sin(destAngle),
  };

  const lambert = solveLambert(r1, r2, dt, starMuAU3s2, true);
  if (!lambert) return null;

  // Convert velocities from AU/s to km/s
  const v1Kms = {
    x: lambert.v1.x * AU_TO_KM,
    y: lambert.v1.y * AU_TO_KM,
  };
  const v2Kms = {
    x: lambert.v2.x * AU_TO_KM,
    y: lambert.v2.y * AU_TO_KM,
  };

  // Planet velocities
  const originPlanetVel = bodyHeliocentricVelocityKms(origin, starMassSolar);
  const destPlanetVel = bodyHeliocentricVelocityKms(destination, starMassSolar);

  // Departure and arrival delta-V
  const originMu = bodyMuKm3s2(origin.mass);
  const destMu = bodyMuKm3s2(destination.mass);

  const departureDeltaV = departureHyperbolaDeltaV(v1Kms, originPlanetVel, originMu);
  const arrivalDeltaV = arrivalHyperbolaDeltaV(v2Kms, destPlanetVel, destMu);

  return {
    totalDeltaVKms: departureDeltaV + arrivalDeltaV,
    departureDeltaVKms: departureDeltaV,
    arrivalDeltaVKms: arrivalDeltaV,
    timeOfFlightDays: tofDays,
    lambertResult: lambert,
  };
}

/**
 * Solve a single Lambert leg between two bodies.
 * Returns heliocentric velocities at departure and arrival, plus TOF.
 */
export function solveLambertLeg(
  origin: SceneBody,
  destination: SceneBody,
  starMassSolar: number,
  departureDayOffset: number = 0,
  timeOfFlightDays?: number
): {
  v1Kms: { x: number; y: number };
  v2Kms: { x: number; y: number };
  timeOfFlightDays: number;
} | null {
  const starMuAU3s2 = SOLAR_MU_AU3S2 * starMassSolar;

  const originAngle = origin.angle + (origin.periodDays && origin.periodDays > 0
    ? (2 * Math.PI * departureDayOffset) / origin.periodDays
    : 0);
  const destAngle = destination.angle + (destination.periodDays && destination.periodDays > 0
    ? (2 * Math.PI * departureDayOffset) / destination.periodDays
    : 0);

  const r1 = {
    x: origin.distanceAU * Math.cos(originAngle),
    y: origin.distanceAU * Math.sin(originAngle),
  };
  const r2 = {
    x: destination.distanceAU * Math.cos(destAngle),
    y: destination.distanceAU * Math.sin(destAngle),
  };

  let tofDays = timeOfFlightDays;
  if (!tofDays) {
    const aTransfer = (origin.distanceAU + destination.distanceAU) / 2;
    tofDays = (Math.PI * Math.sqrt(Math.pow(aTransfer, 3) / starMuAU3s2)) / DAY_TO_S;
  }

  const lambert = solveLambert(r1, r2, tofDays * DAY_TO_S, starMuAU3s2, true);
  if (!lambert) return null;

  return {
    v1Kms: { x: lambert.v1.x * AU_TO_KM, y: lambert.v1.y * AU_TO_KM },
    v2Kms: { x: lambert.v2.x * AU_TO_KM, y: lambert.v2.y * AU_TO_KM },
    timeOfFlightDays: tofDays,
  };
}

/**
 * Compute a gravity assist at an intermediate body.
 *
 * Chains: departure → Lambert to assist → flyby → Lambert to destination
 */
export function gravityAssistTransfer(
  origin: SceneBody,
  assistBody: SceneBody,
  destination: SceneBody,
  starMassSolar: number,
  departureDayOffset: number = 0,
  flybyAltitudeKm: number = 500
): {
  leg1DeltaVKms: number;
  leg2DeltaVKms: number;
  assistDeltaVKms: number;
  totalDeltaVKms: number;
  totalTimeDays: number;
  leg1TimeDays: number;
  leg2TimeDays: number;
  flybyTurningAngleDeg: number;
} | null {
  const starMuAU3s2 = SOLAR_MU_AU3S2 * starMassSolar;

  // Get positions
  const originAngle = origin.angle + (origin.periodDays && origin.periodDays > 0
    ? (2 * Math.PI * departureDayOffset) / origin.periodDays
    : 0);
  const assistAngle = assistBody.angle + (assistBody.periodDays && assistBody.periodDays > 0
    ? (2 * Math.PI * departureDayOffset) / assistBody.periodDays
    : 0);

  const r1 = {
    x: origin.distanceAU * Math.cos(originAngle),
    y: origin.distanceAU * Math.sin(originAngle),
  };
  const rAssist = {
    x: assistBody.distanceAU * Math.cos(assistAngle),
    y: assistBody.distanceAU * Math.sin(assistAngle),
  };

  // Leg 1: Origin → Assist (estimate TOF from Hohmann)
  const a1 = (origin.distanceAU + assistBody.distanceAU) / 2;
  const tof1 = (Math.PI * Math.sqrt(Math.pow(a1, 3) / starMuAU3s2)) / DAY_TO_S;
  const lambert1 = solveLambert(r1, rAssist, tof1 * DAY_TO_S, starMuAU3s2, true);
  if (!lambert1) return null;

  // Leg 2: Assist → Destination (depart after flyby)
  const a2 = (assistBody.distanceAU + destination.distanceAU) / 2;
  const tof2 = (Math.PI * Math.sqrt(Math.pow(a2, 3) / starMuAU3s2)) / DAY_TO_S;
  const arrivalDayOffset = departureDayOffset + tof1 + tof2;
  const destAngle = destination.angle + (destination.periodDays && destination.periodDays > 0
    ? (2 * Math.PI * arrivalDayOffset) / destination.periodDays
    : 0);
  const r2 = {
    x: destination.distanceAU * Math.cos(destAngle),
    y: destination.distanceAU * Math.sin(destAngle),
  };
  const lambert2 = solveLambert(rAssist, r2, tof2 * DAY_TO_S, starMuAU3s2, true);
  if (!lambert2) return null;

  // Convert velocities
  const vArrivalKms = {
    x: lambert1.v2.x * AU_TO_KM,
    y: lambert1.v2.y * AU_TO_KM,
  };
  const vDepartureKms = {
    x: lambert2.v1.x * AU_TO_KM,
    y: lambert2.v1.y * AU_TO_KM,
  };

  // Planet velocity at assist body
  const assistPlanetVel = bodyHeliocentricVelocityKms(assistBody, starMassSolar);

  // V∞ before and after flyby
  const vInfIn = calculateVInfinity(vArrivalKms, assistPlanetVel);
  const vInfOut = calculateVInfinity(vDepartureKms, assistPlanetVel);

  // ── Gravity-assist compatibility checks ──
  // V∞ magnitude must be preserved (energy conservation)
  const vInfDiff = Math.abs(vInfIn.magnitude - vInfOut.magnitude);
  if (vInfIn.magnitude === 0 || vInfOut.magnitude === 0 || vInfDiff / vInfIn.magnitude > 0.05) {
    return null; // Incompatible V∞ magnitudes — flyby cannot bridge the two legs
  }

  // Required turn angle: angle between incoming and outgoing V∞ vectors
  const cosRequiredTurn = Math.max(-1, Math.min(1,
    vInfIn.direction.x * vInfOut.direction.x + vInfIn.direction.y * vInfOut.direction.y
  ));
  const requiredTurnRad = Math.acos(cosRequiredTurn);

  // Maximum turn angle for this flyby geometry
  const assistMu = bodyMuKm3s2(assistBody.mass);
  const assistRadiusKm = estimateBodyRadiusKm(assistBody.mass, assistBody.type);
  const periapsisKm = assistRadiusKm + flybyAltitudeKm;
  const maxTurnRad = calculateTurningAngle(periapsisKm, vInfIn.magnitude, assistMu);

  if (requiredTurnRad > maxTurnRad) {
    return null; // Flyby cannot turn enough to match the required departure direction
  }

  // Determine flyby side from the cross product of V∞ vectors
  // Positive z → rotate V∞ counter-clockwise → trailing side (gain speed)
  // Negative z → rotate V∞ clockwise → leading side (lose speed)
  const crossZ = vInfIn.direction.x * vInfOut.direction.y - vInfIn.direction.y * vInfOut.direction.x;
  const side: 'leading' | 'trailing' = crossZ >= 0 ? 'trailing' : 'leading';

  // Apply the gravity assist with the REQUIRED turn angle (not the maximum)
  const vAfterAssist = calculateAssistDeltaV(
    { x: vInfIn.direction.x * vInfIn.magnitude, y: vInfIn.direction.y * vInfIn.magnitude },
    assistPlanetVel,
    requiredTurnRad,
    side
  );

  const assistDeltaV = Math.hypot(
    vAfterAssist.x - vArrivalKms.x,
    vAfterAssist.y - vArrivalKms.y
  );

  // Leg delta-Vs
  const originPlanetVel = bodyHeliocentricVelocityKms(origin, starMassSolar);
  const destPlanetVel = bodyHeliocentricVelocityKms(destination, starMassSolar);
  const originMu = bodyMuKm3s2(origin.mass);
  const destMu = bodyMuKm3s2(destination.mass);

  const v1Kms = { x: lambert1.v1.x * AU_TO_KM, y: lambert1.v1.y * AU_TO_KM };
  const leg1DeltaV = departureHyperbolaDeltaV(v1Kms, originPlanetVel, originMu);

  const v2Kms = { x: lambert2.v2.x * AU_TO_KM, y: lambert2.v2.y * AU_TO_KM };
  const leg2DeltaV = arrivalHyperbolaDeltaV(v2Kms, destPlanetVel, destMu);

  return {
    leg1DeltaVKms: leg1DeltaV,
    leg2DeltaVKms: leg2DeltaV,
    assistDeltaVKms: assistDeltaV,
    totalDeltaVKms: leg1DeltaV + leg2DeltaV,
    totalTimeDays: tof1 + tof2,
    leg1TimeDays: tof1,
    leg2TimeDays: tof2,
    flybyTurningAngleDeg: (requiredTurnRad * 180) / Math.PI,
  };
}

function estimateBodyRadiusKm(massEM: number, type: string): number {
  const EARTH_RADIUS_KM = 6371;
  if (type.includes('gas') || type.includes('jovian')) {
    return EARTH_RADIUS_KM * Math.pow(massEM, 0.5);
  }
  if (type.includes('dwarf')) {
    return EARTH_RADIUS_KM * Math.pow(massEM, 0.25);
  }
  return EARTH_RADIUS_KM * Math.pow(massEM, 0.28);
}
