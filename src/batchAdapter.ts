/**
 * batchAdapter.ts
 *
 * Converts a Mneme batch-export system (from test-batch.json) to the
 * MapPayload format expected by the 2D map renderer.
 *
 * Batch shape   →   MapPayload / StarSystem shape
 * ─────────────────────────────────────────────────
 * star.class        primaryStar.class
 * star.grade        primaryStar.grade
 * star.massSOL      primaryStar.mass
 * bodies[].au       distanceAU
 * bodies[].massEM   mass
 * gasClass "IV"     gasClass 4  (Roman → number)
 */

import type { MapPayload, StarSystem } from './types';

const ROMAN_TO_NUM: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
};

export interface BatchBody {
  type: string;
  zone: string;
  au: number;
  massEM: number;
  gasClass?: string;
}

export interface BatchMainWorld {
  type: string;
  sizeKM: number;
  gravityG: number;
  habitability: number;
  population: number;
  techLevel: number;
  zone: string;
  au: number;
}

export interface BatchInhabitants {
  populated: boolean;
  starportClass: string;
  travelZone: string;
  techLevel: number;
}

export interface BatchPlanetarySystem {
  totalBodies: number;
  disks: number;
  dwarfs: number;
  terrestrials: number;
  ices: number;
  gases: number;
  hotJupiterPresent: boolean;
  bodies: BatchBody[];
}

export interface BatchSystem {
  id: string;
  generatedAt: string;
  star: {
    class: string;
    grade: number;
    massSOL: number;
    luminosity: number;
    companionCount: number;
  };
  mainWorld: BatchMainWorld | null;
  inhabitants: BatchInhabitants;
  planetarySystem: BatchPlanetarySystem;
}

/**
 * Convert a batch system to the MapPayload the 2D renderer expects.
 */
export function batchToMapPayload(s: BatchSystem): MapPayload {
  const bodies = s.planetarySystem.bodies;

  const circumstellarDisks = bodies
    .filter((b) => b.type === 'disk')
    .map((b) => ({ distanceAU: b.au, mass: b.massEM }));

  const dwarfPlanets = bodies
    .filter((b) => b.type === 'dwarf')
    .map((b) => ({ distanceAU: b.au, mass: b.massEM }));

  const terrestrialWorlds = bodies
    .filter((b) => b.type === 'terrestrial')
    .map((b) => ({ distanceAU: b.au, mass: b.massEM }));

  const iceWorlds = bodies
    .filter((b) => b.type === 'ice')
    .map((b) => ({ distanceAU: b.au, mass: b.massEM }));

  const gasWorlds = bodies
    .filter((b) => b.type === 'gas')
    .map((b) => ({
      distanceAU: b.au,
      mass: b.massEM,
      gasClass: ROMAN_TO_NUM[b.gasClass ?? ''] ?? 1,
    }));

  let mainWorld: StarSystem['mainWorld'] = null;
  if (s.mainWorld) {
    const mw = s.mainWorld;
    // Find a matching body for massEM (within 0.001 AU tolerance).
    // Habitat worlds are orbital structures — no natural body matches; default mass 1.0.
    const match = bodies.find((b) => Math.abs(b.au - mw.au) < 0.001);
    mainWorld = {
      type: mw.type,
      distanceAU: mw.au,
      massEM: match?.massEM ?? 1.0,
    };
  }

  const starSystem: StarSystem = {
    key: s.id,
    primaryStar: {
      class: s.star.class,
      grade: s.star.grade,
      mass: s.star.massSOL,
    },
    companionStars: [],
    circumstellarDisks,
    dwarfPlanets,
    terrestrialWorlds,
    iceWorlds,
    gasWorlds,
    mainWorld,
  };

  return {
    starSystem,
    starfieldSeed: s.id.slice(0, 8),
    epoch: { year: 2300, month: 1, day: 1 },
  };
}

/**
 * Encode a MapPayload to a URL-safe Base64 string (matches the encoding
 * used by MWG's SystemViewer.tsx and decoded by main.ts).
 */
export function encodePayload(payload: MapPayload): string {
  const json = JSON.stringify(payload);
  return btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
}
