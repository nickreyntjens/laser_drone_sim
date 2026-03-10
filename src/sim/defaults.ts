import { SimulationParameters } from "./types";

export const PLAYBACK_SPEED = 1;
export const PLAYBACK_SPEED_OPTIONS = [1, 2, 5.25, 10.5, 20, 40] as const;
export const RENDER_SCALE_M_PER_UNIT = 5;
export const DEFAULT_SEED = 17;

export const defaultParameters: SimulationParameters = {
  fieldLengthM: 400,
  fieldWidthM: 250,
  fieldType: "potatoColoradoBeetle",
  targetingMode: "preSurveyed",
  showOnlySelectedTargetMarkers: true,
  edgeDensityPerHectare: 400,
  gradientStrength: 9,
  farmersPerHectare: 2,
  safetyFocalDistanceM: 0.5,
  safetyStartingApertureMm: 10,
  batteryCapacityWh: 140,
  batteryCycleLife: 600,
  batteryReplacementCostUsd: 180,
  droneMassKg: 1,
  cruiseSpeedMps: 8,
  effectiveDragAreaM2: 0.025,
  laserPowerW: 50,
  engagementDwellS: 0.2,
  maxFiringSpeedMps: 0.3,
  reserveBatteryPct: 16,
  rechargeTimeMin: 6,
  rowSpacingM: 0.9,
  searchAltitudeM: 2.8,
  engageAltitudeM: 1.9,
  detectionRadiusM: 3.2,
  laneSpacingM: 5.4,
  aimDurationS: 0.42,
  confirmDurationS: 0.22,
  maxHorizontalAccelMps2: 3.4,
  maxVerticalSpeedMps: 2.1,
  rotorDiskAreaM2: 0.26,
  propulsionEfficiency: 0.74,
  avionicsPowerW: 24
};

export const MODE_LABELS: Record<string, string> = {
  idle: "Idle",
  takeoff: "Takeoff",
  searching: "Searching",
  approach: "Flying to target",
  aiming: "Aiming",
  firing: "Firing",
  confirming: "Confirming",
  returning: "Returning",
  landing: "Landing",
  charging: "Charging",
  complete: "Complete"
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}
