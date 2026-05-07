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
  /** FRD-067: barycenter view — only present for multi-star systems. */
  barycenterView?: {
    stars: Array<{
      starId: string;
      isPrimary: boolean;
      class: string;
      grade: number;
      mass: number;
      distanceAU: number;
      periodYears: number;
      eccentricity: number;
      inclinationDeg: number;
      angleRad: number;
    }>;
  };
  circumstellarDisks?: Array<{
    id?: string;
    distanceAU: number;
    mass: number;
    label?: string;
  }>;
  dwarfPlanets?: Array<{
    id?: string;
    distanceAU: number;
    mass: number;
    label?: string;
  }>;
  terrestrialWorlds?: Array<{
    id?: string;
    distanceAU: number;
    mass: number;
    label?: string;
  }>;
  iceWorlds?: Array<{
    id?: string;
    distanceAU: number;
    mass: number;
    label?: string;
  }>;
  gasWorlds?: Array<{
    id?: string;
    distanceAU: number;
    mass: number;
    gasClass: number | string;
    label?: string;
  }>;
  moons?: Array<{
    id?: string;
    distanceAU: number;
    mass: number;
    moonOrbitAU: number;
    parentId: string;
    type?: string;
    label?: string;
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
  /** FRD-062: hovered body for tooltip */
  hoveredBodyId: string | null;
  lastMouseX: number;
  lastMouseY: number;
  /** FRD-067: current map view mode */
  viewMode: 'planetary' | 'barycenter';
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
  failureReason?: string;
  hrsCostKms?: number;          // Escape velocity cost from HRS/SOI traversals
  totalCostKms?: number;        // escapeOrigin + captureDest + hrsCost
}

export interface TravelTimelineState {
  travelDayOffset: number;      // days into journey (0 = launch)
  isPlaying: boolean;
  isReversed: boolean;
  isLooping: boolean;
  playbackSpeed: number;        // days/sec multiplier
  pinnedDepartureDayOffset: number | null;
}

export interface TravelPlannerState {
  originId: string | null;
  destinationId: string | null;
  deltaVBudget: number;
  useSimDate: boolean;
  customDepartureDayOffset: number;
  lastPlan: TravelPlan | null;
  isActive: boolean;
  timeline: TravelTimelineState;

  // Travel model selection
  travelMode: 'delta-v' | 'hohmann';
  useGravityAssists: boolean;
  useMultiLegChains: boolean;  // FRD-063 §4: opt-in multi-leg gravity assist chains
  deadlineDays: number | null; // FRD-064: max transit time deadline

  // FRD-071: Cycler orbit (computed on demand, not persisted)
  cyclerOrbit: import('./cycler').CyclerOrbit | null;
}

// FRD-060 §30: SOI-Safe Routing
export interface TravelBody {
  id: string;
  label: string;
  distanceAU: number;
  angleRad: number;
  massEM: number;
  hillRadiusAU: number;
}

export type RoutingMode = 'direct' | 'soi-safe';

export interface TravelInput {
  origin: TravelBody;
  destination: TravelBody;
  accelG: number;
  routingMode: RoutingMode;
  departureOffsetDays: number;
}

export interface SoiHit {
  bodyId: string;
  bodyLabel: string;
  soiRadiusAU: number;
  chordAU: number;
  detourAddedAU: number;
}

export interface WaitResult {
  waitDays: number;
  pathDistanceAU: number;
  flightTimeDays: number;
  totalTimeDays: number;
  clearAtDeparture: boolean;
}

export interface TravelResult {
  routingMode: RoutingMode;
  departureOffsetDays: number;
  pathDistanceAU: number;
  flightTimeDays: number;
  totalTimeDays: number;
  soiIntersections: SoiHit[];
  detourAddedAU: number;
  waitAlternative: WaitResult | null;
}

// FRD-063: Gravity Assists
export interface GravityAssist {
  bodyId: string;
  bodyLabel: string;
  flybyDayOffset: number;
  flybyAltitudeKm: number;
  vInfinityKms: number;
  turningAngleDeg: number;
  deltaVKms: number;
  /** Total delta-V of the full assisted route (leg1 + leg2 departure/arrival burns). */
  routeDeltaVKms: number;
  isAccelerating: boolean;
  isValid: boolean;
  warning?: string;
  /** Physics-computed time for origin → assist (days). */
  leg1TimeDays: number;
  /** Physics-computed time for assist → destination (days). */
  leg2TimeDays: number;
}


