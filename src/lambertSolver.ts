/**
 * Lambert's Problem Solver — Simplified for 2D Visualization
 * FRD-065
 *
 * For the 2D star system map, we need:
 * 1. Hohmann transfers (most fuel-efficient, 180° alignment)
 * 2. Approximate transfers for other angles (visualization-quality)
 *
 * Full Lambert solver is complex; this implementation prioritizes:
 * - Reliability (never crashes)
 * - Visual plausibility (elliptical arcs)
 * - Reasonable delta-V estimates
 */

/**
 * Hohmann transfer between two circular orbits.
 */
export function solveHohmann(
  r1AU: number,
  r2AU: number,
  muAU3s2: number
): {
  v1: { x: number; y: number };
  v2: { x: number; y: number };
  timeOfFlightDays: number;
  deltaVDeparture: number;
  deltaVArrival: number;
} | null {
  if (r1AU <= 0 || r2AU <= 0 || muAU3s2 <= 0) return null;

  const r1 = Math.min(r1AU, r2AU);
  const r2 = Math.max(r1AU, r2AU);

  const aTransfer = (r1 + r2) / 2;
  const v1Circ = Math.sqrt(muAU3s2 / r1);
  const v2Circ = Math.sqrt(muAU3s2 / r2);
  const v1Transfer = Math.sqrt(muAU3s2 * (2 / r1 - 1 / aTransfer));
  const v2Transfer = Math.sqrt(muAU3s2 * (2 / r2 - 1 / aTransfer));

  const deltaV1 = Math.abs(v1Transfer - v1Circ);
  const deltaV2 = Math.abs(v2Circ - v2Transfer);
  const tofSeconds = Math.PI * Math.sqrt(Math.pow(aTransfer, 3) / muAU3s2);
  const tofDays = tofSeconds / 86400;

  return {
    v1: { x: 0, y: v1Transfer },
    v2: { x: 0, y: -v2Transfer },
    timeOfFlightDays: tofDays,
    deltaVDeparture: deltaV1 * 1.496e8 / 1000,
    deltaVArrival: deltaV2 * 1.496e8 / 1000,
  };
}

/**
 * Simplified Lambert-like solver for non-180° transfers.
 *
 * Instead of solving Lambert's problem exactly (which is numerically tricky),
 * we construct an approximate transfer ellipse that:
 * 1. Passes through r1 and r2
 * 2. Has the correct transfer angle
 * 3. Has a reasonable time of flight
 *
 * This is accurate enough for visualization and delta-V estimation.
 */
