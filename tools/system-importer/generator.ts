/**
 * Generation Pipeline
 *
 * Steps:
 *   1. Star → validate/create primaryStar, companionStars, zones
 *   2. Worlds → categorize, normalize distances & masses, map to StarSystem arrays
 *   3. Moons → generate for gas giants & massive terrestrials
 *   4. Habitability → calculate baseline habitability, compare with book
 *
 * At each step, conflicts between generated values and book values are recorded.
 */

import type {
  StarSystem,
  ZoneBoundaries,
} from '../../src/types';
import type {
  ParsedSystem,
  ParsedWorld,
  WorldCategory,
  GenerationOptions,
  GeneratedSystem,
  Conflict,
} from './types';

const DEFAULT_OPTIONS: GenerationOptions = {
  generateMoons: true,
  generateHabitability: true,
  generateMissingMass: true,
  generateMissingDistance: false, // distance is critical — don't guess
  moonChanceGas: 0.85,
  moonChanceTerrestrial: 0.25,
  maxMoonsPerBody: 4,
};

// ─── Step 1: Star ───────────────────────────────────────────────────────────

function generateStar(parsed: ParsedSystem): { system: Partial<StarSystem>; conflicts: Conflict[] } {
  const conflicts: Conflict[] = [];

  const primaryStar = {
    class: parsed.starClass || 'M',
    grade: parsed.starGrade || 5,
    mass: parsed.starMassSOL > 0 ? parsed.starMassSOL : 0.5,
  };

  // Derive zones if missing
  let zones: ZoneBoundaries | undefined = parsed.zones;
  if (!zones && parsed.starLuminosity > 0) {
    const L = parsed.starLuminosity;
    const hzInner = Math.sqrt(L);
    const hzOuter = hzInner * 2;
    zones = {
      infernal: { min: 0, max: hzInner * 0.5 },
      hot: { min: hzInner * 0.5, max: hzInner },
      conservative: { min: hzInner, max: hzOuter },
      cold: { min: hzOuter, max: hzOuter * 5 },
      outer: { min: hzOuter * 5, max: null },
    };
  }

  return {
    system: { primaryStar, zones },
    conflicts,
  };
}

// ─── Step 2: Worlds ─────────────────────────────────────────────────────────

function generateWorlds(parsed: ParsedSystem, opts: GenerationOptions): {
  system: Partial<StarSystem>;
  conflicts: Conflict[];
} {
  const conflicts: Conflict[] = [];

  const circumstellarDisks: StarSystem['circumstellarDisks'] = [];
  const dwarfPlanets: StarSystem['dwarfPlanets'] = [];
  const terrestrialWorlds: StarSystem['terrestrialWorlds'] = [];
  const iceWorlds: StarSystem['iceWorlds'] = [];
  const gasWorlds: StarSystem['gasWorlds'] = [];

  let mainWorld: StarSystem['mainWorld'] = null;

  for (const world of parsed.worlds) {
    // Skip unknown-category worlds — they should have been flagged by inventory
    if (world.category === 'unknown') continue;

    const mass = isFinite(world.massEM) && world.massEM > 0
      ? world.massEM
      : opts.generateMissingMass
        ? estimateMass(world.category)
        : 0.1;

    const distanceAU = isFinite(world.distanceAU) && world.distanceAU > 0
      ? world.distanceAU
      : 1.0; // fallback, but inventory should have flagged this

    const label = world.name || 'Unnamed';
    const id = world.id;

    // Record mass conflict if we had to estimate
    if (!isFinite(world.massEM) || world.massEM <= 0) {
      conflicts.push(makeConflict(
        'missing-composition',
        'minor',
        world,
        'mass',
        `${world.raw.mass || '(blank)'}`,
        `${mass.toFixed(3)} EM (estimated)`
      ));
    }

    // Build the appropriate array entry
    switch (world.category) {
      case 'disk':
        circumstellarDisks.push({ id, distanceAU, mass, label });
        break;
      case 'dwarf':
        dwarfPlanets.push({ id, distanceAU, mass, label });
        break;
      case 'terrestrial':
        terrestrialWorlds.push({ id, distanceAU, mass, label });
        break;
      case 'ice':
        iceWorlds.push({ id, distanceAU, mass, label });
        break;
      case 'gas': {
        const gasClass = world.gasClass ?? 1;
        gasWorlds.push({ id, distanceAU, mass, gasClass, label });
        break;
      }
    }

    // Track main world
    if (world.isMainWorld) {
      mainWorld = {
        type: world.category === 'dwarf' ? 'Dwarf'
          : world.category === 'ice' ? 'Ice World'
          : 'Terrestrial',
        distanceAU,
        massEM: mass,
      };
    }
  }

  return {
    system: {
      circumstellarDisks,
      dwarfPlanets,
      terrestrialWorlds,
      iceWorlds,
      gasWorlds,
      mainWorld,
    },
    conflicts,
  };
}

// ─── Step 3: Moons ──────────────────────────────────────────────────────────

