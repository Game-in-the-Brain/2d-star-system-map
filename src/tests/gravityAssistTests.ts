/**
 * Gravity Assist Test Suite
 * FRD-063 Validation
 *
 * Run with: npm run test:gravity-assists
 * Or import and call runGravityAssistTests() from browser console.
 */

import {
  calculateTurningAngle,
  calculateVInfinity,
  calculateAssistDeltaV,
  bodyMuKm3s2,
  circularOrbitalVelocityKms,
} from '../gravityAssistPhysics';

export interface TestResult {
  testId: string;
  category: string;
  description: string;
  passed: boolean;
  expected: string;
  actual: string;
  tolerance?: string;
  error?: string;
}

function assertApprox(
  actual: number,
  expected: number,
  tolerance: number,
  description: string
): { pass: boolean; detail: string } {
  const diff = Math.abs(actual - expected);
  const relDiff = expected !== 0 ? diff / Math.abs(expected) : diff;
  const pass = relDiff <= tolerance || diff <= tolerance;
  return {
    pass,
    detail: pass
      ? `✓ ${description}: ${actual.toFixed(4)} (expected ${expected.toFixed(4)}, tol ${(tolerance * 100).toFixed(1)}%)`
      : `✗ ${description}: got ${actual.toFixed(4)}, expected ${expected.toFixed(4)} (diff ${(relDiff * 100).toFixed(2)}%)`,
  };
}

function makeResult(
  testId: string,
  category: string,
  description: string,
  pass: boolean,
  expected: string,
  actual: string,
  error?: string
): TestResult {
  return { testId, category, description, passed: pass, expected, actual, error };
}

// ═══════════════════════════════════════════════════════════
// CATEGORY A: Hyperbolic Geometry Unit Tests
// ═══════════════════════════════════════════════════════════

function runCategoryA(): TestResult[] {
  const results: TestResult[] = [];

  // A-01: Turning angle at grazing Jupiter flyby
  {
    const muJupiter = 1.266865e8; // km³/s²
    const rJupiter = 71492; // km
    const vInf = 10.3; // km/s
    const expected = 2 * Math.asin(1 / (1 + (rJupiter * vInf * vInf) / muJupiter)) * (180 / Math.PI);
    const actual = calculateTurningAngle(rJupiter, vInf, muJupiter) * (180 / Math.PI);
    const r = assertApprox(actual, expected, 0.01, 'Grazing flyby turning angle');
    results.push(makeResult('A-01', 'A', 'Turning angle at grazing Jupiter flyby', r.pass, `${expected.toFixed(2)}°`, `${actual.toFixed(2)}°`));
  }

  // A-02: Turning angle at distant flyby
  {
    const muJupiter = 1.266865e8;
    const r = 714920; // 10× Jupiter radius
    const vInf = 10.3;
    const expected = 2 * Math.asin(1 / (1 + (r * vInf * vInf) / muJupiter)) * (180 / Math.PI);
    const actual = calculateTurningAngle(r, vInf, muJupiter) * (180 / Math.PI);
    const r2 = assertApprox(actual, expected, 0.01, 'Distant flyby turning angle');
    results.push(makeResult('A-02', 'A', 'Turning angle at 10×R distant flyby', r2.pass, `${expected.toFixed(2)}°`, `${actual.toFixed(2)}°`));
  }

  // A-03: Zero turning angle at infinite distance
  {
    const actual = calculateTurningAngle(1e9, 10, 1.266865e8) * (180 / Math.PI);
    const r3 = assertApprox(actual, 0, 0.01, 'Infinite distance turning angle');
    results.push(makeResult('A-03', 'A', 'Turning angle approaches zero at infinite distance', r3.pass, '0°', `${actual.toFixed(4)}°`));
  }

  // A-04: Maximum turning angle (theoretical limit as r_p → 0)
  {
    const actual = calculateTurningAngle(1, 10, 1.266865e8) * (180 / Math.PI);
    const r4 = assertApprox(actual, 180, 0.01, 'Maximum turning angle');
    results.push(makeResult('A-04', 'A', 'Maximum turning angle approaches 180°', r4.pass, '180°', `${actual.toFixed(2)}°`));
  }

  // A-05: V∞ magnitude conservation
  {
    const vInfIn = { x: 5.0, y: 3.0 };
    const planetVel = { x: 13.0, y: 0.0 };
    const vInfMag = Math.hypot(vInfIn.x, vInfIn.y);
    const vOut = calculateAssistDeltaV(vInfIn, planetVel, Math.PI / 3, 'trailing');
    const vInfOut = {
      x: vOut.x - planetVel.x,
      y: vOut.y - planetVel.y,
    };
    const vInfOutMag = Math.hypot(vInfOut.x, vInfOut.y);
    const r5 = assertApprox(vInfOutMag, vInfMag, 0.001, 'V∞ magnitude conservation');
    results.push(makeResult('A-05', 'A', 'V∞ magnitude conserved through assist', r5.pass, `${vInfMag.toFixed(4)} km/s`, `${vInfOutMag.toFixed(4)} km/s`));
  }

  // A-06: Hyperbolic periapsis from turning angle
  {
    const vInf = 10.0;
    const delta = 40 * (Math.PI / 180);
    const mu = 1.266865e8;
    // r_p = μ/V∞² × (1/sin(δ/2) - 1)
    const expectedRp = (mu / (vInf * vInf)) * (1 / Math.sin(delta / 2) - 1);
    // Reverse: calculateTurningAngle(expectedRp, vInf, mu) should give delta
    const actualDelta = calculateTurningAngle(expectedRp, vInf, mu);
    const r6 = assertApprox(actualDelta, delta, 0.001, 'Periapsis-turning-angle roundtrip');
    results.push(makeResult('A-06', 'A', 'Periapsis from turning angle roundtrip', r6.pass, `${(delta * 180 / Math.PI).toFixed(2)}°`, `${(actualDelta * 180 / Math.PI).toFixed(2)}°`));
  }

  return results;
}

