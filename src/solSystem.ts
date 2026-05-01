/**
 * Sol System — Default demonstrator
 * Accurate real-world data for showcasing all map features:
 *   gravity assists, Roche limits, multi-leg chains, travel planner,
 *   SOI routing, moons, dwarf worlds, zone bands.
 */

import type { StarSystem, MapPayload } from './types';

export const solStarSystem: StarSystem = {
  key: 'sol',
  primaryStar: {
    class: 'G',
    grade: 2,
    mass: 1.0,
  },
  terrestrialWorlds: [
    { id: 'mercury', distanceAU: 0.387, mass: 0.055 },
    { id: 'venus',   distanceAU: 0.723, mass: 0.815 },
    { id: 'earth',   distanceAU: 1.000, mass: 1.000 },
    { id: 'mars',    distanceAU: 1.524, mass: 0.107 },
  ],
  dwarfPlanets: [
    { id: 'ceres',    distanceAU: 2.77,  mass: 0.00016 },
    { id: 'pluto',    distanceAU: 39.48, mass: 0.00218 },
    { id: 'eris',     distanceAU: 67.78, mass: 0.0028  },
    { id: 'haumea',   distanceAU: 43.13, mass: 0.0007  },
    { id: 'makemake', distanceAU: 45.79, mass: 0.0005  },
  ],
  gasWorlds: [
    { id: 'jupiter', distanceAU: 5.204, mass: 317.8, gasClass: 'V' },
    { id: 'saturn',  distanceAU: 9.583, mass: 95.2,  gasClass: 'IV' },
  ],
  iceWorlds: [
    { id: 'uranus',  distanceAU: 19.22, mass: 14.5 },
    { id: 'neptune', distanceAU: 30.05, mass: 17.1 },
  ],
  moons: [
    // Earth
    { id: 'luna',    parentId: 'earth',    moonOrbitAU: 0.00257, mass: 0.01230,  distanceAU: 1.000 },
    // Mars
    { id: 'phobos',  parentId: 'mars',     moonOrbitAU: 0.0000626, mass: 1.07e-8, distanceAU: 1.524 },
    { id: 'deimos',  parentId: 'mars',     moonOrbitAU: 0.000234,  mass: 1.80e-9, distanceAU: 1.524 },
    // Jupiter — Galilean + inner
    { id: 'io',       parentId: 'jupiter', moonOrbitAU: 0.00282, mass: 0.0150,  distanceAU: 5.204 },
    { id: 'europa',   parentId: 'jupiter', moonOrbitAU: 0.00449, mass: 0.00803, distanceAU: 5.204 },
    { id: 'ganymede', parentId: 'jupiter', moonOrbitAU: 0.00715, mass: 0.0248,  distanceAU: 5.204 },
    { id: 'callisto', parentId: 'jupiter', moonOrbitAU: 0.0126,  mass: 0.0180,  distanceAU: 5.204 },
    // Saturn
    { id: 'mimas',    parentId: 'saturn',  moonOrbitAU: 0.00124, mass: 3.75e-6, distanceAU: 9.583 },
    { id: 'enceladus',parentId: 'saturn',  moonOrbitAU: 0.00159, mass: 1.08e-4, distanceAU: 9.583 },
    { id: 'tethys',   parentId: 'saturn',  moonOrbitAU: 0.00197, mass: 5.25e-5, distanceAU: 9.583 },
    { id: 'dione',    parentId: 'saturn',  moonOrbitAU: 0.00252, mass: 8.40e-5, distanceAU: 9.583 },
    { id: 'rhea',     parentId: 'saturn',  moonOrbitAU: 0.00352, mass: 2.31e-4, distanceAU: 9.583 },
    { id: 'titan',    parentId: 'saturn',  moonOrbitAU: 0.00817, mass: 0.0225,  distanceAU: 9.583 },
    { id: 'iapetus',  parentId: 'saturn',  moonOrbitAU: 0.0238,  mass: 2.28e-4, distanceAU: 9.583 },
    // Uranus
    { id: 'miranda',  parentId: 'uranus',  moonOrbitAU: 0.00086, mass: 5.90e-5, distanceAU: 19.22 },
    { id: 'ariel',    parentId: 'uranus',  moonOrbitAU: 0.00128, mass: 1.35e-4, distanceAU: 19.22 },
    { id: 'umbriel',  parentId: 'uranus',  moonOrbitAU: 0.00178, mass: 1.17e-4, distanceAU: 19.22 },
    { id: 'titania',  parentId: 'uranus',  moonOrbitAU: 0.00291, mass: 3.42e-4, distanceAU: 19.22 },
    { id: 'oberon',   parentId: 'uranus',  moonOrbitAU: 0.00390, mass: 2.88e-4, distanceAU: 19.22 },
    // Neptune
    { id: 'triton',   parentId: 'neptune', moonOrbitAU: 0.00237, mass: 0.00358, distanceAU: 30.05 },
    // Pluto
    { id: 'charon',   parentId: 'pluto',   moonOrbitAU: 0.000119,mass: 0.00250, distanceAU: 39.48 },
  ],
  rings: [
    { id: 'jupiter-ring', parentId: 'jupiter' },
    { id: 'saturn-ring',  parentId: 'saturn' },
    { id: 'uranus-ring',  parentId: 'uranus' },
    { id: 'neptune-ring', parentId: 'neptune' },
  ],
  mainWorld: {
    type: 'Terrestrial',
    distanceAU: 1.0,
    massEM: 1.0,
  },
  zones: {
    infernal:     { min: 0,    max: 0.4  },
    hot:          { min: 0.4,  max: 0.8  },
    conservative: { min: 0.8,  max: 1.5  },
    cold:         { min: 1.5,  max: 5.0  },
    outer:        { min: 5.0,  max: null },
  },
};

export const solPayload: MapPayload = {
  starSystem: solStarSystem,
  starfieldSeed: 'sol-demo-001',
  epoch: {
    year: 2300,
    month: 1,
    day: 1,
  },
};
