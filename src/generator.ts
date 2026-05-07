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

/** Hierarchical-stability factor for nested binaries: a_outer ≥ 3 × a_inner. */
const HIERARCHICAL_RATIO_MIN = 3;
/** Max attempts to satisfy the hierarchical-stability constraint. */
const HIERARCHICAL_REROLL_MAX = 10;

function rollD6(): number { return Math.floor(Math.random() * 6) + 1; }
function roll2D6(): number { return rollD6() + rollD6(); }
function roll3D6(): number { return rollD6() + rollD6() + rollD6(); }
function roll3D3(): number { return rollD6() + rollD6() + rollD6() - 3; } // 0–15
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function round(value: number, decimals: number = 2): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
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

// =====================
// Multi-Star Helpers (ported from Mneme CE World Generator)
// =====================

/** Kepler's third law in solar units: P² = a³ / (m_total). */
function keplerPeriodYears(semiMajorAxisAU: number, totalMassSolar: number): number {
  if (totalMassSolar <= 0) return 0;
  return Math.sqrt(Math.pow(semiMajorAxisAU, 3) / totalMassSolar);
}

/** The "gear ratio" — each star wobbles in a circle around the shared barycenter. */
function computeBarycenter(semiMajorAxisAU: number, primaryMass: number, secondaryMass: number) {
  const total = primaryMass + secondaryMass;
  if (total <= 0) return { rPrimaryAU: 0, rSecondaryAU: 0 };
  return {
    rPrimaryAU: round(semiMajorAxisAU * (secondaryMass / total), 2),
    rSecondaryAU: round(semiMajorAxisAU * (primaryMass / total), 2),
  };
}

/** Wide companion separation: 3D3 × heliopause × (1 + e), floor 3× heliopause×(1+e). */
function getWideCompanionOrbitDistance(d3d3Roll: number, heliopauseAU: number, eccentricity: number): number {
  const safeRoll = Math.max(d3d3Roll, 3);
  return round(safeRoll * heliopauseAU * (1 + eccentricity), 1);
}

interface StarLeaf {
  kind: 'star';
  starId: string;
  totalMass: number;
}

interface BinaryNode {
  kind: 'binary';
  primary: OrbitNode;
  secondary: OrbitNode;
  semiMajorAxisAU: number;
  eccentricity: number;
  inclinationDeg: number;
  totalMass: number;
  rPrimaryAU: number;
  rSecondaryAU: number;
  periodYears: number;
}

type OrbitNode = StarLeaf | BinaryNode;

function makeStarLeaf(starId: string, totalMass: number): StarLeaf {
  return { kind: 'star', starId, totalMass };
}

function rollEccentricity(): number {
  return (rollD6() - 1) / 10; // 0.0 – 0.5
}

/** Return the maximum semi-major axis among all BinaryNodes inside the subtree. */
function maxInnerSemiMajorAxis(node: OrbitNode): number {
  if (node.kind === 'star') return 0;
  return Math.max(
    node.semiMajorAxisAU,
    maxInnerSemiMajorAxis(node.primary),
    maxInnerSemiMajorAxis(node.secondary),
  );
}

function buildBinary(inner: OrbitNode, outerLeaf: StarLeaf, parentHeliopauseAU: number): BinaryNode {
  const innerCeiling = maxInnerSemiMajorAxis(inner);
  let semiMajorAxisAU = 0;
  let eccentricity = 0;
  for (let attempt = 0; attempt < HIERARCHICAL_REROLL_MAX; attempt++) {
    const rolled = roll3D3();
    eccentricity = rollEccentricity();
    semiMajorAxisAU = getWideCompanionOrbitDistance(rolled, parentHeliopauseAU, eccentricity);
    if (semiMajorAxisAU >= HIERARCHICAL_RATIO_MIN * innerCeiling) break;
  }

  const totalMass = inner.totalMass + outerLeaf.totalMass;
  const { rPrimaryAU, rSecondaryAU } = computeBarycenter(semiMajorAxisAU, inner.totalMass, outerLeaf.totalMass);

  return {
    kind: 'binary',
    primary: inner,
    secondary: outerLeaf,
    semiMajorAxisAU,
    eccentricity,
    inclinationDeg: (rollD6() - 1) * 30,
    totalMass,
    rPrimaryAU,
    rSecondaryAU,
    periodYears: round(keplerPeriodYears(semiMajorAxisAU, totalMass), 2),
  };
}