// ═══════════════════════════════════════════════════════════
// CATEGORY B: Integration Tests — Gravity Assist ΔV
// ═══════════════════════════════════════════════════════════

function runCategoryB(): TestResult[] {
  const results: TestResult[] = [];

  // B-01: Trailing-side assist (speed up)
  {
    const planetVel = { x: 13.0, y: 0.0 };
    const vInfIn = { x: 5.0, y: 0.0 }; // Spacecraft faster than planet
    const delta = (60 * Math.PI) / 180;
    const vOut = calculateAssistDeltaV(vInfIn, planetVel, delta, 'trailing');
    const vInHelio = { x: planetVel.x + vInfIn.x, y: planetVel.y + vInfIn.y };
    const deltaV = Math.hypot(vOut.x - vInHelio.x, vOut.y - vInHelio.y);
    const expected = 2 * Math.hypot(vInfIn.x, vInfIn.y) * Math.sin(delta / 2);
    const r = assertApprox(deltaV, expected, 0.02, 'Trailing assist delta-V');
    const speedUp = Math.hypot(vOut.x, vOut.y) > Math.hypot(vInHelio.x, vInHelio.y);
    results.push(makeResult('B-01', 'B', 'Trailing-side assist increases heliocentric speed', r.pass && speedUp, `${expected.toFixed(2)} km/s`, `${deltaV.toFixed(2)} km/s`));
  }

  // B-02: Leading-side assist (slow down)
  {
    const planetVel = { x: 13.0, y: 0.0 };
    const vInfIn = { x: 5.0, y: 0.0 };
    const delta = (60 * Math.PI) / 180;
    const vOut = calculateAssistDeltaV(vInfIn, planetVel, delta, 'leading');
    const vInHelio = { x: planetVel.x + vInfIn.x, y: planetVel.y + vInfIn.y };
    const deltaV = Math.hypot(vOut.x - vInHelio.x, vOut.y - vInHelio.y);
    const expected = 2 * Math.hypot(vInfIn.x, vInfIn.y) * Math.sin(delta / 2);
    const r = assertApprox(deltaV, expected, 0.02, 'Leading assist delta-V');
    const slowDown = Math.hypot(vOut.x, vOut.y) < Math.hypot(vInHelio.x, vInHelio.y);
    results.push(makeResult('B-02', 'B', 'Leading-side assist decreases heliocentric speed', r.pass && slowDown, `${expected.toFixed(2)} km/s`, `${deltaV.toFixed(2)} km/s`));
  }

  // B-03: 180° turn (complete reversal)
  {
    const planetVel = { x: 10.0, y: 0.0 };
    const vInfIn = { x: 5.0, y: 0.0 };
    const vOut = calculateAssistDeltaV(vInfIn, planetVel, Math.PI, 'trailing');
    const vInfOut = { x: vOut.x - planetVel.x, y: vOut.y - planetVel.y };
    // V∞_out should be opposite to V∞_in
    const dot = vInfIn.x * vInfOut.x + vInfIn.y * vInfOut.y;
    const magProduct = Math.hypot(vInfIn.x, vInfIn.y) * Math.hypot(vInfOut.x, vInfOut.y);
    const angleBetween = Math.acos(Math.max(-1, Math.min(1, dot / magProduct))) * (180 / Math.PI);
    const pass = angleBetween > 179;
    results.push(makeResult('B-03', 'B', '180° turn reverses V∞ direction', pass, '180°', `${angleBetween.toFixed(1)}°`));
  }

  return results;
}

// ═══════════════════════════════════════════════════════════
// CATEGORY C: Historical Mission Validation
// ═══════════════════════════════════════════════════════════

