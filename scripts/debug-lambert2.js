#!/usr/bin/env node
/**
 * Deep debug Lambert solver
 */

async function run() {
  const { solveLambert } = await import('../src/lambertSolver.ts');

  const mu = 3.9648e-14;

  // Simplest possible case: circular orbit to opposite side
  const r1 = { x: 1.0, y: 0 };
  const r2 = { x: -1.0, y: 0 };
  const dt = 365 * 86400; // 1 year = period of 1 AU orbit

  console.log('Testing: r1=(1,0), r2=(-1,0), dt=1 year');
  console.log('Expected: should converge to circular orbit velocity\n');

  // Manual calculation
  const targetTof = dt * Math.sqrt(mu);
  console.log('targetTof:', targetTof);

  const r1Mag = 1.0;
  const r2Mag = 1.0;
  const c = 2.0; // Distance between r1 and r2
  const s = (r1Mag + r2Mag + c) / 2;
  console.log('s (semi-perimeter):', s);

  const A = Math.sqrt(r1Mag * r2Mag); // For 180°, sin(180°)=0, so A=0
  console.log('A:', A);

  // The issue: for 180° transfer, A = 0, which makes the Lambert formulation singular
  // This is a known edge case. We need to handle it specially.

  console.log('\nThis is the 180° singular case. A = 0.');
  console.log('Hohmann transfer should be used instead.');

  // Test non-180° case
  console.log('\n--- Testing non-180° case ---');
  const r1b = { x: 1.0, y: 0 };
  const r2b = { x: 0.0, y: 1.5 };
  const dtb = 200 * 86400;

  console.log(`r1=(${r1b.x},${r1b.y}), r2=(${r2b.x},${r2b.y})`);

  const r1Magb = Math.hypot(r1b.x, r1b.y);
  const r2Magb = Math.hypot(r2b.x, r2b.y);
  const dotb = r1b.x * r2b.x + r1b.y * r2b.y;
  const cosDT = dotb / (r1Magb * r2Magb);
  const deltaTheta = Math.acos(Math.max(-1, Math.min(1, cosDT)));
  const cb = Math.hypot(r2b.x - r1b.x, r2b.y - r1b.y);
  const Ab = Math.sqrt(r1Magb * r2Magb) * Math.sin(deltaTheta) / Math.sqrt(1 - Math.cos(deltaTheta));

  console.log('r1Mag:', r1Magb);
  console.log('r2Mag:', r2Magb);
  console.log('deltaTheta:', (deltaTheta * 180 / Math.PI).toFixed(1), '°');
  console.log('c:', cb);
  console.log('A:', Ab);

  const result = solveLambert(r1b, r2b, dtb, mu, true);
  console.log('\nResult:', result ? 'CONVERGED' : 'FAILED');
}

run().catch(console.error);