function buildOrbitTree(primaryMass: number, companions: { mass: number; id: string }[], heliopauseAU: number): OrbitNode {
  let root: OrbitNode = makeStarLeaf('primary', primaryMass);
  for (const companion of companions) {
    const leaf = makeStarLeaf(companion.id, companion.mass);
    root = buildBinary(root, leaf, heliopauseAU);
  }
  return root;
}

function buildBarycenterView(root: OrbitNode, stars: { id: string; class: string; grade: number; mass: number }[]): StarSystem['barycenterView'] {
  const starMap = new Map(stars.map(s => [s.id, s]));
  const results: NonNullable<StarSystem['barycenterView']>['stars'] = [];

  function hashString(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  function makeRng(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  const baseSeed = hashString(stars.map(s => s.id).join('|'));
  let binaryCounter = 0;

  function walk(node: OrbitNode, parentX: number, parentY: number, outermostBinary: BinaryNode | null): void {
    if (node.kind === 'star') {
      const star = starMap.get(node.starId);
      if (!star) return;
      const dx = parentX;
      const dy = parentY;
      const distanceAU = round(Math.sqrt(dx * dx + dy * dy), 2);
      const angleRad = Math.atan2(dy, dx);
      results.push({
        starId: node.starId,
        isPrimary: node.starId === 'primary',
        class: star.class,
        grade: star.grade,
        mass: star.mass,
        distanceAU,
        periodYears: outermostBinary ? outermostBinary.periodYears : 0,
        eccentricity: outermostBinary ? outermostBinary.eccentricity : 0,
        inclinationDeg: outermostBinary ? outermostBinary.inclinationDeg : 0,
        angleRad: round(angleRad, 4),
      });
      return;
    }
    const rng = makeRng(baseSeed + binaryCounter++);
    const angle = rng() * Math.PI * 2;
    const px = parentX - node.rPrimaryAU * Math.cos(angle);
    const py = parentY - node.rPrimaryAU * Math.sin(angle);
    const sx = parentX + node.rSecondaryAU * Math.cos(angle);
    const sy = parentY + node.rSecondaryAU * Math.sin(angle);
    const binaryForChildren = outermostBinary ?? node;
    walk(node.primary, px, py, binaryForChildren);
    walk(node.secondary, sx, sy, binaryForChildren);
  }

  walk(root, 0, 0, null);
  return { stars: results };
}

export function generateRandomSystem(): MapPayload {
  const star = generateStar();
  const sqrtL = Math.sqrt(star.luminosity);
  const heliopauseAU = round(sqrtL * 120, 1);

  // Generate companion stars (0–2) with heliopause-based distances
  const companionCount = Math.max(0, roll2D6() - 8);
  const companions: StarSystem['companionStars'] = [];
  for (let i = 0; i < companionCount; i++) {
    const c = generateStar();
    companions.push({
      class: c.class,
      grade: c.grade,
      mass: c.mass,
      // orbitDistance will be overwritten by the tree below with heliopause-based values
      orbitDistance: 0,
    });
  }

  // Build hierarchical orbit tree and compute heliopause-based separations
  let barycenterView: StarSystem['barycenterView'];
  if (companions.length > 0) {
    const companionIds = companions.map((_, i) => `companion-${i}`);
    const tree = buildOrbitTree(
      star.mass,
      companions.map((c, i) => ({ mass: c.mass, id: companionIds[i] })),
      heliopauseAU,
    );

    // Overlay tree separations back onto companions
    let cursor: OrbitNode = tree;
    const separations: number[] = [];
    while (cursor && cursor.kind === 'binary') {
      separations.unshift(cursor.semiMajorAxisAU);
      if (cursor.primary.kind !== 'binary') break;
      cursor = cursor.primary;
    }
    for (let i = 0; i < companions.length && i < separations.length; i++) {
      companions[i].orbitDistance = separations[i];
    }

    // Build barycenter view
    const allStars = [
      { id: 'primary', class: star.class, grade: star.grade, mass: star.mass },
      ...companions.map((c, i) => ({ id: companionIds[i], class: c.class, grade: c.grade, mass: c.mass })),
    ];
    barycenterView = buildBarycenterView(tree, allStars);
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
    barycenterView,
  };

  return {
    starSystem: system,
    starfieldSeed: Math.random().toString(36).slice(2, 10).toUpperCase(),
    epoch: { year: 2300, month: 1, day: 1 },
  };
}