function generateMoons(
  parsed: ParsedSystem,
  system: Partial<StarSystem>,
  opts: GenerationOptions
): { moons: StarSystem['moons']; conflicts: Conflict[] } {
  if (!opts.generateMoons) return { moons: [], conflicts: [] };

  const conflicts: Conflict[] = [];
  const moons: StarSystem['moons'] = [];
  let moonCounter = 0;

  // Gather all parent bodies that can have moons
  const parents: Array<{ id: string; category: WorldCategory; mass: number; distanceAU: number; label: string }> = [];

  for (const world of parsed.worlds) {
    if (world.category === 'unknown' || world.category === 'disk') continue;

    const mass = isFinite(world.massEM) && world.massEM > 0 ? world.massEM : estimateMass(world.category);

    if (world.category === 'gas') {
      parents.push({ id: world.id, category: 'gas', mass, distanceAU: world.distanceAU, label: world.name });
    } else if (world.category === 'terrestrial' && mass >= 1.0) {
      // Massive terrestrials can have moons
      parents.push({ id: world.id, category: 'terrestrial', mass, distanceAU: world.distanceAU, label: world.name });
    }
  }

  for (const parent of parents) {
    const chance = parent.category === 'gas' ? opts.moonChanceGas : opts.moonChanceTerrestrial;
    if (Math.random() > chance) continue;

    const numMoons = Math.floor(Math.random() * opts.maxMoonsPerBody) + 1;

    for (let i = 0; i < numMoons; i++) {
      moonCounter++;
      const moonOrbitAU = generateMoonOrbit(parent.mass, i, numMoons);
      const moonMass = generateMoonMass(parent.mass);
      const moonId = `moon-${parent.id}-${i}`;
      const moonLabel = `${parent.label} ${toRoman(i + 1)}`;

      moons.push({
        id: moonId,
        distanceAU: parent.distanceAU,
        mass: moonMass,
        moonOrbitAU,
        parentId: parent.id,
        type: 'moon',
        label: moonLabel,
      });
    }

    // If book mentions moons but we generated fewer/more, that could be a conflict
    // (future: parse narrative for moon mentions)
  }

  return { moons, conflicts };
}

function generateMoonOrbit(parentMassEM: number, index: number, total: number): number {
  // Hill sphere approximation: ~0.5 AU * (mass/1e-6)^(1/3) for small bodies
  // Simplified: moons orbit at 0.0001–0.01 AU depending on parent mass
  const minOrbit = 0.0001;
  const maxOrbit = 0.005 * Math.pow(parentMassEM, 1 / 3);
  const step = (maxOrbit - minOrbit) / Math.max(total, 1);
  return minOrbit + step * index + (Math.random() * step * 0.3);
}

function generateMoonMass(parentMassEM: number): number {
  // Moon mass is typically 0.01–1% of parent mass
  const ratio = 0.0001 + Math.random() * 0.0099;
  return Math.max(0.001, parentMassEM * ratio);
}

// ─── Step 4: Habitability ───────────────────────────────────────────────────

function getTLModifier(temp: string | undefined): number {
  // Extract TL from strings like "Hot (TL7)", "Thin (TL7)", "High (TL8) Toxic"
  if (!temp) return 0;
  const match = temp.match(/TL(\d+)/);
  return match ? Math.max(0, Math.min(9, parseInt(match[1]) - 7)) : 0;
}

