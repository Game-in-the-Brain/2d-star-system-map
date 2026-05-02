/**
 * Inventory Checker
 *
 * Validates a parsed book system against the requirements of the 2D map renderer.
 * Reports what is present, what is missing, and what can be auto-generated.
 */

import type { ParsedSystem, ParsedWorld, InventoryReport, InventoryIssue, WorldCategory } from './types';

const REQUIRED_WORLD_FIELDS: Array<keyof ParsedWorld> = ['id', 'name', 'category', 'distanceAU', 'massEM'];

/**
 * Run a full inventory check on a parsed system.
 */
export function checkInventory(system: ParsedSystem): InventoryReport {
  const issues: InventoryIssue[] = [];
  const missingFields = new Set<string>();

  // ─── System-level checks ──────────────────────────────────────────────────

  if (!system.starClass) {
    issues.push({
      severity: 'error',
      code: 'SYS-NO-STAR-CLASS',
      message: 'System has no star spectral class. Cannot determine zone colors or star rendering.',
    });
    missingFields.add('starClass');
  }

  if (system.starMassSOL <= 0) {
    issues.push({
      severity: 'error',
      code: 'SYS-NO-STAR-MASS',
      message: 'System has no valid star mass. Orbital periods cannot be calculated.',
    });
    missingFields.add('starMassSOL');
  }

  if (!system.zones) {
    issues.push({
      severity: 'warning',
      code: 'SYS-NO-ZONES',
      message: 'System has no zone boundaries. Will attempt to derive from star luminosity.',
    });
    missingFields.add('zones');
  }

  // ─── World-level checks ───────────────────────────────────────────────────

  const categories = new Map<WorldCategory, number>();

  for (const world of system.worlds) {
    const ctx = { worldId: world.id, worldName: world.name };

    // Category
    if (world.category === 'unknown') {
      issues.push({
        severity: 'error',
        code: 'WORLD-UNKNOWN-CATEGORY',
        message: `World "${world.name}" has unknown type "${world.raw.type}". Cannot render.`,
        ...ctx,
      });
      missingFields.add('category');
    }
    categories.set(world.category, (categories.get(world.category) ?? 0) + 1);

    // Distance
    if (!isFinite(world.distanceAU) || world.distanceAU <= 0) {
      issues.push({
        severity: 'error',
        code: 'WORLD-NO-DISTANCE',
        message: `World "${world.name}" has no valid orbital distance. Cannot place on map.`,
        ...ctx,
      });
      missingFields.add('distanceAU');
    }

    // Mass
    if (!isFinite(world.massEM) || world.massEM <= 0) {
      issues.push({
        severity: 'warning',
        code: 'WORLD-NO-MASS',
        message: `World "${world.name}" has no valid mass. Will estimate from category defaults.`,
        ...ctx,
      });
      missingFields.add('massEM');
    }

    // Gas class
    if (world.category === 'gas' && !world.gasClass) {
      issues.push({
        severity: 'warning',
        code: 'WORLD-NO-GAS-CLASS',
        message: `Gas world "${world.name}" has no gas class (I-V). Will default to Class I.`,
        ...ctx,
      });
      missingFields.add('gasClass');
    }

    // Main world
    if (world.isMainWorld && world.category === 'unknown') {
      issues.push({
        severity: 'error',
        code: 'MAINWORLD-UNKNOWN',
        message: `Main world "${world.name}" has unknown category. Must be resolved before rendering.`,
        ...ctx,
      });
    }

    // Gravity consistency (if both mass and gravity present)
    if (isFinite(world.massEM) && world.gravityG !== undefined) {
      const expectedG = Math.pow(world.massEM, 1 / 3);
      const diff = Math.abs(world.gravityG - expectedG);
      if (diff > 0.5) {
        issues.push({
          severity: 'warning',
          code: 'WORLD-GRAVITY-INCONSISTENT',
          message: `World "${world.name}" gravity (${world.gravityG}G) differs from Earth-density expectation (${expectedG.toFixed(2)}G). Will derive density to reconcile.`,
          ...ctx,
        });
      }
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────

  if (system.worlds.length === 0) {
    issues.push({
      severity: 'error',
      code: 'SYS-NO-WORLDS',
      message: 'System has no worlds. Nothing to render.',
    });
  }

  // Info: counts by category
  const summary = Array.from(categories.entries())
    .map(([cat, count]) => `${count} ${cat}`)
    .join(', ');
  issues.push({
    severity: 'info',
    code: 'INVENTORY-SUMMARY',
    message: `Parsed ${system.worlds.length} worlds: ${summary || 'none'}.`,
  });

  const canAutoGenerate = !issues.some(i => i.severity === 'error');

  return {
    systemKey: system.key,
    systemName: system.starName,
    totalWorlds: system.worlds.length,
    issues,
    canAutoGenerate,
    missingFields: Array.from(missingFields),
  };
}
