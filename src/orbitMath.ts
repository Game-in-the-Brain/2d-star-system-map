import type { Point } from './types';

const EARTH_PERIOD_DAYS = 365.25;

/**
 * Calculate orbital period from semi-major axis (AU) using Kepler's 3rd Law.
 * T² = a³  (where T is in Earth years, a is in AU)
 */
export function calculatePeriodDays(a: number): number {
  return Math.pow(a, 1.5) * EARTH_PERIOD_DAYS;
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
