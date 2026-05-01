#!/usr/bin/env node
/**
 * Debug Lambert solver with known cases
 */

async function run() {
  const { solveLambert } = await import('../src/lambertSolver.ts');

  const mu = 3.9648e-14; // Solar mu in AU³/s²

  console.log('Testing Lambert solver with known cases:\n');

  // Case 1: Earth to Mars Hohmann
  // Earth at 1 AU, Mars at 1.52 AU, 180° apart
  // TOF should be ~258 days
  {
    const r1 = { x: 1.0, y: 0 };
    const r2 = { x: -1.52, y: 0 };
    const dt = 258 * 86400;
    console.log('Case 1: Earth → Mars Hohmann');
    console.log(`  r1=(1,0), r2=(-1.52,0), dt=${dt}s (${(dt/86400).toFixed(0)} days)`);
    const result = solveLambert(r1, r2, dt, mu, true);
    if (result) {
      console.log(`  ✓ Converged in ${result.iterations} iterations`);
      console.log(`  v1=(${result.v1.x.toExponential(3)}, ${result.v1.y.toExponential(3)}) AU/s`);
    } else {
      console.log(`  ✗ FAILED`);
    }
  }

  // Case 2: Very short transfer (should fail - impossible)
  {
    const r1 = { x: 1.0, y: 0 };
    const r2 = { x: -1.52, y: 0 };
    const dt = 10 * 86400; // 10 days - impossible
    console.log('\nCase 2: Earth → Mars in 10 days (impossible)');
    const result = solveLambert(r1, r2, dt, mu, true);
    console.log(`  ${result ? '✓ Unexpectedly converged' : '✗ Correctly failed'}`);
  }

  // Case 3: Simple 90° transfer
  {
    const r1 = { x: 1.0, y: 0 };
    const r2 = { x: 0, y: 1.52 };
    const dt = 200 * 86400;
    console.log('\nCase 3: Earth → Mars 90° transfer');
    console.log(`  r1=(1,0), r2=(0,1.52), dt=${dt}s`);
    const result = solveLambert(r1, r2, dt, mu, true);
    if (result) {
      console.log(`  ✓ Converged in ${result.iterations} iterations`);
    } else {
      console.log(`  ✗ FAILED`);
    }
  }

  // Case 4: Tiny system (inner planets)
  {
    const r1 = { x: 0.1, y: 0 };
    const r2 = { x: -0.2, y: 0 };
    const dt = 30 * 86400;
    console.log('\nCase 4: 0.1 AU → 0.2 AU (30 days)');
    const result = solveLambert(r1, r2, dt, mu, true);
    if (result) {
      console.log(`  ✓ Converged in ${result.iterations} iterations`);
    } else {
      console.log(`  ✗ FAILED`);
    }
  }

  // Case 5: Large system (outer planets)
  {
    const r1 = { x: 10, y: 0 };
    const r2 = { x: -20, y: 0 };
    const dt = 15000 * 86400; // ~41 years
    console.log('\nCase 5: 10 AU → 20 AU (15000 days)');
    const result = solveLambert(r1, r2, dt, mu, true);
    if (result) {
      console.log(`  ✓ Converged in ${result.iterations} iterations`);
    } else {
      console.log(`  ✗ FAILED`);
    }
  }
}

run().catch(console.error);
