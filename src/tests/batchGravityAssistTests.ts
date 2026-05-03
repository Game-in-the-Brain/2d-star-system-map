/**
 * Batch Gravity Assist Test Suite
 * Validates FRD-063 physics across 100+ generated star systems
 *
 * Run from browser console:
 *   runBatchGravityAssistTests(100)
 *
 * Or with custom count:
 *   runBatchGravityAssistTests(50)
 */

import type { SceneBody, AppState } from '../types';
import { generateRandomSystem } from '../generator';
import { buildSceneGraph } from '../dataAdapter';
import { findAssistOpportunities } from '../gravityAssistPhysics';

export interface BatchTestResult {
  systemIndex: number;
  starClass: string;
  starMass: number;
  bodyCount: number;
  originId: string;
  destId: string;
  assistCount: number;
  bestAssistDeltaV: number;
  bestAssistBody: string;
  error?: string;
}

export interface BatchSummary {
  totalSystems: number;
  successfulSystems: number;
  failedSystems: number;
  systemsWithAssists: number;
  averageAssistCount: number;
  maxAssistCount: number;
  averageBestDeltaV: number;
  maxBestDeltaV: number;
  starClassBreakdown: Record<string, { count: number; withAssists: number }>;
  errors: { systemIndex: number; error: string }[];
}

function generateTestState(system: ReturnType<typeof generateRandomSystem>): AppState {
  const payload = system;
  const bodies = buildSceneGraph(payload.starSystem);

  return {
    ctx: null,
    canvas: null,
    bodies,
    camera: { x: 0, y: 0, zoom: 1 },
    isPlaying: false,
    isReversed: false,
    speed: 1,
    simDayOffset: 0,
    epochDate: new Date(Date.UTC(2300, 0, 1)),
    starfieldSeed: 'test',
    lastFrameTime: performance.now(),
    width: 1920,
    height: 1080,
    gmNotes: '',
    zones: payload.starSystem.zones,
    hoveredBodyId: null,
    lastMouseX: 0,
    lastMouseY: 0,
    viewMode: 'planetary',
  };
}

function pickRandomPair(bodies: SceneBody[]): [SceneBody, SceneBody] | null {
  const planets = bodies.filter(b => !b.type.startsWith('star') && b.type !== 'disk');
  if (planets.length < 2) return null;

  const idx1 = Math.floor(Math.random() * planets.length);
  let idx2 = Math.floor(Math.random() * planets.length);
  while (idx2 === idx1) {
    idx2 = Math.floor(Math.random() * planets.length);
  }

  // Ensure origin is inner, destination is outer (more realistic)
  if (planets[idx1].distanceAU > planets[idx2].distanceAU) {
    return [planets[idx2], planets[idx1]];
  }
  return [planets[idx1], planets[idx2]];
}

