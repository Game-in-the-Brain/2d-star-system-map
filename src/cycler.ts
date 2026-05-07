/**
 * Orbital Cycler Calculator
 * FRD-071 — Resonant orbits between two planets
 *
 * A cycler is a spacecraft on a resonant heliocentric orbit that
 * repeatedly encounters two planets. Passengers/cargo transfer at
 * each encounter; the cycler itself never stops.
 */

import type { SceneBody } from './types';

const DAY_TO_S = 86400;
const SOLAR_MU_M3S2 = 1.32712440018e20;
const AU_TO_M = 1.496e11;
const SOLAR_MU_AU3S2 = SOLAR_MU_M3S2 / Math.pow(AU_TO_M, 3);

/**
 * Result of computing a cycler orbit between two planets.
 */
export interface CyclerOrbit {
  /** Semi-major axis in AU */
  a: number;
  /** Eccentricity */
  e: number;
  /** Orbital period in days */
  periodDays: number;
  /** Synodic period between the two planets in days */
  synodicPeriodDays: number;
  /** Integer ratio: n cycler orbits ≈ m inner planet orbits */
  resonance: { n: number; m: number };
  /** Position of the cycler at epoch (days=0) in AU */
  initialPosition: { x: number; y: number };
  /** True anomaly at epoch in radians */
  initialTrueAnomaly: number;
  /** Semi-minor axis in AU */
  b: number;
  /** Argument of periapsis in radians (orientation of the ellipse) */
  argumentOfPeriapsis: number;
  /** Days between consecutive encounters with the inner planet */
  encounterIntervalDays: number;
  /** Estimated station-keeping ΔV per year in m/s */
  stationKeepingMpsPerYear: number;
}

/**
 * Compute a resonant cycler orbit between two planets.
 *
 * The algorithm searches for a small-integer ratio n:m such that
 * n · T_cycler ≈ m · T_inner, which ensures the cycler returns to
 * the inner planet's vicinity regularly.
 */
export function computeCyclerOrbit(
  innerBody: SceneBody,
  outerBody: SceneBody,
  starMassSolar: number
): CyclerOrbit | null {
  const mu = SOLAR_MU_AU3S2 * starMassSolar;

  const T1 = innerBody.periodDays;
  const T2 = outerBody.periodDays;

  if (!T1 || !T2 || T1 <= 0 || T2 <= 0) return null;

  // Synodic period
  const T_syn = 1 / Math.abs(1 / T1 - 1 / T2);

  // Search for best integer ratio n:m where n·T_cycler ≈ m·T1
  // and T_cycler is reasonable (not too short, not too long)
  let best = { n: 1, m: 1, error: Infinity };
  const maxN = 15;
  const maxM = 15;

  for (let n = 1; n <= maxN; n++) {
    for (let m = 1; m <= maxM; m++) {
      const T_cycler = (m * T1) / n;

      // Reject unreasonably short or long periods
      if (T_cycler < T1 * 0.8) continue;
      if (T_cycler > T_syn * 3) continue;

      // Compute how well this cycler period aligns with the outer planet
      const outerEncounters = T_cycler / T2;
      const outerError = Math.abs(outerEncounters - Math.round(outerEncounters));

      // Combined error: must align with both planets
      const error = outerError + Math.abs((n * T_cycler) / T_syn - m) * 0.1;

      if (error < best.error) {
        best = { n, m, error };
      }
    }
  }

  if (best.error === Infinity) return null;

  const T_cycler = (best.m * T1) / best.n;

  // Semi-major axis from Kepler's 3rd law
  const a = Math.pow(
    mu * Math.pow((T_cycler * DAY_TO_S) / (2 * Math.PI), 2),
    1 / 3
  );

  // Eccentricity: periapsis near inner, apoapsis near outer
  // For a cycler, we want the orbit to pass near both planets
  // r_peri = a(1-e), r_apo = a(1+e)
  // We want r_peri ≈ r_inner and r_apo ≈ r_outer
  const r1 = innerBody.distanceAU;
  const r2 = outerBody.distanceAU;

  // Solve for e given a, r_peri ≈ r1, r_apo ≈ r2
  // But a is fixed by period. If a != (r1+r2)/2, we can't hit both exactly.
  // Use the average and compute e from a
  const e = Math.min(0.95, Math.abs(r2 - r1) / (2 * a));

  // Ensure periapsis is at the inner planet distance
  const r_peri = a * (1 - e);
  const r_apo = a * (1 + e);

  // Argument of periapsis: point periapsis toward the inner planet's current position
  const innerAngle = innerBody.angle;
  const argumentOfPeriapsis = innerAngle;

  // Initial position at epoch: start at periapsis (inner planet vicinity)
  const initialTrueAnomaly = 0;
  const initialPosition = {
    x: r_peri * Math.cos(argumentOfPeriapsis),
    y: r_peri * Math.sin(argumentOfPeriapsis),
  };

  // Semi-minor axis
  const b = a * Math.sqrt(1 - e * e);

  // Station-keeping estimate (simplified)
  // Inner system = more perturbations from other planets
  const avgDist = (r1 + r2) / 2;
  const stationKeepingMpsPerYear = avgDist < 2 ? 50 : avgDist < 5 ? 25 : 10;

  return {
    a,
    e,
    periodDays: T_cycler,
    synodicPeriodDays: T_syn,
    resonance: { n: best.n, m: best.m },
    initialPosition,
    initialTrueAnomaly,
    b,
    argumentOfPeriapsis,
    encounterIntervalDays: T_cycler / best.n,
    stationKeepingMpsPerYear,
  };
}

