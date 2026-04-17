import type { StarSystem, MapPayload } from './types';

const CLASSES = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
const CLASS_MASS: Record<string, [number, number]> = {
  O: [16, 60], B: [2.1, 16], A: [1.4, 2.1], F: [1.04, 1.4],
  G: [0.79, 1.04], K: [0.45, 0.79], M: [0.08, 0.45],
};
const CLASS_LUM: Record<string, [number, number]> = {
  O: [30000, 500000], B: [25, 30000], A: [5, 25], F: [1.5, 5],
  G: [0.6, 1.5], K: [0.08, 0.6], M: [0.001, 0.08],
};

function rollD6(): number { return Math.floor(Math.random() * 6) + 1; }
function roll2D6(): number { return rollD6() + rollD6(); }
function roll3D6(): number { return rollD6() + rollD6() + rollD6(); }
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateStar(): { class: string; grade: number; mass: number; luminosity: number } {
  const cls = CLASSES[randInt(0, CLASSES.length - 1)];
  const grade = randInt(0, 9);
  const [mMin, mMax] = CLASS_MASS[cls];
  const mass = randRange(mMin, mMax);
  const [lMin, lMax] = CLASS_LUM[cls];
  const luminosity = randRange(lMin, lMax);
  return { class: cls, grade, mass, luminosity };
}

function zoneFromAU(au: number, sqrtL: number): string {
  const infernal = sqrtL * 0.4;
  const hot = sqrtL * 0.8;
  const conservative = sqrtL * 1.2;
  const cold = sqrtL * 4.85;
  if (au <= infernal) return 'Infernal';
  if (au <= hot) return 'Hot';
  if (au <= conservative) return 'Conservative';
  if (au <= cold) return 'Cold';
  return 'Outer';
}

function pickBodyType(zone: string): 'dwarf' | 'terrestrial' | 'ice' | 'gas' {
  const r = roll2D6();
  if (zone === 'Infernal') {
    if (r <= 4) return 'dwarf';
    if (r <= 6) return 'terrestrial';
    if (r <= 8) return 'ice';
    return 'gas';
  }
  if (zone === 'Hot') {
    if (r <= 5) return 'dwarf';
    if (r <= 9) return 'terrestrial';
    if (r <= 10) return 'ice';
    return 'gas';
  }
  if (zone === 'Conservative') {
    if (r <= 4) return 'dwarf';
    if (r <= 10) return 'terrestrial';
    if (r <= 11) return 'ice';
    return 'gas';
  }
  if (zone === 'Cold') {
    if (r <= 5) return 'dwarf';
    if (r <= 7) return 'terrestrial';
    if (r <= 10) return 'ice';
    return 'gas';
  }
  // Outer
  if (r <= 4) return 'dwarf';
  if (r <= 5) return 'terrestrial';
  if (r <= 9) return 'ice';
  return 'gas';
}

function bodyMass(type: 'dwarf' | 'terrestrial' | 'ice' | 'gas'): number {
  switch (type) {
    case 'dwarf': return randRange(0.001, 0.1);
    case 'terrestrial': return randRange(0.1, 2.5);
    case 'ice': return randRange(0.05, 0.5);
    case 'gas': return randRange(10, 300);
  }
}

function gasClass(): number {
  const r = rollD6();
  if (r <= 2) return 1;
  if (r <= 3) return 2;
  if (r <= 4) return 3;
  if (r <= 5) return 4;
  return 5;
}

export function generateRandomSystem(): MapPayload {
  const star = generateStar();
  const sqrtL = Math.sqrt(star.luminosity);

  // Generate companion stars (0–2)
  const companionCount = Math.max(0, roll2D6() - 8);
  const companions: StarSystem['companionStars'] = [];
  for (let i = 0; i < companionCount; i++) {
    const c = generateStar();
    companions.push({
      class: c.class,
      grade: c.grade,
      mass: c.mass,
      orbitDistance: randRange(sqrtL * 20, sqrtL * 200),
    });
  }

  // Generate disks
  const diskCount = Math.max(0, roll2D6() - 6);
  const disks: StarSystem['circumstellarDisks'] = [];
  for (let i = 0; i < diskCount; i++) {
    disks.push({ distanceAU: randRange(sqrtL * 0.5, sqrtL * 15), mass: randRange(0.0001, 0.01) });
  }

  // Generate planets
  const planetCount = roll2D6() + (star.class === 'F' ? 2 : star.class === 'G' ? 0 : star.class === 'M' ? -2 : 0);
  const dwarfs: StarSystem['dwarfPlanets'] = [];
  const terrestrials: StarSystem['terrestrialWorlds'] = [];
  const ices: StarSystem['iceWorlds'] = [];
  const gases: StarSystem['gasWorlds'] = [];

  const placedAU: number[] = [];
  function isTooClose(au: number): boolean {
    return placedAU.some(p => Math.abs(p - au) < 0.05);
  }

  for (let i = 0; i < planetCount; i++) {
    let au = randRange(sqrtL * 0.1, sqrtL * 20);
    let safety = 0;
    while (isTooClose(au) && safety < 20) {
      au = randRange(sqrtL * 0.1, sqrtL * 20);
      safety++;
    }
    placedAU.push(au);

    const zone = zoneFromAU(au, sqrtL);
    const type = pickBodyType(zone);
    const mass = bodyMass(type);

    switch (type) {
      case 'dwarf': dwarfs.push({ distanceAU: au, mass }); break;
      case 'terrestrial': terrestrials.push({ distanceAU: au, mass }); break;
      case 'ice': ices.push({ distanceAU: au, mass }); break;
      case 'gas': gases.push({ distanceAU: au, mass, gasClass: gasClass() }); break;
    }
  }

  // Pick main world: prefer Conservative zone terrestrial, then any terrestrial, then dwarf
  let mainWorld: StarSystem['mainWorld'] = null;
  const conservativeTerrestrial = terrestrials.find(t => zoneFromAU(t.distanceAU, sqrtL) === 'Conservative');
  if (conservativeTerrestrial) {
    mainWorld = { type: 'Terrestrial', distanceAU: conservativeTerrestrial.distanceAU, massEM: conservativeTerrestrial.mass };
  } else if (terrestrials.length > 0) {
    const t = terrestrials[Math.floor(Math.random() * terrestrials.length)];
    mainWorld = { type: 'Terrestrial', distanceAU: t.distanceAU, massEM: t.mass };
  } else if (dwarfs.length > 0) {
    const d = dwarfs[Math.floor(Math.random() * dwarfs.length)];
    mainWorld = { type: 'Dwarf', distanceAU: d.distanceAU, massEM: d.mass };
  }

  const system: StarSystem = {
    key: Math.random().toString(36).slice(2, 10),
    primaryStar: { class: star.class, grade: star.grade, mass: star.mass },
    companionStars: companions,
    circumstellarDisks: disks,
    dwarfPlanets: dwarfs,
    terrestrialWorlds: terrestrials,
    iceWorlds: ices,
    gasWorlds: gases,
    mainWorld,
  };

  return {
    starSystem: system,
    starfieldSeed: Math.random().toString(36).slice(2, 10).toUpperCase(),
    epoch: { year: 2300, month: 1, day: 1 },
  };
}