export function runBatchGravityAssistTests(count: number = 100): BatchSummary {
  console.log(`\n🚀 Starting batch gravity assist test: ${count} systems...\n`);

  const results: BatchTestResult[] = [];
  const errors: { systemIndex: number; error: string }[] = [];

  for (let i = 0; i < count; i++) {
    try {
      const system = generateRandomSystem();
      const state = generateTestState(system);
      const pair = pickRandomPair(state.bodies);

      if (!pair) {
        results.push({
          systemIndex: i,
          starClass: system.starSystem.primaryStar.class,
          starMass: system.starSystem.primaryStar.mass,
          bodyCount: state.bodies.length,
          originId: 'none',
          destId: 'none',
          assistCount: 0,
          bestAssistDeltaV: 0,
          bestAssistBody: 'N/A',
        });
        continue;
      }

      const [origin, destination] = pair;
      const starMassSolar = system.starSystem.primaryStar.mass;

      const assists = findAssistOpportunities(
        origin,
        destination,
        state.bodies,
        starMassSolar,
        0
      );

      const bestAssist = assists.length > 0 ? assists[0] : null;

      results.push({
        systemIndex: i,
        starClass: system.starSystem.primaryStar.class,
        starMass: starMassSolar,
        bodyCount: state.bodies.length,
        originId: origin.id,
        destId: destination.id,
        assistCount: assists.length,
        bestAssistDeltaV: bestAssist?.deltaVKms ?? 0,
        bestAssistBody: bestAssist?.bodyLabel ?? 'None',
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({ systemIndex: i, error: errorMsg });
      console.error(`❌ System ${i} failed:`, errorMsg);
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  Progress: ${i + 1}/${count} systems tested...`);
    }
  }

  // Compute summary
  const successful = results.filter(r => !r.error);
  const withAssists = successful.filter(r => r.assistCount > 0);
  const starClassBreakdown: Record<string, { count: number; withAssists: number }> = {};

  for (const r of successful) {
    const cls = r.starClass;
    if (!starClassBreakdown[cls]) {
      starClassBreakdown[cls] = { count: 0, withAssists: 0 };
    }
    starClassBreakdown[cls].count++;
    if (r.assistCount > 0) {
      starClassBreakdown[cls].withAssists++;
    }
  }

  const summary: BatchSummary = {
    totalSystems: count,
    successfulSystems: successful.length,
    failedSystems: errors.length,
    systemsWithAssists: withAssists.length,
    averageAssistCount: successful.length > 0
      ? successful.reduce((sum, r) => sum + r.assistCount, 0) / successful.length
      : 0,
    maxAssistCount: Math.max(...successful.map(r => r.assistCount)),
    averageBestDeltaV: withAssists.length > 0
      ? withAssists.reduce((sum, r) => sum + r.bestAssistDeltaV, 0) / withAssists.length
      : 0,
    maxBestDeltaV: Math.max(...successful.map(r => r.bestAssistDeltaV)),
    starClassBreakdown,
    errors,
  };

  printBatchSummary(summary, results);
  return summary;
}

function printBatchSummary(summary: BatchSummary, results: BatchTestResult[]): void {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Batch Gravity Assist Test Results');
  console.log('═══════════════════════════════════════════════════\n');

  console.log(`📊 Overall Statistics:`);
  console.log(`   Total systems tested:     ${summary.totalSystems}`);
  console.log(`   Successful:               ${summary.successfulSystems} (${((summary.successfulSystems / summary.totalSystems) * 100).toFixed(1)}%)`);
  console.log(`   Failed:                   ${summary.failedSystems} (${((summary.failedSystems / summary.totalSystems) * 100).toFixed(1)}%)`);
  console.log(`   Systems with assists:     ${summary.systemsWithAssists} (${summary.successfulSystems > 0 ? ((summary.systemsWithAssists / summary.successfulSystems) * 100).toFixed(1) : 0}%)`);
  console.log(`   Average assists per sys:  ${summary.averageAssistCount.toFixed(2)}`);
  console.log(`   Max assists in one sys:   ${summary.maxAssistCount}`);
  console.log(`   Average best ΔV:          ${summary.averageBestDeltaV.toFixed(2)} km/s`);
  console.log(`   Max best ΔV:              ${summary.maxBestDeltaV.toFixed(2)} km/s`);

  console.log(`\n⭐ Star Class Breakdown:`);
  for (const [cls, data] of Object.entries(summary.starClassBreakdown).sort()) {
    const pct = data.count > 0 ? ((data.withAssists / data.count) * 100).toFixed(1) : '0';
    console.log(`   ${cls}-class: ${data.withAssists}/${data.count} have assists (${pct}%)`);
  }

  if (summary.errors.length > 0) {
    console.log(`\n❌ Errors (${summary.errors.length}):`);
    for (const e of summary.errors.slice(0, 5)) {
      console.log(`   System ${e.systemIndex}: ${e.error}`);
    }
    if (summary.errors.length > 5) {
      console.log(`   ... and ${summary.errors.length - 5} more`);
    }
  }

  // Show top 5 systems by best assist
  const topSystems = [...results]
    .filter(r => r.assistCount > 0)
    .sort((a, b) => b.bestAssistDeltaV - a.bestAssistDeltaV)
    .slice(0, 5);

  if (topSystems.length > 0) {
    console.log(`\n🏆 Top 5 Systems by Assist ΔV:`);
    for (const r of topSystems) {
      console.log(`   #${r.systemIndex}: ${r.starClass}-class, ${r.assistCount} assists`);
      console.log(`      Best: ${r.bestAssistBody} +${r.bestAssistDeltaV.toFixed(2)} km/s`);
    }
  }

  console.log('\n───────────────────────────────────────────────────\n');
}

// Auto-register for browser console
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).runBatchGravityAssistTests = runBatchGravityAssistTests;
}
