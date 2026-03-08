export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type DroneMode =
  | "idle"
  | "takeoff"
  | "searching"
  | "approach"
  | "aiming"
  | "firing"
  | "confirming"
  | "returning"
  | "landing"
  | "charging"
  | "complete";

export type TargetingMode = "search" | "preSurveyed";

export interface SimulationParameters {
  fieldLengthM: number;
  fieldWidthM: number;
  targetingMode: TargetingMode;
  edgeDensityPerHectare: number;
  gradientStrength: number;
  batteryCapacityWh: number;
  batteryCycleLife: number;
  batteryReplacementCostUsd: number;
  droneMassKg: number;
  cruiseSpeedMps: number;
  effectiveDragAreaM2: number;
  laserPowerW: number;
  engagementDwellS: number;
  maxFiringSpeedMps: number;
  reserveBatteryPct: number;
  rechargeTimeMin: number;
  rowSpacingM: number;
  searchAltitudeM: number;
  engageAltitudeM: number;
  detectionRadiusM: number;
  laneSpacingM: number;
  aimDurationS: number;
  confirmDurationS: number;
  maxHorizontalAccelMps2: number;
  maxVerticalSpeedMps: number;
  rotorDiskAreaM2: number;
  propulsionEfficiency: number;
  avionicsPowerW: number;
}

export interface EnergyBreakdown {
  flightWh: number;
  hoverWh: number;
  accelerationWh: number;
  laserWh: number;
  avionicsWh: number;
}

export interface TargetState {
  id: number;
  position: Vec3;
  rowIndex: number;
  alive: boolean;
  discovered: boolean;
  queued: boolean;
  detectionPulse: number;
  neutralizationPulse: number;
  engagementProgress: number;
  detectedAtS: number | null;
  neutralizedAtS: number | null;
}

export interface MissionLogEvent {
  timeS: number;
  mode: DroneMode;
  event:
    | "mission-start"
    | "route-planned"
    | "search-reset"
    | "mode-change"
    | "target-detected"
    | "target-selected"
    | "target-neutralized"
    | "queue-pruned"
    | "reserve-return"
    | "charging-start"
    | "charging-complete"
    | "stuck-warning"
    | "mission-complete";
  message: string;
  data?: Record<string, string | number | boolean | null>;
}

export interface MissionEngineOptions {
  enableDebugLogging?: boolean;
  maxLogEntries?: number;
  onLogEvent?: (entry: MissionLogEvent) => void;
  initialTargets?: TargetState[];
  initialBatteryWh?: number;
}

export interface MissionDebugState {
  queue: number[];
  modeTimerS: number;
  chargeTimerS: number;
  chargeDurationS: number;
  neutralizedCount: number;
  detectedCount: number;
}

export interface DroneTelemetry {
  position: Vec3;
  velocity: Vec3;
  acceleration: Vec3;
  headingRad: number;
  yawRateRadS: number;
  rollRad: number;
  pitchRad: number;
  instantaneousPowerW: number;
  batteryWh: number;
  batteryPct: number;
  mode: DroneMode;
  activeTargetId: number | null;
  activeWaypointIndex: number;
}

export interface MissionMetrics {
  missionElapsedS: number;
  totalEnergyWh: number;
  rechargeCycles: number;
  beetlesNeutralized: number;
  beetlesRemaining: number;
  averageTimePerTargetS: number;
  energyPerBeetleWh: number;
  batteryDepreciationCostUsd: number;
  costPerHectareUsd: number;
  equivalentFullCyclesUsed: number;
  energyFractions: {
    flight: number;
    hover: number;
    acceleration: number;
    laser: number;
    avionics: number;
  };
}

export interface MissionSummary {
  totalMissionTimeS: number;
  totalEnergyWh: number;
  rechargeCycles: number;
  beetlesNeutralized: number;
  averageTimePerTargetS: number;
  energyPerBeetleWh: number;
  batteryDepreciationCostUsd: number;
  costPerHectareUsd: number;
  equivalentFullCyclesUsed: number;
  energyBreakdown: EnergyBreakdown;
  energyFractions: MissionMetrics["energyFractions"];
}

export interface ChargeStatus {
  remainingS: number;
  totalS: number;
}

export interface SimulationSnapshot {
  params: SimulationParameters;
  drone: DroneTelemetry;
  targets: TargetState[];
  metrics: MissionMetrics;
  chargeStatus: ChargeStatus | null;
  summary: MissionSummary | null;
  seed: number;
  playbackSpeed: number;
  renderScaleMPerUnit: number;
  dockPosition: Vec3;
  pathHistory: Vec3[];
  sweepPath: Vec3[];
}
