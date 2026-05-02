/**
 * Bridge types: connects 2-Parsecs-from-Sol book data → 2D StarSystem map format.
 *
 * Book data shape (from extracted-worlds.json):
 * {
 *   "zone": "INFERNAL",
 *   "position": "0.24 AU",
 *   "name": "Chaeronia",
 *   "type": "Dw",
 *   "sub_type": "Silicaceous",
 *   "mass": "0.2 LM",
 *   "gravity": "0.2 G",
 *   "temp": "Hot (TL7)",
 *   "atmosphere": "Thin (TL7)",
 *   "hazard": "High (TL8) Toxic",
 *   "biore": "Abundant",
 *   "hab": "9"
 * }
 */

import type { StarSystem, ZoneBoundaries } from '../../src/types';

// ─── Book Data Types ────────────────────────────────────────────────────────

export interface BookWorld {
  zone: string;
  position: string;        // e.g. "0.24 AU"
  name: string;
  type: string;            // "Dw" | "Ter" | "Ice" | "Gas" | "CD" | "NA"
  sub_type: string;        // "Silicaceous" | "Metallic" | "Carbonaceous" | "Class I" | etc.
  mass: string;            // e.g. "0.2 LM", "3 EM", "0.03 JM / 10 EM", "10 CM"
  gravity: string;         // e.g. "0.2 G", ""
  temp: string;            // e.g. "Hot (TL7)", ""
  atmosphere: string;      // e.g. "Thin (TL7)", ""
  hazard: string;          // e.g. "High (TL8) Toxic", ""
  biore: string;           // e.g. "Abundant", ""
  hab: string;             // e.g. "9", "-1", ""
}

export interface BookSystem {
  key: string;
  starName: string;
  starClass: string;
  starGrade: number;
  starMassSOL: number;
  starLuminosity: number;
  zones: ZoneBoundaries;
  worlds: BookWorld[];
}

// ─── Parsed / Normalized Types ──────────────────────────────────────────────

export type WorldCategory = 'dwarf' | 'terrestrial' | 'ice' | 'gas' | 'disk' | 'unknown';

export interface ParsedWorld {
  id: string;
  name: string;
  category: WorldCategory;
  gasClass?: number;       // 1-5 for gas worlds (Roman numeral)
  distanceAU: number;
  massEM: number;
  gravityG?: number;
  temp?: string;
  atmosphere?: string;
  hazard?: string;
  biore?: string;
  habitability?: number;
  isMainWorld: boolean;
  raw: BookWorld;
}

export interface ParsedSystem {
  key: string;
  starName: string;
  starClass: string;
  starGrade: number;
  starMassSOL: number;
  starLuminosity: number;
  zones: ZoneBoundaries;
  worlds: ParsedWorld[];
}

// ─── Inventory Report ───────────────────────────────────────────────────────

export interface InventoryIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  worldId?: string;
  worldName?: string;
}

export interface InventoryReport {
  systemKey: string;
  systemName: string;
  totalWorlds: number;
  issues: InventoryIssue[];
  canAutoGenerate: boolean;
  missingFields: string[];
}

// ─── Generation Pipeline ────────────────────────────────────────────────────

export interface GenerationOptions {
  generateMoons: boolean;
  generateHabitability: boolean;
  generateMissingMass: boolean;
  generateMissingDistance: boolean;
  moonChanceGas: number;       // 0-1 probability
  moonChanceTerrestrial: number;
  maxMoonsPerBody: number;
}

export interface GeneratedSystem {
  system: StarSystem;
  conflicts: Conflict[];
  generationLog: string[];
}

// ─── Conflict Resolution ────────────────────────────────────────────────────

export type ConflictType =
  | 'mass-mismatch'
  | 'gravity-mismatch'
  | 'distance-mismatch'
  | 'zone-mismatch'
  | 'habitability-mismatch'
  | 'missing-moons'
  | 'missing-composition'
  | 'moon-count-discrepancy';

export interface Conflict {
  id: string;
  type: ConflictType;
  severity: 'critical' | 'major' | 'minor';
  worldId: string;
  worldName: string;
  bookValue: string;
  generatedValue: string;
  description: string;
  resolution: 'pending' | 'accept-book' | 'accept-generated' | 'custom';
  customValue?: string;
}

export interface ResolutionChoice {
  conflictId: string;
  choice: 'accept-book' | 'accept-generated' | 'custom';
  customValue?: string;
}

// ─── Conversion Result ──────────────────────────────────────────────────────

export interface ConversionResult {
  success: boolean;
  system?: StarSystem;
  inventoryReport: InventoryReport;
  conflicts: Conflict[];
  unresolvedConflicts: Conflict[];
  encodedPayload?: string;   // URL-safe base64 for ?system=...
}
