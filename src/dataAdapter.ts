import type { SceneBody, BodyType, DiskPoint, StarSystem } from './types';
import { calculatePeriodDays, hashToFloat } from './orbitMath';
import { mulberry32 } from './starfield';

const SPECTRAL_COLOURS: Record<string, string> = {
  O: '#A5C8FF',
  B: '#C2D8FF',
  A: '#FFFFFF',
  F: '#FFF8E7',
  G: '#FFE4B5',
  K: '#FFB366',
  M: '#FF6B6B',
};

const BODY_COLOURS: Record<BodyType, { fill: string; stroke: string }> = {
  'star-primary': { fill: '#FFE4B5', stroke: '#ffffff' },
  'star-companion': { fill: '#FFE4B5', stroke: '#ffffff' },
  disk: { fill: 'transparent', stroke: '#8B7355' },
  dwarf: { fill: '#9CA3AF', stroke: '#4B5563' },
  terrestrial: { fill: '#4ADE80', stroke: '#166534' },
  ice: { fill: '#22D3EE', stroke: '#155E75' },
  'gas-i': { fill: '#FDE047', stroke: '#A16207' },
  'gas-ii': { fill: '#60A5FA', stroke: '#1E40AF' },
  'gas-iii': { fill: '#FB923C', stroke: '#9A3412' },
  'gas-iv': { fill: '#C084FC', stroke: '#7E22CE' },
  'gas-v': { fill: '#E5E7EB', stroke: '#4B5563' },
};

function getSpectralColour(cls: string): string {
  const key = cls.charAt(0).toUpperCase();
  return SPECTRAL_COLOURS[key] || '#FFFFFF';
}

function massToRadiusPx(mass: number, type: BodyType): number {
  if (type.startsWith('star')) return 12;
  if (type.startsWith('gas')) return 7;
  if (type === 'disk') return 0;
  if (type === 'dwarf') return 3;
  if (type === 'ice') return 3.5;
  return 4; // terrestrial
}

/**
 * Build a scene graph from a StarSystem.
 * Phase 1: INTRAS Level 1 only (stars, disks, planets).
 */