/**
 * Compute the cycler's heliocentric position at a given day offset.
 */
export function cyclerPositionAt(
  cycler: CyclerOrbit,
  dayOffset: number
): { x: number; y: number } {
  // Mean motion
  const n = (2 * Math.PI) / cycler.periodDays;

  // Mean anomaly
  const M = cycler.initialTrueAnomaly + n * dayOffset;

  // Solve Kepler's equation for eccentric anomaly E
  // E - e·sin(E) = M
  let E = M;
  for (let i = 0; i < 10; i++) {
    E = M + cycler.e * Math.sin(E);
  }

  // True anomaly
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const sqrtFactor = Math.sqrt((1 + cycler.e) / (1 - cycler.e));
  const nu = 2 * Math.atan2(sqrtFactor * sinE, cosE - cycler.e);

  // Radial distance
  const r = cycler.a * (1 - cycler.e * cycler.e) / (1 + cycler.e * Math.cos(nu));

  // Position in orbital plane, rotated by argument of periapsis
  const theta = nu + cycler.argumentOfPeriapsis;

  return {
    x: r * Math.cos(theta),
    y: r * Math.sin(theta),
  };
}

/**
 * Sample points along the cycler orbit for visualization.
 */
export function sampleCyclerOrbit(
  cycler: CyclerOrbit,
  numPoints: number
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < numPoints; i++) {
    const dayOffset = (i / numPoints) * cycler.periodDays;
    points.push(cyclerPositionAt(cycler, dayOffset));
  }
  return points;
}

/**
 * Generate a schedule of N cyclers on the same route, staggered.
 */
export interface CyclerSchedule {
  cyclerIndex: number;
  phaseOffsetDays: number;
  nextEncounterDays: number;
}

export function generateCyclerSchedule(
  cycler: CyclerOrbit,
  numCyclers: number,
  currentDayOffset: number
): CyclerSchedule[] {
  const schedule: CyclerSchedule[] = [];

  for (let i = 0; i < numCyclers; i++) {
    const phaseOffsetDays = (i / numCyclers) * cycler.periodDays;

    // Find next encounter after currentDayOffset
    const elapsed = currentDayOffset - phaseOffsetDays;
    const orbitsCompleted = Math.floor(elapsed / cycler.encounterIntervalDays);
    const nextEncounterDays =
      phaseOffsetDays + (orbitsCompleted + 1) * cycler.encounterIntervalDays;

    schedule.push({
      cyclerIndex: i + 1,
      phaseOffsetDays,
      nextEncounterDays: Math.max(0, nextEncounterDays - currentDayOffset),
    });
  }

  return schedule;
}

/**
 * Nuclear-Ion drive parameters.
 */
export interface IonDriveProfile {
  thrustN: number;
  ispS: number;
  massFlowKgs: number;
}

export const DEFAULT_ION_DRIVE: IonDriveProfile = {
  thrustN: 0.25,
  ispS: 4000,
  get massFlowKgs() {
    return this.thrustN / (this.ispS * 9.80665);
  },
};

/**
 * Compute propellant mass required for a given delta-V using Tsiolkovsky.
 */
export function propellantMassKgs(
  dryMassKgs: number,
  deltaVKms: number,
  ispS: number
): number {
  const ve = ispS * 9.80665; // exhaust velocity in m/s
  const deltaV = deltaVKms * 1000;
  return dryMassKgs * (Math.exp(deltaV / ve) - 1);
}
