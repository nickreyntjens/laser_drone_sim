import { SimulationParameters } from "./types";

export const NOMINAL_SAFETY_WAVELENGTH_NM = 1550;
export const NOMINAL_SAFETY_BEAM_QUALITY_M2 = 2;
export const NOMINAL_SAFETY_THRESHOLD_J_PER_M2 = 10_000;

export interface SafetyModelInput {
  laserPowerW: number;
  engagementDwellS: number;
  safetyFocalDistanceM: number;
  safetyStartingApertureMm: number;
}

export interface SafetyModelMetrics {
  shotEnergyJ: number;
  focalDistanceM: number;
  startingApertureMm: number;
  startingApertureRadiusM: number;
  beamWaistRadiusM: number;
  rayleighRangeM: number;
  requiredSafeBeamRadiusM: number;
  focusToSafeDistanceM: number;
  nominalSafetyZoneRadiusM: number;
  centerlineEnergyDensityAtFocusJPerM2: number;
}

export interface EngagementOpticsWindow {
  idealEmitterTargetDistanceM: number;
  minEmitterTargetDistanceM: number;
  maxEmitterTargetDistanceM: number;
}

function clampPositive(value: number, floor: number): number {
  return Number.isFinite(value) ? Math.max(value, floor) : floor;
}

export function calculateSafetyMetrics(input: SafetyModelInput): SafetyModelMetrics {
  const shotEnergyJ = clampPositive(input.laserPowerW, 0) * clampPositive(input.engagementDwellS, 0);
  const focalDistanceM = clampPositive(input.safetyFocalDistanceM, 0.1);
  // The UI exposes aperture as beam diameter at the optics. The Gaussian-beam formula uses radius.
  const startingApertureRadiusM = clampPositive(input.safetyStartingApertureMm, 1) * 0.5 * 1e-3;
  const wavelengthM = NOMINAL_SAFETY_WAVELENGTH_NM * 1e-9;

  const beamWaistRadiusM =
    (NOMINAL_SAFETY_BEAM_QUALITY_M2 * wavelengthM * focalDistanceM) /
    (Math.PI * startingApertureRadiusM);
  const rayleighRangeM =
    (Math.PI * beamWaistRadiusM * beamWaistRadiusM) /
    (NOMINAL_SAFETY_BEAM_QUALITY_M2 * wavelengthM);
  const requiredSafeBeamRadiusM = Math.sqrt(
    Math.max((2 * shotEnergyJ) / (Math.PI * NOMINAL_SAFETY_THRESHOLD_J_PER_M2), 0)
  );
  const focusToSafeDistanceM =
    requiredSafeBeamRadiusM <= beamWaistRadiusM
      ? 0
      : rayleighRangeM *
        Math.sqrt(
          Math.max(
            Math.pow(requiredSafeBeamRadiusM / beamWaistRadiusM, 2) - 1,
            0
          )
        );

  return {
    shotEnergyJ,
    focalDistanceM,
    startingApertureMm: input.safetyStartingApertureMm,
    startingApertureRadiusM,
    beamWaistRadiusM,
    rayleighRangeM,
    requiredSafeBeamRadiusM,
    focusToSafeDistanceM,
    nominalSafetyZoneRadiusM: focalDistanceM + focusToSafeDistanceM,
    centerlineEnergyDensityAtFocusJPerM2:
      (2 * shotEnergyJ) / (Math.PI * beamWaistRadiusM * beamWaistRadiusM)
  };
}

export function calculateNominalSafetyZoneRadiusM(
  input: SafetyModelInput
): number {
  return calculateSafetyMetrics(input).nominalSafetyZoneRadiusM;
}

export function calculateBeamRadiusAtDistanceM(
  metrics: SafetyModelMetrics,
  distanceFromEmitterM: number
): number {
  const signedOffsetFromFocusM = distanceFromEmitterM - metrics.focalDistanceM;
  return (
    metrics.beamWaistRadiusM *
    Math.sqrt(
      1 + Math.pow(signedOffsetFromFocusM / Math.max(metrics.rayleighRangeM, 1e-9), 2)
    )
  );
}

export function calculateCenterlineEnergyDensityJPerM2(
  metrics: SafetyModelMetrics,
  distanceFromEmitterM: number
): number {
  const beamRadiusM = calculateBeamRadiusAtDistanceM(metrics, distanceFromEmitterM);
  return (2 * metrics.shotEnergyJ) / (Math.PI * beamRadiusM * beamRadiusM);
}

export function calculateEngagementOpticsWindow(
  metrics: SafetyModelMetrics
): EngagementOpticsWindow {
  return {
    idealEmitterTargetDistanceM: metrics.focalDistanceM,
    minEmitterTargetDistanceM: Math.max(0.05, metrics.focalDistanceM - metrics.rayleighRangeM),
    maxEmitterTargetDistanceM: metrics.focalDistanceM + metrics.rayleighRangeM
  };
}

export function calculateRelativeDwellFactorForDistance(
  metrics: SafetyModelMetrics,
  distanceFromEmitterM: number
): number {
  const beamRadiusM = calculateBeamRadiusAtDistanceM(metrics, distanceFromEmitterM);
  return Math.max(
    1,
    (beamRadiusM * beamRadiusM) /
      Math.max(metrics.beamWaistRadiusM * metrics.beamWaistRadiusM, 1e-12)
  );
}

export function safetyInputFromParameters(
  params: Pick<
    SimulationParameters,
    "laserPowerW" | "engagementDwellS" | "safetyFocalDistanceM" | "safetyStartingApertureMm"
  >
): SafetyModelInput {
  return {
    laserPowerW: params.laserPowerW,
    engagementDwellS: params.engagementDwellS,
    safetyFocalDistanceM: params.safetyFocalDistanceM,
    safetyStartingApertureMm: params.safetyStartingApertureMm
  };
}
