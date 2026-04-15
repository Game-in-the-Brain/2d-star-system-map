/**
 * Types for the 2D solar-system map.
 * These mirror the MWG StarSystem shape where needed.
 */

// Minimal StarSystem shape needed by the 2D map (mirrors MWG)
export interface StarSystem {
  key?: string;
  primaryStar: {
    class: string;
    grade: number;
    mass: number;
  };
  companionStars?: Array<{
    class: string;
    grade: number;
    mass: number;
    orbitDistance: number;
  }>;
  circumstellarDisks?: Array<{
    distanceAU: number;
    mass: number;
  }>;
  dwarfPlanets?: Array<{
    distanceAU: number;
    mass: number;
  }>;
  terrestrialWorlds?: Array<{
    distanceAU: number;
    mass: number;
  }>;
  iceWorlds?: Array<{
    distanceAU: number;
    mass: number;
  }>;
  gasWorlds?: Array<{
    distanceAU: number;
    mass: number;
    gasClass: number;
  }>;
  mainWorld?: {
    type: string;
    distanceAU: number;
    massEM: number;
  } | null;
}

export interface MapPayload {
  starSystem: StarSystem;
  starfieldSeed: string;
  epoch: {
    year: number;
    month: number;
    day: number;
  };
}

export interface Point {
  x: number;
  y: number;
}

export type BodyType =
  | 'star-primary'
  | 'star-companion'
  | 'disk'
  | 'dwarf'
  | 'terrestrial'
  | 'ice'
  | 'gas-i'
  | 'gas-ii'
  | 'gas-iii'
  | 'gas-iv'
  | 'gas-v';

export interface DiskPoint {
  angle: number; // radians offset from disk's orbital angle
  radiusOffset: number; // px offset from disk's orbital radius
  opacity: number;
  size: number;
}

export interface SceneBody {
  id: string;
  type: BodyType;
  label: string;
  distanceAU: number;
  mass: number;
  radiusPx: number;
  colour: string;
  strokeColour: string;
  angle: number; // radians
  periodDays: number;
  isMainWorld: boolean;
  orbitDelta?: number; // visual nudge if needed
  diskPoints?: DiskPoint[];
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface AppState {
  ctx: CanvasRenderingContext2D | null;
  canvas: HTMLCanvasElement | null;
  bodies: SceneBody[];
  camera: CameraState;
  isPlaying: boolean;
  isReversed: boolean;
  speed: number; // days per second
  simDayOffset: number; // days from epoch
  epochDate: Date;
  starfieldSeed: string;
  lastFrameTime: number;
  width: number;
  height: number;
}
