/**
 * Types for the 2D solar-system map.
 * These mirror the MWG StarSystem shape where needed.
 */

export interface ZoneBoundaries {
  infernal: { min: number; max: number };
  hot: { min: number; max: number };
  conservative: { min: number; max: number };
  cold: { min: number; max: number };
  outer: { min: number; max: number | null };
}

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
    id?: string;
    distanceAU: number;
    mass: number;
  }>;
  dwarfPlanets?: Array<{
    id?: string;
    distanceAU: number;
    mass: number;
  }>;
  terrestrialWorlds?: Array<{
    id?: string;
    distanceAU: number;
    mass: number;
  }>;
  iceWorlds?: Array<{
    id?: string;
    distanceAU: number;
    mass: number;
  }>;
  gasWorlds?: Array<{
    id?: string;
    distanceAU: number;
    mass: number;
    gasClass: number;
  }>;
  moons?: Array<{
    id?: string;
    distanceAU: number;
    mass: number;
    moonOrbitAU: number;
    parentId: string;
    type?: string;
  }>;
  rings?: Array<{
    id?: string;
    parentId: string;
  }>;
  mainWorld?: {
    type: string;
    distanceAU: number;
    massEM: number;
  } | null;
  zones?: ZoneBoundaries;
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
  | 'gas-v'
  | 'moon';

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
  angle: number; // radians at epoch (2300-01-01)
  periodDays: number;
  isMainWorld: boolean;
  orbitDelta?: number; // visual nudge if needed
  diskPoints?: DiskPoint[];
  // Moon / child fields
  parentId?: string;
  moonOrbitAU?: number;
  velocityKms?: number;
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
  zones?: ZoneBoundaries;
  /** GM notes for this system (FRD-046) */
  gmNotes?: string;
  /** Travel planner state (FRD-048) */
  travelPlanner?: TravelPlannerState;
}

// FRD-046: Saved star page format
export interface SavedStarPage {
  starId: string;
  starName: string;
  savedAt: string;
  payload: MapPayload;
  mwgSystem?: StarSystem;
  gmNotes: string;
  version: string;
}

// FRD-048: Travel Planner
export interface TravelPlan {
  originId: string;
  destinationId: string;
  departureDayOffset: number;
  deltaVBudgetKms: number;
  escapeOriginKms: number;
  captureDestKms: number;
  excessDeltaVKms: number;
  optimisticArrivalDays: number;
  pessimisticArrivalDays: number;
  synodicPeriodDays: number;
  nextWindowDayOffset: number;
  isPossible: boolean;
  minDistanceAU: number;
  maxDistanceAU: number;
  failureReason: string | null;
}

export interface TravelPlannerState {
  originId: string | null;
  destinationId: string | null;
  deltaVBudget: number;
  useSimDate: boolean;
  customDepartureDayOffset: number;
  lastPlan: TravelPlan | null;
  isActive: boolean;
}
