/**
 * Converter
 *
 * Orchestrates the full pipeline:
 *   Raw book JSON → Parse → Inventory Check → Generate → Conflicts → StarSystem
 */

import type { StarSystem, MapPayload } from '../../src/types';
import type {
  BookSystem,
  ParsedSystem,
  ParsedWorld,
  WorldCategory,
  ConversionResult,
  ResolutionChoice,
} from './types';
import { checkInventory } from './inventory';
import { generateSystem } from './generator';

// ─── Parsing ────────────────────────────────────────────────────────────────

/**
 * Parse a raw book system JSON (from extracted-worlds.json) into our internal shape.
 */
export function parseBookSystem(key: string, raw: any[]): ParsedSystem {
  const worlds: ParsedWorld[] = raw.map((w, idx) => parseWorld(w, idx));

  // Detect main world
  const mainWorldIndex = worlds.findIndex(
    w => w.raw.sub_type?.toLowerCase().includes('main world') ||
         w.raw.name?.toLowerCase().includes('main world')
  );
  if (mainWorldIndex >= 0) {
    worlds[mainWorldIndex].isMainWorld = true;
  }

  // Star data — hardcoded mappings for the 5 known systems
  const starData = getStarData(key);

  return {
    key,
    starName: starData.name,
    starClass: starData.class,
    starGrade: starData.grade,
    starMassSOL: starData.mass,
    starLuminosity: starData.luminosity,
    zones: starData.zones,
    worlds,
  };
}

function parseWorld(raw: any, idx: number): ParsedWorld {
  const category = mapTypeToCategory(raw.type);
  const gasClass = category === 'gas' ? parseGasClass(raw.sub_type) : undefined;

  return {
    id: `world-${idx}`,
    name: raw.name || `Unnamed-${idx}`,
    category,
    gasClass,
    distanceAU: parseDistance(raw.position),
    massEM: parseMass(raw.mass),
    gravityG: parseGravity(raw.gravity),
    temp: raw.temp || undefined,
    atmosphere: raw.atmosphere || undefined,
    hazard: raw.hazard || undefined,
    biore: raw.biore || undefined,
    habitability: parseHabitability(raw.hab),
    isMainWorld: false,
    raw,
  };
}

// ─── Type Mapping ───────────────────────────────────────────────────────────

function mapTypeToCategory(type: string): WorldCategory {
  const t = (type || '').toUpperCase();
  if (t === 'DW') return 'dwarf';
  if (t === 'TER') return 'terrestrial';
  if (t === 'ICE') return 'ice';
  if (t === 'GAS') return 'gas';
  if (t === 'CD') return 'disk';
  return 'unknown';
}

function parseGasClass(subType: string): number | undefined {
  if (!subType) return undefined;
  const match = subType.match(/class\s*([IV]+)/i);
  if (!match) return undefined;
  const roman = match[1].toUpperCase();
  const map: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
  return map[roman] || 1;
}

// ─── Field Parsers ──────────────────────────────────────────────────────────

function parseDistance(pos: string): number {
  if (!pos) return NaN;
  const match = String(pos).match(/([0-9.]+)/);
  return match ? parseFloat(match[1]) : NaN;
}

function parseMass(mass: string): number {
  if (!mass) return NaN;
  const s = String(mass).trim().toUpperCase().replace(',', '');

  // Handle compound: "0.03 JM / 10 EM" — take the last unit
  if (s.includes('/')) {
    const parts = s.split('/');
    return parseMass(parts[parts.length - 1].trim());
  }

  // Earth masses
  const emMatch = s.match(/^([0-9.]+)\s*EM/);
  if (emMatch) return parseFloat(emMatch[1]);

  // Lunar masses (1 LM = 0.0123 EM)
  const lmMatch = s.match(/^([0-9.]+)\s*LM/);
  if (lmMatch) return parseFloat(lmMatch[1]) * 0.0123;

  // Jupiter masses (1 JM = 317.8 EM)
  const jmMatch = s.match(/^([0-9.]+)\s*JM/);
  if (jmMatch) return parseFloat(jmMatch[1]) * 317.8;

  // Solar masses (1 SM = 333,000 EM)
  const smMatch = s.match(/^([0-9.]+)\s*(SOL|SM)/);
  if (smMatch) return parseFloat(smMatch[1]) * 333000;

  // CM = centi-mass? (rare, treat as 0.01 EM)
  const cmMatch = s.match(/^([0-9.]+)\s*CM/);
  if (cmMatch) return parseFloat(cmMatch[1]) * 0.01;

  return NaN;
}

