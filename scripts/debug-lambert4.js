#!/usr/bin/env node
/**
 * Debug non-180° Lambert cases
 */

async function run() {
  const { solveLambert } = await import('../src/lambertSolver.ts');

  const mu = 3.9648e-14;

  // Case 3: 90° transfer with various TOFs
  const r1 = { x: 1.0, y: 0 };
  const r2 = { x: 0.0, y: 1.5 };

  console.log('Case 3: Earth → Mars 90° transfer');
  console.log('Testing various TOFs:\n');

  // Hohmann TOF for reference
  const aHoh = (1 + 1.5) / 2;
  const tofHoh = Math.PI * Math.sqrt(Math.pow(aHoh, 3) / mu) / 86400;
  console.log(`Hohmann TOF: ${tofHoh.toFixed(1)} days`);

  for (const days of [100, 200, 300, 400, 500, 1000]) {
    const dt = days * 86400;
    const result = solveLambert(r1, r2, dt, mu, true);
    console.log(`  dt=${days}d: ${result ? '✓ CONVERGED' : '✗ FAILED'}`);
  }

  // Case 4: Inner system
  console.log('\nCase 4: 0.1 AU → 0.2 AU');
  const r1b = { x: 0.1, y: 0 };
  const r2b = { x: 0.0, y: 0.2 };

  const aHoh2 = (0.1 + 0.2) / 2;
  const tofHoh2 = Math.PI * Math.sqrt(Math.pow(aHoh2, 3) / mu) / 86400;
  console.log(`Hohmann TOF: ${tofHoh2.toFixed(1)} days`);

  for (const days of [10, 20, 30, 50, 100]) {
    const dt = days * 86400;
    const result = solveLambert(r1b, r2b, dt, mu, true);
    console.log(`  dt=${days}d: ${result ? '✓ CONVERGED' : '✗ FAILED'}`);
  }
}

run().catch(console.error);
