#!/usr/bin/env tsx
/**
 * CLI: Import book systems into 2D map format
 *
 * Usage:
 *   npx tsx tools/system-importer/cli.ts <path-to-extracted-worlds.json>
 *
 * Outputs:
 *   - Console report per system (inventory, conflicts, resolution required)
 *   - JSON files in tools/system-importer/output/ per system
 *   - URL-safe Base64 payloads for direct 2D map testing
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { convertSystem, parseBookSystem } from './converter';
import { checkInventory } from './inventory';
import { generateSystem } from './generator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: npx tsx tools/system-importer/cli.ts <path-to-extracted-worlds.json>');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║     2-Parsecs-from-Sol → 2D Star System Map Importer               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  let totalSystems = 0;
  let totalWorlds = 0;
  let totalConflicts = 0;
  let totalUnresolved = 0;

  for (const [systemKey, worlds] of Object.entries(raw)) {
    totalSystems++;
    const worldArray = worlds as any[];
    totalWorlds += worldArray.length;

    console.log(`\n┌─────────────────────────────────────────────────────────────────────┐`);
    console.log(`│ SYSTEM: ${systemKey.toUpperCase().padEnd(58)}│`);
    console.log(`└─────────────────────────────────────────────────────────────────────┘`);

    // Parse
    const parsed = parseBookSystem(systemKey, worldArray);
    console.log(`  Star: ${parsed.starClass}${parsed.starGrade}  Mass: ${parsed.starMassSOL} M☉  Luminosity: ${parsed.starLuminosity}`);
    console.log(`  Worlds: ${parsed.worlds.length}`);

    // Inventory
    const inventory = checkInventory(parsed);
    console.log(`\n  📋 INVENTORY:`);
    console.log(`     Can auto-generate: ${inventory.canAutoGenerate ? '✅ YES' : '❌ NO'}`);
    console.log(`     Issues: ${inventory.issues.length}`);
    for (const issue of inventory.issues) {
      const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`       ${icon} [${issue.code}] ${issue.message}`);
    }

    // Generate
    const generated = generateSystem(parsed);
    console.log(`\n  🔧 GENERATION LOG:`);
    for (const line of generated.generationLog) {
      console.log(`     → ${line}`);
    }

    // Conflicts
    totalConflicts += generated.conflicts.length;
    const unresolved = generated.conflicts.filter(c => c.resolution === 'pending');
    totalUnresolved += unresolved.length;

    console.log(`\n  ⚡ CONFLICTS: ${generated.conflicts.length} total, ${unresolved.length} unresolved`);
    for (const conflict of generated.conflicts) {
      const icon = conflict.severity === 'critical' ? '🔴' : conflict.severity === 'major' ? '🟠' : '🟡';
      const status = conflict.resolution === 'pending' ? '⏳ PENDING' : `✅ ${conflict.resolution}`;
      console.log(`     ${icon} [${conflict.type}] ${conflict.worldName}: ${conflict.bookValue} vs ${conflict.generatedValue} — ${status}`);
    }

    // Write output
    const outputFile = path.join(OUTPUT_DIR, `${systemKey}.json`);
    const payloadFile = path.join(OUTPUT_DIR, `${systemKey}.payload.txt`);

    const result = convertSystem(systemKey, worldArray);

    fs.writeFileSync(outputFile, JSON.stringify({
      systemKey,
      starSystem: result.system,
      inventory: inventory.issues.map(i => ({ severity: i.severity, code: i.code, message: i.message })),
      conflicts: result.conflicts,
      unresolvedConflicts: result.unresolvedConflicts.map(c => ({
        id: c.id,
        type: c.type,
        severity: c.severity,
        worldName: c.worldName,
        bookValue: c.bookValue,
        generatedValue: c.generatedValue,
        description: c.description,
      })),
    }, null, 2));

    fs.writeFileSync(payloadFile, result.encodedPayload!);

    console.log(`\n  💾 Output written:`);
    console.log(`     ${outputFile}`);
    console.log(`     ${payloadFile}`);
    console.log(`\n  🗺️  Test URL:`);
    console.log(`     file://${path.resolve(__dirname, '../../dist/index.html')}?system=${result.encodedPayload!.slice(0, 80)}...`);
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                          SUMMARY                                     ║');
  console.log('╠══════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Systems processed:    ${String(totalSystems).padEnd(42)}║`);
  console.log(`║  Worlds processed:     ${String(totalWorlds).padEnd(42)}║`);
  console.log(`║  Total conflicts:      ${String(totalConflicts).padEnd(42)}║`);
  console.log(`║  Unresolved conflicts: ${String(totalUnresolved).padEnd(42)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  if (totalUnresolved > 0) {
    console.log('\n⚠️  Some conflicts are unresolved. Review the output JSON files and provide resolutions.');
    process.exit(2);
  }

  console.log('\n✅ All systems imported successfully!');
}

main();