function parseGravity(grav: string): number | undefined {
  if (!grav) return undefined;
  const match = String(grav).match(/([0-9.]+)/);
  return match ? parseFloat(match[1]) : undefined;
}

function parseHabitability(hab: string): number | undefined {
  if (!hab) return undefined;
  const n = parseFloat(hab);
  return isNaN(n) ? undefined : n;
}

// ─── Star Data (from book tables) ───────────────────────────────────────────

function getStarData(key: string): {
  name: string;
  class: string;
  grade: number;
  mass: number;
  luminosity: number;
  zones: import('../../src/types').ZoneBoundaries;
} {
  const data: Record<string, any> = {
    aleph: {
      name: 'Aleph', class: 'G', grade: 2, mass: 1.07, luminosity: 1.5,
      zones: makeZones(0.9, 1.8, 2.7, 10.9),
    },
    cauda: {
      name: 'Cauda', class: 'K', grade: 1, mass: 0.9, luminosity: 0.5,
      zones: makeZones(0.1, 0.2, 0.3, 1.21),
    },
    oplay: {
      name: 'Oplay', class: 'M', grade: 5, mass: 0.12, luminosity: 0.0017,
      zones: makeZones(0.016, 0.033, 0.049, 0.2),
    },
    luhman16: {
      name: 'Kartum', class: 'L', grade: 8, mass: 0.032, luminosity: 0.00003,
      zones: makeZones(0.00001, 0.000021, 0.00003, 0.0001),
    },
    barnards_star: {
      name: 'Artio', class: 'M', grade: 4, mass: 0.14, luminosity: 0.0035,
      zones: makeZones(0.024, 0.047, 0.071, 0.29),
    },
  };
  return data[key] || { name: key, class: 'M', grade: 5, mass: 0.5, luminosity: 0.01, zones: makeZones(0.1, 0.2, 0.4, 2.0) };
}

function makeZones(infernal: number, hot: number, habitable: number, cold: number): import('../../src/types').ZoneBoundaries {
  return {
    infernal: { min: 0, max: infernal },
    hot: { min: infernal, max: hot },
    conservative: { min: hot, max: habitable },
    cold: { min: habitable, max: cold },
    outer: { min: cold, max: null },
  };
}

// ─── Full Conversion ────────────────────────────────────────────────────────

export function convertSystem(
  key: string,
  rawWorlds: any[],
  resolutions?: ResolutionChoice[]
): ConversionResult {
  // 1. Parse
  const parsed = parseBookSystem(key, rawWorlds);

  // 2. Inventory
  const inventoryReport = checkInventory(parsed);

  // 3. Generate
  const generated = generateSystem(parsed);

  // 4. Apply resolutions
  const unresolved: typeof generated.conflicts = [];
  for (const conflict of generated.conflicts) {
    const choice = resolutions?.find(r => r.conflictId === conflict.id);
    if (choice) {
      conflict.resolution = choice.choice;
      if (choice.choice === 'custom') conflict.customValue = choice.customValue;
    } else {
      unresolved.push(conflict);
    }
  }

  // 5. Build payload
  const payload: MapPayload = {
    starSystem: generated.system,
    starfieldSeed: key.slice(0, 8),
    epoch: { year: 2300, month: 1, day: 1 },
  };

  // Encode
  const encodedPayload = encodePayload(payload);

  return {
    success: unresolved.length === 0,
    system: generated.system,
    inventoryReport,
    conflicts: generated.conflicts,
    unresolvedConflicts: unresolved,
    encodedPayload,
  };
}

/**
 * Encode a MapPayload to URL-safe Base64 (same as batchAdapter.ts).
 */
function encodePayload(payload: MapPayload): string {
  const json = JSON.stringify(payload);
  return btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
}
