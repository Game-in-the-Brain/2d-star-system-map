#!/usr/bin/env node
/**
 * Deep debug Lambert solver internals
 */

function stumpffC2(psi) {
  if (psi > 1e-6) return (1 - Math.cos(Math.sqrt(psi))) / psi;
  if (psi < -1e-6) return (1 - Math.cosh(Math.sqrt(-psi))) / psi;
  return 0.5;
}

function stumpffC3(psi) {
  if (psi > 1e-6) {
    const sqrtPsi = Math.sqrt(psi);
    return (sqrtPsi - Math.sin(sqrtPsi)) / Math.pow(psi, 1.5);
  }
  if (psi < -1e-6) {
    const sqrtNegPsi = Math.sqrt(-psi);
    return (Math.sinh(sqrtNegPsi) - sqrtNegPsi) / Math.pow(-psi, 1.5);
  }
  return 1 / 6;
}

function solveLambertDebug(r1, r2, dt, mu, shortWay = true) {
  const r1Mag = Math.hypot(r1.x, r1.y);
  const r2Mag = Math.hypot(r2.x, r2.y);

  console.log('\n=== Lambert Solver Debug ===');
  console.log('r1Mag:', r1Mag, 'r2Mag:', r2Mag, 'dt:', dt, 'mu:', mu);

  const crossZ = r1.x * r2.y - r1.y * r2.x;
  const dot = r1.x * r2.x + r1.y * r2.y;
  let cosDeltaTheta = dot / (r1Mag * r2Mag);
  cosDeltaTheta = Math.max(-1, Math.min(1, cosDeltaTheta));
  let deltaTheta = Math.acos(cosDeltaTheta);
  if (!shortWay) deltaTheta = 2 * Math.PI - deltaTheta;
  if (crossZ < 0) deltaTheta = 2 * Math.PI - deltaTheta;

  console.log('deltaTheta:', (deltaTheta * 180 / Math.PI).toFixed(1), '°');

  const c = Math.hypot(r2.x - r1.x, r2.y - r1.y);
  const s = (r1Mag + r2Mag + c) / 2;

  console.log('c:', c, 's:', s);

  // For the universal variable formulation, A is computed differently
  // A = sqrt(r1*r2) * sin(deltaTheta) / sqrt(1 - cos(deltaTheta))
  // But this becomes 0/0 for deltaTheta = 180°

  // Alternative: use the formulation from Vallado
  const A = Math.sqrt(r1Mag * r2Mag) * Math.sin(deltaTheta);
  console.log('A (unnormalized):', A);

  // The time equation parameter
  const targetTof = dt * Math.sqrt(mu);
  console.log('targetTof:', targetTof);

  // Try different psi values and see what TOF we get
  console.log('\n--- Scanning psi values ---');
  for (let psi = -20; psi <= 20; psi += 2) {
    const c2 = stumpffC2(psi);
    const c3 = stumpffC3(psi);

    if (c2 <= 0 || !isFinite(c2)) {
      console.log(`psi=${psi}: c2 invalid (${c2})`);
      continue;
    }

    const y = r1Mag + r2Mag + A * (psi * c3 - 1) / Math.sqrt(c2);
    if (y < 0 || !isFinite(y)) {
      console.log(`psi=${psi}: y invalid (${y})`);
      continue;
    }

    const sqrtY = Math.sqrt(y);
    const tof = (Math.pow(sqrtY, 3) * c3 + A * sqrtY) / Math.sqrt(mu);
    console.log(`psi=${psi.toFixed(1)}: y=${y.toFixed(4)} tof=${tof.toFixed(6)} diff=${(tof - targetTof).toFixed(6)}`);
  }
}

function run() {
  const mu = 3.9648e-14;

  // 90° case
  const r1 = { x: 1.0, y: 0 };
  const r2 = { x: 0.0, y: 1.5 };
  const dt = 200 * 86400;

  solveLambertDebug(r1, r2, dt, mu, true);
}

run();