function runCategoryC(): TestResult[] {
  const results: TestResult[] = [];

  // C-01: Voyager 2 Jupiter assist
  {
    const muJupiter = 1.266865e8;
    const vInf = 10.3;
    const rp = 721670; // 10.1 R_J (NASA trajectory)
    const delta = calculateTurningAngle(rp, vInf, muJupiter) * (180 / Math.PI);
    const expectedDelta = 40; // degrees (approximate from NASA data)
    const r = assertApprox(delta, expectedDelta, 0.15, 'Voyager 2 Jupiter turning angle');
    results.push(makeResult('C-01', 'C', 'Voyager 2 Jupiter assist turning angle', r.pass, `~${expectedDelta}°`, `${delta.toFixed(1)}°`));
  }

  // C-02: Voyager 2 Saturn assist
  {
    const muSaturn = 3.793e7;
    const vInf = 7.6;
    const rp = 161000; // 2.7 R_S
    const delta = calculateTurningAngle(rp, vInf, muSaturn) * (180 / Math.PI);
    const expectedDelta = 80; // degrees
    const r = assertApprox(delta, expectedDelta, 0.15, 'Voyager 2 Saturn turning angle');
    results.push(makeResult('C-02', 'C', 'Voyager 2 Saturn assist turning angle', r.pass, `~${expectedDelta}°`, `${delta.toFixed(1)}°`));
  }

  // C-03: Cassini Venus flyby
  {
    const muVenus = 3.249e5;
    const vInf = 11.2;
    const rp = 8500; // 1.4 R_V
    const delta = calculateTurningAngle(rp, vInf, muVenus) * (180 / Math.PI);
    const expectedDelta = 40;
    const r = assertApprox(delta, expectedDelta, 0.15, 'Cassini Venus turning angle');
    results.push(makeResult('C-03', 'C', 'Cassini 1st Venus flyby turning angle', r.pass, `~${expectedDelta}°`, `${delta.toFixed(1)}°`));
  }

  return results;
}

// ═══════════════════════════════════════════════════════════
// CATEGORY D: Edge Cases
// ═══════════════════════════════════════════════════════════

function runCategoryD(): TestResult[] {
  const results: TestResult[] = [];

  // D-01: Zero V∞ (co-moving with planet)
  {
    const vInfIn = { x: 0, y: 0 };
    const planetVel = { x: 13, y: 0 };
    const vOut = calculateAssistDeltaV(vInfIn, planetVel, Math.PI / 4, 'trailing');
    const pass = vOut.x === planetVel.x && vOut.y === planetVel.y;
    results.push(makeResult('D-01', 'D', 'Zero V∞ returns planet velocity', pass, 'V_planet', `(${vOut.x.toFixed(1)}, ${vOut.y.toFixed(1)})`));
  }

  // D-02: Negative periapsis (invalid)
  {
    const delta = calculateTurningAngle(-100, 10, 1e8);
    const pass = delta === 0;
    results.push(makeResult('D-02', 'D', 'Negative periapsis returns zero', pass, '0', `${delta.toFixed(4)}`));
  }

  // D-03: Zero planet mu (invalid)
  {
    const delta = calculateTurningAngle(1000, 10, 0);
    const pass = delta === 0;
    results.push(makeResult('D-03', 'D', 'Zero planet mu returns zero', pass, '0', `${delta.toFixed(4)}`));
  }

  // D-04: Very small turning angle (distant flyby)
  {
    const muEarth = 3.986e5;
    const vInf = 5;
    const rp = 1e6; // Very distant
    const delta = calculateTurningAngle(rp, vInf, muEarth) * (180 / Math.PI);
    const pass = delta < 1; // Should be tiny
    results.push(makeResult('D-04', 'D', 'Distant flyby has small turning angle', pass, '< 1°', `${delta.toFixed(4)}°`));
  }

  return results;
}

// ═══════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════

export function runGravityAssistTests(): TestResult[] {
  return [
    ...runCategoryA(),
    ...runCategoryB(),
    ...runCategoryC(),
    ...runCategoryD(),
  ];
}

export function printTestResults(results: TestResult[]): void {
  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  FRD-063 Gravity Assist Test Results');
  console.log('═══════════════════════════════════════════════════\n');

  const categories = ['A', 'B', 'C', 'D'];
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    if (catResults.length === 0) continue;

    const catNames: Record<string, string> = {
      A: 'Hyperbolic Geometry',
      B: 'Gravity Assist ΔV',
      C: 'Historical Missions',
      D: 'Edge Cases',
    };

    console.log(`\n─── Category ${cat}: ${catNames[cat]} ───`);
    for (const r of catResults) {
      const icon = r.passed ? '✅' : '❌';
      console.log(`${icon} ${r.testId}: ${r.description}`);
      console.log(`   Expected: ${r.expected} | Actual: ${r.actual}`);
      if (r.error) console.log(`   Error: ${r.error}`);
    }
  }

  console.log('\n───────────────────────────────────────────────────');
  console.log(`  Total: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('───────────────────────────────────────────────────\n');
}

// Auto-run if in browser console
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).runGravityAssistTests = runGravityAssistTests;
  (window as unknown as Record<string, unknown>).printTestResults = printTestResults;
}