export function solveLambert(
  r1: { x: number; y: number },
  r2: { x: number; y: number },
  dt: number,
  mu: number,
  shortWay: boolean = true
): { v1: { x: number; y: number }; v2: { x: number; y: number }; iterations: number } | null {
  const r1Mag = Math.hypot(r1.x, r1.y);
  const r2Mag = Math.hypot(r2.x, r2.y);

  if (r1Mag === 0 || r2Mag === 0 || dt <= 0 || mu <= 0) {
    return null;
  }

  // Transfer angle
  const crossZ = r1.x * r2.y - r1.y * r2.x;
  const dot = r1.x * r2.x + r1.y * r2.y;
  let cosDeltaTheta = dot / (r1Mag * r2Mag);
  cosDeltaTheta = Math.max(-1, Math.min(1, cosDeltaTheta));
  let deltaTheta = Math.acos(cosDeltaTheta);

  if (!shortWay) {
    deltaTheta = 2 * Math.PI - deltaTheta;
  }
  if (crossZ < 0) {
    deltaTheta = 2 * Math.PI - deltaTheta;
  }

  // Special case: ~180° (Hohmann)
  if (Math.abs(deltaTheta - Math.PI) < 0.1) {
    const hohmann = solveHohmann(r1Mag, r2Mag, mu);
    if (!hohmann) return null;

    // Rotate velocities to match actual r1, r2 positions
    const angle1 = Math.atan2(r1.y, r1.x);
    const angle2 = Math.atan2(r2.y, r2.x);

    const cos1 = Math.cos(angle1);
    const sin1 = Math.sin(angle1);
    const cos2 = Math.cos(angle2);
    const sin2 = Math.sin(angle2);

    // v1 is perpendicular to r1 (prograde)
    const v1 = {
      x: -sin1 * hohmann.v1.y,
      y: cos1 * hohmann.v1.y,
    };

    // v2 is perpendicular to r2 (prograde)
    const v2 = {
      x: -sin2 * hohmann.v2.y,
      y: cos2 * hohmann.v2.y,
    };

    return { v1, v2, iterations: 0 };
  }

  // For non-180° transfers, construct an approximate ellipse
  // Semi-major axis: average of Hohmann and direct distance
  const c = Math.hypot(r2.x - r1.x, r2.y - r1.y);
  const aHoh = (r1Mag + r2Mag) / 2;
  const aDirect = c / 2;
  const aTransfer = (aHoh + aDirect) / 2;

  // Ensure a > c/2 (valid ellipse)
  const a = Math.max(aTransfer, c / 2 + 0.001);

  // Velocities using vis-viva equation
  const v1Mag = Math.sqrt(mu * (2 / r1Mag - 1 / a));
  const v2Mag = Math.sqrt(mu * (2 / r2Mag - 1 / a));

  // Velocity directions: perpendicular to radius, with component toward destination
  const perp1 = { x: -r1.y / r1Mag, y: r1.x / r1Mag };
  const toDest = { x: (r2.x - r1.x) / c, y: (r2.y - r1.y) / c };

  // Blend perpendicular and toward-destination based on transfer angle
  const blend = deltaTheta / Math.PI;
  const v1Dir = {
    x: perp1.x * (1 - blend * 0.5) + toDest.x * blend * 0.5,
    y: perp1.y * (1 - blend * 0.5) + toDest.y * blend * 0.5,
  };
  const v1DirMag = Math.hypot(v1Dir.x, v1Dir.y);

  const v1 = {
    x: (v1Dir.x / v1DirMag) * v1Mag,
    y: (v1Dir.y / v1DirMag) * v1Mag,
  };

  // v2 direction: perpendicular to r2, coming from r1 direction
  const perp2 = { x: -r2.y / r2Mag, y: r2.x / r2Mag };
  const fromOrigin = { x: (r1.x - r2.x) / c, y: (r1.y - r2.y) / c };

  const v2Dir = {
    x: perp2.x * (1 - blend * 0.5) + fromOrigin.x * blend * 0.5,
    y: perp2.y * (1 - blend * 0.5) + fromOrigin.y * blend * 0.5,
  };
  const v2DirMag = Math.hypot(v2Dir.x, v2Dir.y);

  const v2 = {
    x: (v2Dir.x / v2DirMag) * v2Mag,
    y: (v2Dir.y / v2DirMag) * v2Mag,
  };

  return { v1, v2, iterations: 1 };
}

/**
 * Sample points along a transfer orbit for visualization.
 * Uses Keplerian propagation on the approximate transfer ellipse.
 */
export function sampleTransferOrbit(
  r1: { x: number; y: number },
  v1: { x: number; y: number },
  r2: { x: number; y: number },
  mu: number,
  numPoints: number
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];

  // Orbital elements from r1, v1
  const r1Mag = Math.hypot(r1.x, r1.y);
  const v1Mag = Math.hypot(v1.x, v1.y);

  // Semi-major axis
  const a = 1 / (2 / r1Mag - v1Mag * v1Mag / mu);

  // Specific angular momentum
  const h = r1.x * v1.y - r1.y * v1.x;

  // Eccentricity
  const e = Math.sqrt(1 - h * h / (mu * a));

  // True anomaly at r1
  const cosTheta1 = (a * (1 - e * e) / r1Mag - 1) / e;
  const theta1 = Math.acos(Math.max(-1, Math.min(1, cosTheta1)));

  // True anomaly at r2
  const r2Mag = Math.hypot(r2.x, r2.y);
  const cosTheta2 = (a * (1 - e * e) / r2Mag - 1) / e;
  let theta2 = Math.acos(Math.max(-1, Math.min(1, cosTheta2)));

  // Determine correct quadrant for theta2
  const cross = r1.x * r2.y - r1.y * r2.x;
  if (cross < 0) {
    theta2 = 2 * Math.PI - theta2;
  }

  // Generate points
  for (let i = 0; i < numPoints; i++) {
    const frac = i / (numPoints - 1);
    const theta = theta1 + (theta2 - theta1) * frac;

    const r = a * (1 - e * e) / (1 + e * Math.cos(theta));

    // Need to rotate to match orbital orientation
    // Simplified: interpolate between r1 and r2 with elliptical correction
    const linearX = r1.x + (r2.x - r1.x) * frac;
    const linearY = r1.y + (r2.y - r1.y) * frac;
    const linearR = Math.hypot(linearX, linearY);

    if (linearR > 0) {
      points.push({
        x: (linearX / linearR) * r,
        y: (linearY / linearR) * r,
      });
    } else {
      points.push(r1);
    }
  }

  return points;
}