function generateHabitability(
  parsed: ParsedSystem,
  system: Partial<StarSystem>
): { conflicts: Conflict[] } {
  const conflicts: Conflict[] = [];

  for (const world of parsed.worlds) {
    if (world.habitability === undefined) continue;

    // Simple MWG-style baseline calculation
    let baseline = 0;

    // Gravity modifier
    if (world.gravityG !== undefined) {
      if (world.gravityG < 0.3) baseline -= 1;
      else if (world.gravityG > 2.5) baseline -= 2;
      else if (world.gravityG > 1.7) baseline -= 1;
    }

    // Temperature modifier
    const tempWord = (world.temp || '').toLowerCase();
    if (tempWord.includes('freezing')) baseline -= 3;
    else if (tempWord.includes('inferno')) baseline -= 3;
    else if (tempWord.includes('cold')) baseline += 0;
    else if (tempWord.includes('hot')) baseline += 0;
    else if (tempWord.includes('average')) baseline += 1;

    // Atmosphere modifier
    const atmoWord = (world.atmosphere || '').toLowerCase();
    if (atmoWord.includes('trace')) baseline -= 2;
    else if (atmoWord.includes('thin')) baseline += 0;
    else if (atmoWord.includes('average')) baseline += 1;
    else if (atmoWord.includes('dense')) baseline += 0;

    // Hazard modifier
    const hazardWord = (world.hazard || '').toLowerCase();
    if (hazardWord.includes('toxic')) baseline -= 2;
    else if (hazardWord.includes('corrosive')) baseline -= 1;
    else if (hazardWord.includes('biohazard')) baseline -= 1;
    else if (hazardWord.includes('radioactive')) baseline -= 3;
    else if (hazardWord.includes('none') || hazardWord === '') baseline += 1;

    // Biochem modifier
    const bioWord = (world.biore || '').toLowerCase();
    if (bioWord.includes('abundant')) baseline += 1;
    else if (bioWord.includes('uncommon')) baseline -= 3;
    else if (bioWord.includes('rare')) baseline -= 4;
    else if (bioWord.includes('scarce')) baseline -= 5;

    // TL modifier — look in temp, atmosphere, or hazard fields
    const tlMod = Math.max(
      getTLModifier(world.temp),
      getTLModifier(world.atmosphere),
      getTLModifier(world.hazard)
    );

    // Calculate final habitability
    const calculatedFinal = baseline + tlMod;

    // Clamp
    const clampedFinal = Math.max(-10, Math.min(10, calculatedFinal));

    // Compare with book (book value is FINAL habitability)
    const diff = Math.abs(clampedFinal - world.habitability);
    if (diff >= 2) {
      conflicts.push(makeConflict(
        'habitability-mismatch',
        diff >= 5 ? 'major' : 'minor',
        world,
        'habitability',
        `${world.habitability}`,
        `${clampedFinal} (baseline=${baseline} + TL${tlMod > 0 ? '+' + tlMod : ''})`
      ));
    }
  }

  return { conflicts };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function estimateMass(category: WorldCategory): number {
  switch (category) {
    case 'dwarf': return 0.01;      // ~1% Earth mass
    case 'terrestrial': return 1.0;  // Earth-like
    case 'ice': return 0.5;         // Mid-size
    case 'gas': return 100.0;       // Jupiter-ish
    case 'disk': return 0.001;      // Dust
    default: return 0.1;
  }
}

function makeConflict(
  type: Conflict['type'],
  severity: Conflict['severity'],
  world: ParsedWorld,
  fieldName: string,
  bookValue: string,
  generatedValue: string
): Conflict {
  return {
    id: `${world.id}-${fieldName}`,
    type,
    severity,
    worldId: world.id,
    worldName: world.name,
    bookValue,
    generatedValue,
    description: `World "${world.name}": book says ${fieldName} = ${bookValue}, but generator produced ${generatedValue}.`,
    resolution: 'pending',
  };
}

function toRoman(n: number): string {
  const map: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X' };
  return map[n] || String(n);
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

export function generateSystem(parsed: ParsedSystem, opts?: Partial<GenerationOptions>): GeneratedSystem {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const generationLog: string[] = [];
  const allConflicts: Conflict[] = [];

  generationLog.push(`Starting generation for system: ${parsed.starName}`);

  // Step 1: Star
  const starResult = generateStar(parsed);
  allConflicts.push(...starResult.conflicts);
  generationLog.push(`Star: ${starResult.system.primaryStar!.class}${starResult.system.primaryStar!.grade}, mass=${starResult.system.primaryStar!.mass} M☉`);

  // Step 2: Worlds
  const worldsResult = generateWorlds(parsed, options);
  allConflicts.push(...worldsResult.conflicts);
  const counts = [
    worldsResult.system.circumstellarDisks?.length || 0,
    worldsResult.system.dwarfPlanets?.length || 0,
    worldsResult.system.terrestrialWorlds?.length || 0,
    worldsResult.system.iceWorlds?.length || 0,
    worldsResult.system.gasWorlds?.length || 0,
  ];
  generationLog.push(`Worlds: ${counts.reduce((a, b) => a + b, 0)} bodies (disks=${counts[0]}, dwarfs=${counts[1]}, terrestrials=${counts[2]}, ice=${counts[3]}, gas=${counts[4]})`);

  // Step 3: Moons
  const moonsResult = generateMoons(parsed, worldsResult.system, options);
  allConflicts.push(...moonsResult.conflicts);
  generationLog.push(`Moons: ${moonsResult.moons?.length || 0} generated`);

  // Step 4: Habitability
  const habResult = generateHabitability(parsed, worldsResult.system);
  allConflicts.push(...habResult.conflicts);
  if (habResult.conflicts.length > 0) {
    generationLog.push(`Habitability: ${habResult.conflicts.length} conflicts detected`);
  } else {
    generationLog.push(`Habitability: all values consistent`);
  }

  // Assemble final StarSystem
  const system: StarSystem = {
    key: parsed.key,
    primaryStar: starResult.system.primaryStar!,
    companionStars: [], // TODO: handle binary systems
    circumstellarDisks: worldsResult.system.circumstellarDisks,
    dwarfPlanets: worldsResult.system.dwarfPlanets,
    terrestrialWorlds: worldsResult.system.terrestrialWorlds,
    iceWorlds: worldsResult.system.iceWorlds,
    gasWorlds: worldsResult.system.gasWorlds,
    moons: moonsResult.moons,
    mainWorld: worldsResult.system.mainWorld,
    zones: starResult.system.zones,
  };

  generationLog.push(`Generation complete. ${allConflicts.length} total conflicts.`);

  return { system, conflicts: allConflicts, generationLog };
}