export function buildSceneGraph(system: StarSystem): SceneBody[] {
  const bodies: SceneBody[] = [];
  const baseHash = system.key || JSON.stringify(system.primaryStar);

  // Primary star
  bodies.push({
    id: 'star-primary',
    type: 'star-primary',
    label: `${system.primaryStar.class}${system.primaryStar.grade}`,
    distanceAU: 0,
    mass: system.primaryStar.mass,
    radiusPx: 14,
    colour: getSpectralColour(system.primaryStar.class),
    strokeColour: '#ffffff',
    angle: 0,
    periodDays: 0,
    isMainWorld: false,
  });

  // Companion stars
  system.companionStars?.forEach((star: { class: string; grade: number; mass: number; orbitDistance: number }, idx: number) => {
    const angle = hashToFloat(baseHash + `-companion-${idx}`) * Math.PI * 2;
    bodies.push({
      id: `star-companion-${idx}`,
      type: 'star-companion',
      label: `${star.class}${star.grade}`,
      distanceAU: star.orbitDistance,
      mass: star.mass,
      radiusPx: 10,
      colour: getSpectralColour(star.class),
      strokeColour: '#ffffff',
      angle,
      periodDays: calculatePeriodDays(star.orbitDistance * 5), // rough companion period
      isMainWorld: false,
    });
  });

  // Circumstellar disks
  system.circumstellarDisks?.forEach((disk: { distanceAU: number; mass: number }, idx: number) => {
    const angle = hashToFloat(baseHash + `-disk-${idx}`) * Math.PI * 2;
    const diskSeed = `${baseHash}-disk-${idx}`;
    bodies.push({
      id: `disk-${idx}`,
      type: 'disk',
      label: 'Disk',
      distanceAU: disk.distanceAU,
      mass: disk.mass,
      radiusPx: 5,
      colour: 'transparent',
      strokeColour: BODY_COLOURS.disk.stroke,
      angle,
      periodDays: calculatePeriodDays(disk.distanceAU),
      isMainWorld: false,
      diskPoints: generateDiskPoints(diskSeed),
    });
  });

  // Dwarf planets
  system.dwarfPlanets?.forEach((p: { distanceAU: number; mass: number }, idx: number) => {
    const angle = hashToFloat(baseHash + `-dwarf-${idx}`) * Math.PI * 2;
    bodies.push({
      id: `dwarf-${idx}`,
      type: 'dwarf',
      label: 'Dwarf',
      distanceAU: p.distanceAU,
      mass: p.mass,
      radiusPx: massToRadiusPx(p.mass, 'dwarf'),
      colour: BODY_COLOURS.dwarf.fill,
      strokeColour: BODY_COLOURS.dwarf.stroke,
      angle,
      periodDays: calculatePeriodDays(p.distanceAU),
      isMainWorld: false,
    });
  });

  // Terrestrial worlds
  system.terrestrialWorlds?.forEach((p: { distanceAU: number; mass: number }, idx: number) => {
    const angle = hashToFloat(baseHash + `-terrestrial-${idx}`) * Math.PI * 2;
    bodies.push({
      id: `terrestrial-${idx}`,
      type: 'terrestrial',
      label: 'Terrestrial',
      distanceAU: p.distanceAU,
      mass: p.mass,
      radiusPx: massToRadiusPx(p.mass, 'terrestrial'),
      colour: BODY_COLOURS.terrestrial.fill,
      strokeColour: BODY_COLOURS.terrestrial.stroke,
      angle,
      periodDays: calculatePeriodDays(p.distanceAU),
      isMainWorld: system.mainWorld?.type === 'Terrestrial' && system.mainWorld.distanceAU === p.distanceAU,
    });
  });

  // Ice worlds
  system.iceWorlds?.forEach((p: { distanceAU: number; mass: number }, idx: number) => {
    const angle = hashToFloat(baseHash + `-ice-${idx}`) * Math.PI * 2;
    bodies.push({
      id: `ice-${idx}`,
      type: 'ice',
      label: 'Ice',
      distanceAU: p.distanceAU,
      mass: p.mass,
      radiusPx: massToRadiusPx(p.mass, 'ice'),
      colour: BODY_COLOURS.ice.fill,
      strokeColour: BODY_COLOURS.ice.stroke,
      angle,
      periodDays: calculatePeriodDays(p.distanceAU),
      isMainWorld: system.mainWorld?.type === 'Ice World' && system.mainWorld.distanceAU === p.distanceAU,
    });
  });

  // Gas worlds
  system.gasWorlds?.forEach((p: { distanceAU: number; mass: number; gasClass: number }, idx: number) => {
    let type: BodyType = 'gas-i';
    switch (p.gasClass) {
      case 1: type = 'gas-i'; break;
      case 2: type = 'gas-ii'; break;
      case 3: type = 'gas-iii'; break;
      case 4: type = 'gas-iv'; break;
      case 5: type = 'gas-v'; break;
    }
    const angle = hashToFloat(baseHash + `-gas-${idx}`) * Math.PI * 2;
    bodies.push({
      id: `gas-${idx}`,
      type,
      label: `Gas ${p.gasClass === 4 ? 'IV/V' : toRoman(p.gasClass)}`,
      distanceAU: p.distanceAU,
      mass: p.mass,
      radiusPx: massToRadiusPx(p.mass, type),
      colour: BODY_COLOURS[type].fill,
      strokeColour: BODY_COLOURS[type].stroke,
      angle,
      periodDays: calculatePeriodDays(p.distanceAU),
      isMainWorld: false,
    });
  });

  // Main world — mark existing body or add explicitly (QA-035)
  // mainWorld is generated independently and is never in the body arrays,
  // so the fallback always needs to add it as a new body.
  if (system.mainWorld) {
    const mw = system.mainWorld;
    const existing = bodies.find(
      (b) =>
        b.distanceAU === mw.distanceAU &&
        (b.type === 'terrestrial' || b.type === 'ice' || b.type === 'dwarf')
    );
    if (existing) {
      existing.isMainWorld = true;
      existing.label = '★ MAIN';
      existing.strokeColour = '#FACC15';
    } else {
      const type: BodyType =
        mw.type === 'Dwarf' ? 'dwarf'
        : mw.type === 'Ice World' ? 'ice'
        : 'terrestrial';
      bodies.push({
        id: 'main-world',
        type,
        label: '★ MAIN',
        distanceAU: mw.distanceAU,
        mass: mw.massEM,
        radiusPx: massToRadiusPx(mw.massEM, type),
        colour: BODY_COLOURS[type].fill,
        strokeColour: '#FACC15',
        angle: hashToFloat(baseHash + '-main-world') * Math.PI * 2,
        periodDays: calculatePeriodDays(mw.distanceAU),
        isMainWorld: true,
      });
    }
  }

  return bodies;
}

function toRoman(n: number): string {
  const map: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
  return map[n] || String(n);
}

const DISK_COLOURS = ['#8B7355', '#A0522D', '#CD853F'];

function generateDiskPoints(seed: string): DiskPoint[] {
  const rng = mulberry32(seed);
  const count = 300 + Math.floor(rng() * 500); // 300–800 points
  const points: DiskPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      angle: rng() * Math.PI * 2,
      radiusOffset: (rng() - 0.5) * 0.08, // ±4% radial jitter (as fraction of orbit radius)
      opacity: 0.2 + rng() * 0.5,
      size: 0.8 + rng() * 0.9,
    });
  }
  return points;
}
