#!/usr/bin/env node
/**
 * Debug gravity assist opportunities
 */

async function run() {
  const { generateRandomSystem } = await import('../src/generator.ts');
  const { buildSceneGraph } = await import('../src/dataAdapter.ts');
  const { patchedConicTransfer, gravityAssistTransfer } = await import('../src/patchedConic.ts');
  const { findAssistOpportunities } = await import('../src/gravityAssistPhysics.ts');
  const { solveLambert } = await import('../src/lambertSolver.ts');

  // Generate one system and analyze it
  const system = generateRandomSystem();
  const bodies = buildSceneGraph(system.starSystem);
  const starMass = system.starSystem.primaryStar.mass;

  const planets = bodies
    .filter(b => !b.type.startsWith('star') && b.type !== 'disk')
    .sort((a, b) => a.distanceAU - b.distanceAU);

  if (planets.length < 3) {
    console.log('Not enough planets');
    return;
  }

  const origin = planets[0];
  const dest = planets[planets.length - 1];

  console.log(`\nSystem: ${system.starSystem.primaryStar.class}-class, ${planets.length} planets`);
  console.log(`Origin: ${origin.label} @ ${origin.distanceAU.toFixed(2)} AU`);
  console.log(`Destination: ${dest.label} @ ${dest.distanceAU.toFixed(2)} AU`);

  // Test Lambert solver directly with simple case
  const r1 = { x: origin.distanceAU, y: 0 };
  const r2 = { x: -dest.distanceAU, y: 0 }; // 180° apart (Hohmann)
  const mu = 1.32712440018e20 / Math.pow(1.496e11, 3); // Solar mu in AU³/s² = 3.96e-14
  const dt = 200 * 86400; // 200 days

  console.log(`\nDirect Lambert test (Hohmann-like):`);
  console.log(`  r1 = (${r1.x.toFixed(2)}, ${r1.y.toFixed(2)})`);
  console.log(`  r2 = (${r2.x.toFixed(2)}, ${r2.y.toFixed(2)})`);
  console.log(`  dt = ${dt.toFixed(0)} s`);
  console.log(`  mu = ${mu.toExponential(2)}`);

  const lambert = solveLambert(r1, r2, dt, mu, true);
  if (lambert) {
    console.log(`  ✓ Converged in ${lambert.iterations} iterations`);
    console.log(`  v1 = (${lambert.v1.x.toExponential(2)}, ${lambert.v1.y.toExponential(2)}) AU/s`);
  } else {
    console.log(`  ✗ FAILED to converge`);
  }

  // Direct transfer
  const direct = patchedConicTransfer(origin, dest, starMass);
  console.log(`\nDirect transfer: ${direct ? direct.totalDeltaVKms.toFixed(2) + ' km/s' : 'FAILED'}`);
  if (direct) {
    console.log(`  Departure: ${direct.departureDeltaVKms.toFixed(2)} km/s`);
    console.log(`  Arrival: ${direct.arrivalDeltaVKms.toFixed(2)} km/s`);
    console.log(`  TOF: ${direct.timeOfFlightDays.toFixed(1)} days`);
  }

  // Test each intermediate planet
  console.log(`\nTesting ${planets.length - 2} intermediate bodies:`);
  for (let i = 1; i < planets.length - 1; i++) {
    const body = planets[i];
    const assist = gravityAssistTransfer(origin, body, dest, starMass);
    if (assist) {
      const benefit = direct ? ((direct.totalDeltaVKms - assist.totalDeltaVKms) / direct.totalDeltaVKms) : 0;
      console.log(`  ${body.label} @ ${body.distanceAU.toFixed(2)} AU:`);
      console.log(`    Total ΔV: ${assist.totalDeltaVKms.toFixed(2)} km/s (benefit: ${(benefit * 100).toFixed(1)}%)`);
      console.log(`    Assist ΔV: ${assist.assistDeltaVKms.toFixed(2)} km/s`);
      console.log(`    Turn angle: ${assist.flybyTurningAngleDeg.toFixed(1)}°`);
    } else {
      console.log(`  ${body.label} @ ${body.distanceAU.toFixed(2)} AU: FAILED (Lambert solver)`);
    }
  }

  // Use findAssistOpportunities
  const assists = findAssistOpportunities(origin, dest, bodies, starMass);
  console.log(`\nfindAssistOpportunities found: ${assists.length} assists`);
  for (const a of assists) {
    console.log(`  ${a.bodyLabel}: +${a.deltaVKms.toFixed(2)} km/s`);
  }
}

run().catch(console.error);
