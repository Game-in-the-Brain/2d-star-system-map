import type { Point } from './types';

const EARTH_PERIOD_DAYS = 365.25;
const G = 6.674e-11; // m³ kg⁻¹ s⁻²
const EM_TO_KG = 5.972e24; // kg
const AU_TO_M = 1.496e11; // m
const SECONDS_PER_DAY = 86400;

/**
 * Calculate orbital period from semi-major axis (AU) using Kepler's 3rd Law.
 * T² = a³  (where T is in Earth years, a is in AU)
 */
export function calculatePeriodDays(a: number): number {
  return Math.pow(a, 1.5) * EARTH_PERIOD_DAYS;
}

/**
 * Calculate orbital period for a moon orbiting a planet.
 * T = 2π × √(a³ / (G × M))  where a is in metres, M is in kg.
 */
export function calculateMoonPeriodDays(parentMassEM: number, orbitAU: number): number {
  if (orbitAU <= 0 || parentMassEM <= 0) return 0;
  const a = orbitAU * AU_TO_M;
  const M = parentMassEM * EM_TO_KG;
  const T_seconds = 2 * Math.PI * Math.sqrt((a * a * a) / (G * M));
  return T_seconds / SECONDS_PER_DAY;
}

/**
 * Given a distance (AU) and an orbital angle (radians), return the
 * body's position in AU-space assuming a circular orbit.
 */
export function getOrbitalPosition(a: number, angle: number): Point {
  return {
    x: Math.cos(angle) * a,
    y: Math.sin(angle) * a,
  };
}

/**
 * How many radians a body moves given its period and a time delta in days.
 */
export function daysToAngleOffset(periodDays: number, days: number): number {
  if (periodDays <= 0) return 0;
  return (2 * Math.PI * days) / periodDays;
}

/**
 * Calculate orbital velocity in km/s for a body orbiting a star.
 * v = 29.78 × √(M☉ / a)  where M☉ is star mass, a is distance in AU.
 * With ±5% variance to simulate orbital eccentricity.
 */
export function calculateOrbitalVelocityKms(starMassSolar: number, distanceAU: number, variance = 0.05): number {
  if (distanceAU <= 0 || starMassSolar <= 0) return 0;
  const baseVelocity = 29.78 * Math.sqrt(starMassSolar / distanceAU);
  const v = 1 + (Math.random() * 2 - 1) * variance;
  return Math.round(baseVelocity * v * 100) / 100;
}

/**
 * Calculate orbital velocity in km/s for a moon orbiting a planet.
 * v = √(G × M / r)  converted to km/s.
 * M in Earth masses, r in AU (converted to metres).
 * With ±5% variance.
 */
export function calculateMoonOrbitalVelocityKms(parentMassEM: number, orbitAU: number, variance = 0.05): number {
  if (orbitAU <= 0 || parentMassEM <= 0) return 0;
  const r = orbitAU * AU_TO_M;
  const M = parentMassEM * EM_TO_KG;
  const baseVelocity = Math.sqrt((G * M) / r); // m/s
  const v = 1 + (Math.random() * 2 - 1) * variance;
  return Math.round((baseVelocity / 1000) * v * 100) / 100;
}

/**
 * Hash a string into a deterministic float in [0, 1).
 * Useful for generating consistent initial angles from a system ID.
 */
export function hashToFloat(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return (Math.abs(hash) % 1000000) / 1000000;
}
