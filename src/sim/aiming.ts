import { clamp } from "./defaults";

export type AimingCommandGeneratorMode =
  | "direct"
  | "pi"
  | "integral"
  | "frequency_phase"
  | "dmd_sliding_window";

export interface AimingLabParameters {
  durationS: number;
  timeStepS: number;
  cameraFps: number;
  exposureTimeMs: number;
  cameraFovMrad: number;
  laserPowerW: number;
  laserSpotDiameterMm: number;
  processingLatencyMs: number;
  driverLatencyMs: number;
  memsNaturalFrequencyHz: number;
  memsDampingRatio: number;
  memsMaxAngleMrad: number;
  pidKp: number;
  pidKi: number;
  pidKd: number;
  integralLimitMrad: number;
  derivativeFilterHz: number;
  commandGeneratorMode: AimingCommandGeneratorMode;
  predictorLeadMs: number;
  centroidVelocityGain: number;
  imuFeedforwardGain: number;
  imuLowPassHz: number;
  imuRateLeadGain: number;
  phasePredictorBaseFrequencyHz: number;
  dmdWindowSize: number;
  dmdCommandPeriodMs: number;
  pixelNoisePx: number;
  gimbalSuppressionPct: number;
  dampingSuppressionPct: number;
  lowFrequencyDisturbanceMrad: number;
  lowFrequencyHz: number;
  highFrequencyDisturbanceMrad: number;
  highFrequencyHz: number;
  targetStepMrad: number;
  targetStepTimeS: number;
  targetSwayMrad: number;
  targetSwayHz: number;
  targetBiasXMrad: number;
  targetBiasYMrad: number;
  mirrorPitchBiasMrad: number;
  mirrorRollBiasMrad: number;
  lockThresholdMrad: number;
  targetMassMg: number;
  targetSpecificHeatJPerKgC: number;
  targetHeatLossWPerC: number;
  targetLethalTemperatureC: number;
  targetAbsorptivityPct: number;
  laserEngageCoveragePct: number;
}

export interface AimingSample {
  timeS: number;
  shutterOpen: boolean;
  exposureCentroidMrad: number;
  exposureSmearMrad: number;
  lastKnownTargetMrad: number;
  lowFrequencyDisturbanceMrad: number;
  highFrequencyDisturbanceMrad: number;
  residualPlatformMotionMrad: number;
  targetMotionMrad: number;
  opticalTargetAngleMrad: number;
  opticalTargetAngleYMrad: number;
  measuredErrorMrad: number;
  measuredErrorYMrad: number;
  mirrorAngleMrad: number;
  mirrorRollMrad: number;
  mirrorCommandMrad: number;
  mirrorCommandRollMrad: number;
  commandGeneratorPitchMrad: number;
  commandGeneratorRollMrad: number;
  pointingErrorMrad: number;
  pointingErrorYMrad: number;
  filteredImuPitchMrad: number;
  filteredImuRollMrad: number;
  sensorXMm: number;
  sensorYMm: number;
  laserOn: boolean;
  targetInSpot: boolean;
  spotCoveragePct: number;
  absorbedPowerW: number;
  heatLossW: number;
  targetTemperatureC: number;
  shotsPerSecond: number;
}

export interface AimingMetrics {
  rmsPointingErrorMrad: number;
  peakPointingErrorMrad: number;
  lockFractionPct: number;
  settlingTimeMs: number | null;
  measuredLatencyMs: number;
}

export interface AimingSimulationResult {
  samples: AimingSample[];
  metrics: AimingMetrics;
  playbackCycles: AimingPlaybackCycle[];
}

export type AimingPlaybackPhase = "open" | "close" | "centroid" | "command" | "delay";

export interface AimingHistoryPoint {
  timeS: number;
  targetX: number;
  targetY: number;
  commandPitch: number;
  commandRoll: number;
  mirrorPitch: number;
  mirrorRoll: number;
  spotCoveragePct: number;
  laserOn: number;
  targetTemperatureC: number;
  shotsPerSecond: number;
}

export interface AimingCaptureSnapshot {
  id: number;
  cycle: AimingPlaybackCycle;
  showCentroid: boolean;
  isIncoming: boolean;
}

export interface AimingLiveSnapshot {
  simTimeS: number;
  currentSample: AimingSample;
  metrics: AimingMetrics;
  recentHistory: AimingHistoryPoint[];
  captures: AimingCaptureSnapshot[];
  phase: AimingPlaybackPhase;
  commandFeedActive: boolean;
  flashActive: boolean;
  shotFlashActive: boolean;
}

export interface AimingPlaybackCycle {
  exposureStartTimeS: number;
  exposureEndTimeS: number;
  measurementTimeS: number;
  commandTimeS: number;
  settleEndTimeS: number;
  actualPointingStartMrad: number;
  actualPointingEndMrad: number;
  actualPointingCentroidMrad: number;
  actualPointingCentroidYMrad: number;
  measuredPointingErrorMrad: number;
  measuredPointingErrorYMrad: number;
  smearWidthMrad: number;
  opticalTargetAngleMrad: number;
  opticalTargetAngleYMrad: number;
  mirrorAngleBeforeMrad: number;
  mirrorAngleAfterMrad: number;
  mirrorCommandMrad: number;
  mirrorCommandRollMrad: number;
  exposurePathPoints: Array<{ xMrad: number; yMrad: number }>;
}

export interface AimingDiagramVector {
  x: number;
  y: number;
  z: number;
}

export interface AimingDiagramState {
  cameraPosition: AimingDiagramVector;
  mirrorPosition: AimingDiagramVector;
  targetPosition: AimingDiagramVector;
  virtualTargetPoint: AimingDiagramVector;
  reflectedRayEnd: AimingDiagramVector;
  desiredRayEnd: AimingDiagramVector;
  mirrorYawRadVisual: number;
  lensCenter: AimingDiagramVector;
  sensorCenter: AimingDiagramVector;
  actualSensorPoint: AimingDiagramVector;
  measuredSensorPoint: AimingDiagramVector;
  imageSideFocalPoint: AimingDiagramVector;
  lensParallelPoint: AimingDiagramVector;
  chiefRayPoints: AimingDiagramVector[];
  focalRayPoints: AimingDiagramVector[];
  objectDistanceM: number;
  imageDistanceM: number;
  focalLengthSceneM: number;
  mirrorLineAngleRad: number;
  mirrorVisualTiltRad: number;
}

interface TimedMeasurement {
  releaseTimeS: number;
  valueXMrad: number;
  valueYMrad: number;
  mirrorPitchMrad: number;
  mirrorRollMrad: number;
  cycleIndex: number;
}

interface TimedCommand {
  releaseTimeS: number;
  valuePitchMrad: number;
  valueRollMrad: number;
  cycleIndex: number;
}

interface PredictiveControllerState {
  hasMeasurement: boolean;
  lastMeasurementTimeS: number;
  measuredOpticalPitchMrad: number;
  measuredOpticalRollMrad: number;
  estimatedOpticalPitchRateMradPerS: number;
  estimatedOpticalRollRateMradPerS: number;
  filteredImuPitchMrad: number;
  filteredImuRollMrad: number;
  filteredImuPitchRateMradPerS: number;
  filteredImuRollRateMradPerS: number;
  imuPitchAtMeasurementMrad: number;
  imuRollAtMeasurementMrad: number;
  commandBiasPitchMrad: number;
  commandBiasRollMrad: number;
  previousPredictedErrorPitchMrad: number;
  previousPredictedErrorRollMrad: number;
  filteredDerivativePitchMradPerS: number;
  filteredDerivativeRollMradPerS: number;
  generatorCommandPitchMrad: number;
  generatorCommandRollMrad: number;
  measurementWindow: Array<{ timeS: number; pitchMrad: number; rollMrad: number }>;
  lastGeneratorIssueTimeS: number;
}

interface PredictiveCommandOutput {
  pitchMrad: number;
  rollMrad: number;
}

interface LaserThermalState {
  coverageRatio: number;
  laserOn: boolean;
  targetTemperatureC: number;
  shotTimestampsS: number[];
  lastShotTimeS: number;
}

interface LaserThermalUpdate {
  coverageRatio: number;
  laserOn: boolean;
  targetInSpot: boolean;
  absorbedPowerW: number;
  heatLossW: number;
  targetTemperatureC: number;
  shotsPerSecond: number;
  sensorXMm: number;
  sensorYMm: number;
  lastShotTimeS: number;
}

export const AIMING_SENSOR_WIDTH_MM = 6.4;
export const AIMING_SENSOR_HEIGHT_MM = 3.6;

const TARGET_DIAMETER_MM = 0.28;
const AMBIENT_TEMPERATURE_C = 22;
const COVERAGE_TIME_CONSTANT_S = 0.04;
const LASER_ENGAGE_TREND_PER_S = 0;
const LASER_HOLD_TREND_PER_S = -4;
const SHOT_RATE_WINDOW_S = 1;
const SHOT_RESET_HOLDOFF_S = 0.015;
const SHOT_FLASH_DURATION_S = 0.08;
// These mirror states are modeled as optical steering angles after reflection,
// not raw mechanical mirror tilt, so the control loop sees a 1:1 optical gain.
const MEMS_REFLECTION_GAIN = 1;

function normalize3(vector: AimingDiagramVector): AimingDiagramVector {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length < 1e-9) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

function add3(a: AimingDiagramVector, b: AimingDiagramVector): AimingDiagramVector {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract3(a: AimingDiagramVector, b: AimingDiagramVector): AimingDiagramVector {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale3(vector: AimingDiagramVector, scalar: number): AimingDiagramVector {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

function dot3(a: AimingDiagramVector, b: AimingDiagramVector): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function rotateAroundY(vector: AimingDiagramVector, angleRad: number): AimingDiagramVector {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: vector.x * cos + vector.z * sin,
    y: vector.y,
    z: -vector.x * sin + vector.z * cos
  };
}

function reflect3(incoming: AimingDiagramVector, normal: AimingDiagramVector): AimingDiagramVector {
  const gain = 2 * dot3(incoming, normal);
  return subtract3(incoming, scale3(normal, gain));
}

function reflectPointAcrossPlane(
  point: AimingDiagramVector,
  planePoint: AimingDiagramVector,
  planeNormal: AimingDiagramVector
): AimingDiagramVector {
  const distanceToPlane = dot3(subtract3(point, planePoint), planeNormal);
  return subtract3(point, scale3(planeNormal, distanceToPlane * 2));
}

function cross2(a: AimingDiagramVector, b: AimingDiagramVector): number {
  return a.x * b.z - a.z * b.x;
}

function lineDirection(angleRad: number): AimingDiagramVector {
  return { x: Math.cos(angleRad), y: 0, z: Math.sin(angleRad) };
}

function lineNormal(angleRad: number): AimingDiagramVector {
  return { x: -Math.sin(angleRad), y: 0, z: Math.cos(angleRad) };
}

function reflectPointAcrossLine(
  point: AimingDiagramVector,
  linePoint: AimingDiagramVector,
  angleRad: number
): AimingDiagramVector {
  return reflectPointAcrossPlane(point, linePoint, normalize3(lineNormal(angleRad)));
}

function intersectLineWithLine(
  lineAStart: AimingDiagramVector,
  lineAEnd: AimingDiagramVector,
  lineBPoint: AimingDiagramVector,
  lineBAngleRad: number
): AimingDiagramVector {
  const p = lineAStart;
  const r = subtract3(lineAEnd, lineAStart);
  const q = lineBPoint;
  const s = lineDirection(lineBAngleRad);
  const denominator = cross2(r, s);
  if (Math.abs(denominator) < 1e-8) {
    return lineBPoint;
  }
  const t = cross2(subtract3(q, p), s) / denominator;
  return add3(p, scale3(r, t));
}

export const defaultAimingLabParameters: AimingLabParameters = {
  durationS: 4,
  timeStepS: 0.0005,
  cameraFps: 400,
  exposureTimeMs: 1.1,
  cameraFovMrad: 3.2,
  laserPowerW: 10,
  laserSpotDiameterMm: 0.45,
  processingLatencyMs: 2.3,
  driverLatencyMs: 0.35,
  memsNaturalFrequencyHz: 950,
  memsDampingRatio: 0.62,
  memsMaxAngleMrad: 2.5,
  pidKp: 0.72,
  pidKi: 18,
  pidKd: 0.0005,
  integralLimitMrad: 1.4,
  derivativeFilterHz: 60,
  commandGeneratorMode: "integral",
  predictorLeadMs: 1.5,
  centroidVelocityGain: 0.4,
  imuFeedforwardGain: 1.2,
  imuLowPassHz: 18,
  imuRateLeadGain: 0.2,
  phasePredictorBaseFrequencyHz: 7,
  dmdWindowSize: 10,
  dmdCommandPeriodMs: 1,
  pixelNoisePx: 0.18,
  gimbalSuppressionPct: 88,
  dampingSuppressionPct: 72,
  lowFrequencyDisturbanceMrad: 0.55,
  lowFrequencyHz: 7,
  highFrequencyDisturbanceMrad: 0.16,
  highFrequencyHz: 85,
  targetStepMrad: 0.7,
  targetStepTimeS: 0.8,
  targetSwayMrad: 0.08,
  targetSwayHz: 1.4,
  targetBiasXMrad: 0,
  targetBiasYMrad: 0,
  mirrorPitchBiasMrad: 0,
  mirrorRollBiasMrad: 0,
  lockThresholdMrad: 0.08,
  targetMassMg: 8,
  targetSpecificHeatJPerKgC: 3600,
  targetHeatLossWPerC: 0.04,
  targetLethalTemperatureC: 52,
  targetAbsorptivityPct: 80,
  laserEngageCoveragePct: 62
};

function mmPerMrad(cameraFovMrad: number): number {
  return AIMING_SENSOR_WIDTH_MM / Math.max(cameraFovMrad, 0.1);
}

function suppressionResidualGain(suppressionPct: number): number {
  return 1 - clamp(suppressionPct / 100, 0, 1);
}

function opticalFromMirrorAngle(mirrorAngleMrad: number): number {
  return mirrorAngleMrad * MEMS_REFLECTION_GAIN;
}

function mirrorAngleForOpticalTarget(opticalTargetMrad: number): number {
  return opticalTargetMrad / MEMS_REFLECTION_GAIN;
}

function circleOverlapArea(radiusA: number, radiusB: number, centerDistance: number): number {
  if (radiusA <= 0 || radiusB <= 0) {
    return 0;
  }
  if (centerDistance >= radiusA + radiusB) {
    return 0;
  }
  if (centerDistance <= Math.abs(radiusA - radiusB)) {
    const innerRadius = Math.min(radiusA, radiusB);
    return Math.PI * innerRadius * innerRadius;
  }

  const radiusASq = radiusA * radiusA;
  const radiusBSq = radiusB * radiusB;
  const alpha = 2 * Math.acos(clamp((centerDistance * centerDistance + radiusASq - radiusBSq) / (2 * centerDistance * radiusA), -1, 1));
  const beta = 2 * Math.acos(clamp((centerDistance * centerDistance + radiusBSq - radiusASq) / (2 * centerDistance * radiusB), -1, 1));

  return (
    0.5 * radiusASq * (alpha - Math.sin(alpha)) +
    0.5 * radiusBSq * (beta - Math.sin(beta))
  );
}

function updateLaserThermalState(
  params: AimingLabParameters,
  state: LaserThermalState,
  pointingErrorMrad: number,
  pointingErrorYMrad: number,
  dtS: number,
  timeS: number
): LaserThermalUpdate {
  const sensorScaleMmPerMrad = mmPerMrad(params.cameraFovMrad);
  const sensorXMm = pointingErrorMrad * sensorScaleMmPerMrad;
  const sensorYMm = pointingErrorYMrad * sensorScaleMmPerMrad;
  const distanceMm = Math.hypot(sensorXMm, sensorYMm);
  const laserRadiusMm = Math.max(params.laserSpotDiameterMm * 0.5, 1e-6);
  const targetRadiusMm = TARGET_DIAMETER_MM * 0.5;
  const targetInSpot = distanceMm <= laserRadiusMm;
  const nextCoverageRatio = clamp(
    state.coverageRatio +
      (((targetInSpot ? 1 : 0) - state.coverageRatio) * dtS) / Math.max(COVERAGE_TIME_CONSTANT_S, 1e-6),
    0,
    1
  );
  const coverageTrendPerS = (nextCoverageRatio - state.coverageRatio) / Math.max(dtS, 1e-6);

  const engageCoverageRatio = clamp(params.laserEngageCoveragePct / 100, 0.01, 0.99);
  const holdCoverageRatio = Math.max(0.02, engageCoverageRatio * 0.6);
  let laserOn = state.laserOn;
  if (laserOn) {
    laserOn = nextCoverageRatio >= holdCoverageRatio || coverageTrendPerS >= LASER_HOLD_TREND_PER_S;
  } else {
    laserOn = nextCoverageRatio >= engageCoverageRatio && coverageTrendPerS >= LASER_ENGAGE_TREND_PER_S;
  }

  const spotAreaMm2 = Math.PI * laserRadiusMm * laserRadiusMm;
  const overlapAreaMm2 = circleOverlapArea(laserRadiusMm, targetRadiusMm, distanceMm);
  const capturedFraction = spotAreaMm2 > 0 ? overlapAreaMm2 / spotAreaMm2 : 0;
  const heatCapacityJPerC =
    Math.max(params.targetMassMg, 0.1) * 1e-6 * Math.max(params.targetSpecificHeatJPerKgC, 100);
  const absorbedPowerW =
    laserOn ? params.laserPowerW * capturedFraction * clamp(params.targetAbsorptivityPct / 100, 0, 1) : 0;
  const heatLossW = Math.max(0, (state.targetTemperatureC - AMBIENT_TEMPERATURE_C) * params.targetHeatLossWPerC);
  let targetTemperatureC =
    state.targetTemperatureC +
    ((absorbedPowerW - heatLossW) / Math.max(heatCapacityJPerC, 1e-6)) * dtS;

  if (targetTemperatureC >= params.targetLethalTemperatureC && timeS >= state.lastShotTimeS + SHOT_RESET_HOLDOFF_S) {
    state.shotTimestampsS.push(timeS);
    state.lastShotTimeS = timeS;
    targetTemperatureC = AMBIENT_TEMPERATURE_C;
    laserOn = false;
  }

  while (state.shotTimestampsS.length > 0 && state.shotTimestampsS[0] < timeS - SHOT_RATE_WINDOW_S) {
    state.shotTimestampsS.shift();
  }

  return {
    coverageRatio: nextCoverageRatio,
    laserOn,
    targetInSpot,
    absorbedPowerW,
    heatLossW,
    targetTemperatureC,
    shotsPerSecond: state.shotTimestampsS.length / SHOT_RATE_WINDOW_S,
    sensorXMm,
    sensorYMm,
    lastShotTimeS: state.lastShotTimeS
  };
}

export function computeAimingDiagramState(
  sample: AimingSample,
  options?: { mirrorVisualExaggeration?: number }
): AimingDiagramState {
  const lensCenter = { x: 0, y: 0.35, z: 0 };
  const mirrorPosition = { x: -0.82, y: 0.35, z: 0 };
  const focalLengthSceneM = 0.42;
  const objectDistanceM = 2.3;
  const imageDistanceM = 1 / (1 / focalLengthSceneM - 1 / objectDistanceM);
  const opticalAngleRad = sample.opticalTargetAngleMrad / 1000;
  const measuredAngleRad = sample.measuredErrorMrad / 1000;
  const virtualTargetZ = Math.tan(opticalAngleRad) * objectDistanceM;
  const actualSensorZ = -imageDistanceM * (virtualTargetZ / objectDistanceM);
  const measuredSensorZ = -imageDistanceM * Math.tan(measuredAngleRad);
  const imageSideFocalPoint = { x: focalLengthSceneM, y: 0.35, z: 0 };
  const sensorCenter = { x: imageDistanceM, y: 0.35, z: 0 };
  const actualSensorPoint = { x: imageDistanceM, y: 0.35, z: actualSensorZ };
  const measuredSensorPoint = { x: imageDistanceM, y: 0.35, z: measuredSensorZ };
  const virtualTargetPoint = { x: -objectDistanceM, y: 0.35, z: virtualTargetZ };
  const mirrorVisualExaggeration = options?.mirrorVisualExaggeration ?? 220;
  const mirrorYawRadVisual = sample.mirrorAngleMrad / 1000;
  const mirrorVisualTiltRad = mirrorYawRadVisual * mirrorVisualExaggeration;
  const mirrorLineAngleRad = Math.PI * 0.43 + mirrorVisualTiltRad;
  const chiefMirrorHit = intersectLineWithLine(actualSensorPoint, lensCenter, mirrorPosition, mirrorLineAngleRad);
  const lensParallelPoint = intersectLineWithLine(
    actualSensorPoint,
    imageSideFocalPoint,
    lensCenter,
    Math.PI / 2
  );
  const focalMirrorHit = intersectLineWithLine(
    lensParallelPoint,
    { x: virtualTargetPoint.x, y: 0.35, z: lensParallelPoint.z },
    mirrorPosition,
    mirrorLineAngleRad
  );
  const targetPosition = reflectPointAcrossLine(virtualTargetPoint, mirrorPosition, mirrorLineAngleRad);
  const reflectedDirection = normalize3(subtract3(targetPosition, chiefMirrorHit));
  const desiredDirection = normalize3(subtract3(targetPosition, focalMirrorHit));
  const chiefRayPoints = [actualSensorPoint, lensCenter, chiefMirrorHit, targetPosition];
  const focalRayPoints = [actualSensorPoint, imageSideFocalPoint, lensParallelPoint, focalMirrorHit, targetPosition];

  return {
    cameraPosition: { x: -2.55, y: 0.35, z: -1.35 },
    mirrorPosition,
    targetPosition,
    virtualTargetPoint,
    reflectedRayEnd: add3(chiefMirrorHit, scale3(reflectedDirection, 2.6)),
    desiredRayEnd: add3(focalMirrorHit, scale3(desiredDirection, 2.4)),
    mirrorYawRadVisual,
    lensCenter,
    sensorCenter,
    actualSensorPoint,
    measuredSensorPoint,
    imageSideFocalPoint,
    lensParallelPoint,
    chiefRayPoints,
    focalRayPoints,
    objectDistanceM,
    imageDistanceM,
    focalLengthSceneM,
    mirrorLineAngleRad,
    mirrorVisualTiltRad
  };
}

function noiseSignal(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function lowPassStep(current: number, target: number, cutoffHz: number, dtS: number): number {
  const safeCutoffHz = Math.max(cutoffHz, 0.01);
  const alpha = 1 - Math.exp(-2 * Math.PI * safeCutoffHz * Math.max(dtS, 1e-6));
  return current + (target - current) * clamp(alpha, 0, 1);
}

function createPredictiveControllerState(): PredictiveControllerState {
  return {
    hasMeasurement: false,
    lastMeasurementTimeS: 0,
    measuredOpticalPitchMrad: 0,
    measuredOpticalRollMrad: 0,
    estimatedOpticalPitchRateMradPerS: 0,
    estimatedOpticalRollRateMradPerS: 0,
    filteredImuPitchMrad: 0,
    filteredImuRollMrad: 0,
    filteredImuPitchRateMradPerS: 0,
    filteredImuRollRateMradPerS: 0,
    imuPitchAtMeasurementMrad: 0,
    imuRollAtMeasurementMrad: 0,
    commandBiasPitchMrad: 0,
    commandBiasRollMrad: 0,
    previousPredictedErrorPitchMrad: 0,
    previousPredictedErrorRollMrad: 0,
    filteredDerivativePitchMradPerS: 0,
    filteredDerivativeRollMradPerS: 0,
    generatorCommandPitchMrad: 0,
    generatorCommandRollMrad: 0,
    measurementWindow: [],
    lastGeneratorIssueTimeS: -Infinity
  };
}

function updateImuFilters(
  state: PredictiveControllerState,
  params: AimingLabParameters,
  rawPitchMrad: number,
  rawRollMrad: number,
  dtS: number
): void {
  const previousPitch = state.filteredImuPitchMrad;
  const previousRoll = state.filteredImuRollMrad;

  state.filteredImuPitchMrad = lowPassStep(previousPitch, rawPitchMrad, params.imuLowPassHz, dtS);
  state.filteredImuRollMrad = lowPassStep(previousRoll, rawRollMrad, params.imuLowPassHz, dtS);

  const rawPitchRate = (state.filteredImuPitchMrad - previousPitch) / Math.max(dtS, 1e-6);
  const rawRollRate = (state.filteredImuRollMrad - previousRoll) / Math.max(dtS, 1e-6);
  const rateCutoffHz = Math.max(params.imuLowPassHz * 0.65, 1);
  state.filteredImuPitchRateMradPerS = lowPassStep(
    state.filteredImuPitchRateMradPerS,
    rawPitchRate,
    rateCutoffHz,
    dtS
  );
  state.filteredImuRollRateMradPerS = lowPassStep(
    state.filteredImuRollRateMradPerS,
    rawRollRate,
    rateCutoffHz,
    dtS
  );
}

function applyMeasurementToPredictor(
  state: PredictiveControllerState,
  params: AimingLabParameters,
  measurement: TimedMeasurement,
  measurementReleaseTimeS: number
): void {
  const measuredOpticalPitchMrad =
    measurement.valueXMrad + opticalFromMirrorAngle(measurement.mirrorPitchMrad);
  const measuredOpticalRollMrad =
    measurement.valueYMrad + opticalFromMirrorAngle(measurement.mirrorRollMrad);

  if (state.hasMeasurement) {
    const measurementDtS = Math.max(measurementReleaseTimeS - state.lastMeasurementTimeS, 1e-6);
    const rawPitchRate =
      (measuredOpticalPitchMrad - state.measuredOpticalPitchMrad) / measurementDtS;
    const rawRollRate =
      (measuredOpticalRollMrad - state.measuredOpticalRollMrad) / measurementDtS;
    const opticalRateCutoffHz = Math.max(params.cameraFps * 0.12, 2);
    state.estimatedOpticalPitchRateMradPerS = lowPassStep(
      state.estimatedOpticalPitchRateMradPerS,
      rawPitchRate,
      opticalRateCutoffHz,
      measurementDtS
    );
    state.estimatedOpticalRollRateMradPerS = lowPassStep(
      state.estimatedOpticalRollRateMradPerS,
      rawRollRate,
      opticalRateCutoffHz,
      measurementDtS
    );
  } else {
    state.estimatedOpticalPitchRateMradPerS = 0;
    state.estimatedOpticalRollRateMradPerS = 0;
    state.hasMeasurement = true;
  }

  state.lastMeasurementTimeS = measurementReleaseTimeS;
  state.measuredOpticalPitchMrad = measuredOpticalPitchMrad;
  state.measuredOpticalRollMrad = measuredOpticalRollMrad;
  state.imuPitchAtMeasurementMrad = state.filteredImuPitchMrad;
  state.imuRollAtMeasurementMrad = state.filteredImuRollMrad;
  state.measurementWindow.push({
    timeS: measurementReleaseTimeS,
    pitchMrad: measuredOpticalPitchMrad,
    rollMrad: measuredOpticalRollMrad
  });
  const maxWindow = Math.max(3, Math.round(params.dmdWindowSize));
  while (state.measurementWindow.length > maxWindow) {
    state.measurementWindow.shift();
  }
}

function harmonicPredict(position: number, velocity: number, baseFrequencyHz: number, horizonS: number): number {
  if (Math.abs(baseFrequencyHz) < 1e-4) {
    return position + velocity * horizonS;
  }
  const omega = Math.max(baseFrequencyHz, 1e-4) * Math.PI * 2;
  return position * Math.cos(omega * horizonS) + (velocity / omega) * Math.sin(omega * horizonS);
}

function fitAr2Coefficients(series: number[]): { a: number; b: number } | null {
  if (series.length < 3) {
    return null;
  }

  let s11 = 0;
  let s12 = 0;
  let s22 = 0;
  let t1 = 0;
  let t2 = 0;
  for (let index = 1; index < series.length - 1; index += 1) {
    const xk = series[index];
    const xkm1 = series[index - 1];
    const xkp1 = series[index + 1];
    s11 += xk * xk;
    s12 += xk * xkm1;
    s22 += xkm1 * xkm1;
    t1 += xk * xkp1;
    t2 += xkm1 * xkp1;
  }
  const determinant = s11 * s22 - s12 * s12;
  if (Math.abs(determinant) < 1e-8) {
    return null;
  }

  return {
    a: (t1 * s22 - t2 * s12) / determinant,
    b: (s11 * t2 - s12 * t1) / determinant
  };
}

function predictSlidingWindowDmd(
  series: number[],
  timestampsS: number[],
  fallbackVelocityMradPerS: number,
  horizonS: number
): number {
  if (series.length === 0) {
    return 0;
  }
  if (series.length === 1) {
    return series[0] + fallbackVelocityMradPerS * horizonS;
  }

  const coefficients = fitAr2Coefficients(series);
  const latest = series[series.length - 1];
  if (coefficients === null) {
    return latest + fallbackVelocityMradPerS * horizonS;
  }

  const intervals = timestampsS.slice(1).map((timeS, index) => timeS - timestampsS[index]);
  const averageIntervalS =
    intervals.reduce((sum, value) => sum + value, 0) / Math.max(intervals.length, 1);
  const stepIntervalS = Math.max(averageIntervalS, 1e-4);
  const stepsAhead = Math.max(1, Math.round(Math.max(horizonS, stepIntervalS) / stepIntervalS));

  let previous = series[series.length - 2];
  let current = latest;
  for (let index = 0; index < stepsAhead; index += 1) {
    const next = coefficients.a * current + coefficients.b * previous;
    previous = current;
    current = next;
  }
  return current;
}

function computePredictiveCommand(
  state: PredictiveControllerState,
  params: AimingLabParameters,
  mirrorPitchMrad: number,
  mirrorRollMrad: number,
  controllerDtS: number,
  nowS: number
): PredictiveCommandOutput {
  if (!state.hasMeasurement) {
    state.generatorCommandPitchMrad = mirrorPitchMrad;
    state.generatorCommandRollMrad = mirrorRollMrad;
    return {
      pitchMrad: state.generatorCommandPitchMrad,
      rollMrad: state.generatorCommandRollMrad
    };
  }

  const timeSinceMeasurementS = Math.max(nowS - state.lastMeasurementTimeS, 0);
  const leadTimeS = Math.max(params.predictorLeadMs, 0) / 1000;
  const imuPitchDeltaMrad =
    params.imuFeedforwardGain * (state.filteredImuPitchMrad - state.imuPitchAtMeasurementMrad);
  const imuRollDeltaMrad =
    params.imuFeedforwardGain * (state.filteredImuRollMrad - state.imuRollAtMeasurementMrad);
  const imuPitchRateMradPerS = params.imuRateLeadGain * state.filteredImuPitchRateMradPerS;
  const imuRollRateMradPerS = params.imuRateLeadGain * state.filteredImuRollRateMradPerS;

  let predictedOpticalPitchFuture = state.measuredOpticalPitchMrad + imuPitchDeltaMrad;
  let predictedOpticalRollFuture = state.measuredOpticalRollMrad + imuRollDeltaMrad;

  if (params.commandGeneratorMode === "integral") {
    const predictedOpticalPitchNow =
      state.measuredOpticalPitchMrad +
      params.centroidVelocityGain * state.estimatedOpticalPitchRateMradPerS * timeSinceMeasurementS +
      imuPitchDeltaMrad;
    const predictedOpticalRollNow =
      state.measuredOpticalRollMrad +
      params.centroidVelocityGain * state.estimatedOpticalRollRateMradPerS * timeSinceMeasurementS +
      imuRollDeltaMrad;

    predictedOpticalPitchFuture =
      predictedOpticalPitchNow +
      leadTimeS *
        (params.centroidVelocityGain * state.estimatedOpticalPitchRateMradPerS + imuPitchRateMradPerS);
    predictedOpticalRollFuture =
      predictedOpticalRollNow +
      leadTimeS *
        (params.centroidVelocityGain * state.estimatedOpticalRollRateMradPerS + imuRollRateMradPerS);
  } else if (params.commandGeneratorMode === "frequency_phase") {
    const oscillationHorizonS = timeSinceMeasurementS + leadTimeS;
    predictedOpticalPitchFuture = harmonicPredict(
      state.measuredOpticalPitchMrad + imuPitchDeltaMrad,
      state.estimatedOpticalPitchRateMradPerS + imuPitchRateMradPerS,
      params.phasePredictorBaseFrequencyHz,
      oscillationHorizonS
    );
    predictedOpticalRollFuture = harmonicPredict(
      state.measuredOpticalRollMrad + imuRollDeltaMrad,
      state.estimatedOpticalRollRateMradPerS + imuRollRateMradPerS,
      params.phasePredictorBaseFrequencyHz,
      oscillationHorizonS
    );
  } else if (params.commandGeneratorMode === "dmd_sliding_window") {
    const oscillationHorizonS = timeSinceMeasurementS + leadTimeS;
    const pitchSeries = state.measurementWindow.map((sample) => sample.pitchMrad);
    const rollSeries = state.measurementWindow.map((sample) => sample.rollMrad);
    const timestampsS = state.measurementWindow.map((sample) => sample.timeS);
    predictedOpticalPitchFuture =
      predictSlidingWindowDmd(
        pitchSeries,
        timestampsS,
        state.estimatedOpticalPitchRateMradPerS + imuPitchRateMradPerS,
        oscillationHorizonS
      ) + imuPitchDeltaMrad;
    predictedOpticalRollFuture =
      predictSlidingWindowDmd(
        rollSeries,
        timestampsS,
        state.estimatedOpticalRollRateMradPerS + imuRollRateMradPerS,
        oscillationHorizonS
      ) + imuRollDeltaMrad;
  }

  if (params.commandGeneratorMode === "direct") {
    state.generatorCommandPitchMrad = clamp(
      mirrorAngleForOpticalTarget(state.measuredOpticalPitchMrad),
      -params.memsMaxAngleMrad,
      params.memsMaxAngleMrad
    );
    state.generatorCommandRollMrad = clamp(
      mirrorAngleForOpticalTarget(state.measuredOpticalRollMrad),
      -params.memsMaxAngleMrad,
      params.memsMaxAngleMrad
    );
    return {
      pitchMrad: state.generatorCommandPitchMrad,
      rollMrad: state.generatorCommandRollMrad
    };
  }

  const desiredMirrorPitchMrad = mirrorAngleForOpticalTarget(predictedOpticalPitchFuture);
  const desiredMirrorRollMrad = mirrorAngleForOpticalTarget(predictedOpticalRollFuture);
  const predictedErrorPitchMrad = desiredMirrorPitchMrad - mirrorPitchMrad;
  const predictedErrorRollMrad = desiredMirrorRollMrad - mirrorRollMrad;
  state.commandBiasPitchMrad = clamp(
    state.commandBiasPitchMrad + params.pidKi * predictedErrorPitchMrad * controllerDtS,
    -params.integralLimitMrad,
    params.integralLimitMrad
  );
  state.commandBiasRollMrad = clamp(
    state.commandBiasRollMrad + params.pidKi * predictedErrorRollMrad * controllerDtS,
    -params.integralLimitMrad,
    params.integralLimitMrad
  );

  const rawDerivativePitchMradPerS =
    (predictedErrorPitchMrad - state.previousPredictedErrorPitchMrad) / Math.max(controllerDtS, 1e-6);
  const rawDerivativeRollMradPerS =
    (predictedErrorRollMrad - state.previousPredictedErrorRollMrad) / Math.max(controllerDtS, 1e-6);

  // Low-pass the D term: a raw finite difference of the (pixel-noise-contaminated)
  // predicted error amplifies centroid noise at the controller rate, which made Kd
  // nearly unusable. Filtering keeps Kd acting as true damping on real error motion.
  state.filteredDerivativePitchMradPerS = lowPassStep(
    state.filteredDerivativePitchMradPerS,
    rawDerivativePitchMradPerS,
    params.derivativeFilterHz,
    controllerDtS
  );
  state.filteredDerivativeRollMradPerS = lowPassStep(
    state.filteredDerivativeRollMradPerS,
    rawDerivativeRollMradPerS,
    params.derivativeFilterHz,
    controllerDtS
  );
  const derivativePitchMradPerS = state.filteredDerivativePitchMradPerS;
  const derivativeRollMradPerS = state.filteredDerivativeRollMradPerS;

  state.previousPredictedErrorPitchMrad = predictedErrorPitchMrad;
  state.previousPredictedErrorRollMrad = predictedErrorRollMrad;

  state.generatorCommandPitchMrad = clamp(
    mirrorPitchMrad +
      params.pidKp * predictedErrorPitchMrad +
      state.commandBiasPitchMrad +
      params.pidKd * derivativePitchMradPerS,
    -params.memsMaxAngleMrad,
    params.memsMaxAngleMrad
  );
  state.generatorCommandRollMrad = clamp(
    mirrorRollMrad +
      params.pidKp * predictedErrorRollMrad +
      state.commandBiasRollMrad +
      params.pidKd * derivativeRollMradPerS,
    -params.memsMaxAngleMrad,
    params.memsMaxAngleMrad
  );

  return {
    pitchMrad: state.generatorCommandPitchMrad,
    rollMrad: state.generatorCommandRollMrad
  };
}

function shouldIssueGeneratorCommand(
  state: PredictiveControllerState,
  params: AimingLabParameters,
  nowS: number,
  measurementReleasedThisStep: boolean
): boolean {
  if (!state.hasMeasurement) {
    return false;
  }
  if (params.commandGeneratorMode === "direct") {
    return measurementReleasedThisStep;
  }
  if (params.commandGeneratorMode === "dmd_sliding_window") {
    const updatePeriodS = Math.max(params.dmdCommandPeriodMs, 0.1) / 1000;
    return nowS >= state.lastGeneratorIssueTimeS + updatePeriodS - 1e-9;
  }
  return true;
}

function rms(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const meanSquare = values.reduce((sum, value) => sum + value * value, 0) / values.length;
  return Math.sqrt(meanSquare);
}

function findSettlingTimeMs(
  samples: AimingSample[],
  targetStepTimeS: number,
  lockThresholdMrad: number
): number | null {
  const stepIndex = samples.findIndex((sample) => sample.timeS >= targetStepTimeS);
  if (stepIndex < 0) {
    return null;
  }

  const holdWindow = Math.max(4, Math.floor((0.15 / (samples[1]?.timeS ?? 0.001))));
  for (let index = stepIndex; index < samples.length - holdWindow; index += 1) {
    let settled = true;
    for (let holdIndex = 0; holdIndex < holdWindow; holdIndex += 1) {
      if (Math.abs(samples[index + holdIndex].pointingErrorMrad) > lockThresholdMrad) {
        settled = false;
        break;
      }
    }
    if (settled) {
      return (samples[index].timeS - targetStepTimeS) * 1000;
    }
  }

  return null;
}

export function runAimingSimulation(params: AimingLabParameters): AimingSimulationResult {
  const sampleCount = Math.max(1, Math.floor(params.durationS / params.timeStepS));
  const cameraPeriodS = 1 / params.cameraFps;
  const exposureDurationS = clamp(params.exposureTimeMs / 1000, params.timeStepS, cameraPeriodS);
  const processingDelayS = params.processingLatencyMs / 1000;
  const driverDelayS = params.driverLatencyMs / 1000;
  const pixelsPerMrad = 512 / Math.max(params.cameraFovMrad, 0.1);
  const naturalFrequencyRad = params.memsNaturalFrequencyHz * Math.PI * 2;
  const settleTimeS = Math.max(0.0005, 4 / Math.max(params.memsDampingRatio * naturalFrequencyRad, 1e-6));
  const lowFrequencyGain = suppressionResidualGain(params.gimbalSuppressionPct);
  const highFrequencyGain = suppressionResidualGain(params.dampingSuppressionPct);
  const plantSubsteps = Math.max(1, Math.ceil(params.timeStepS / 0.00005));
  const plantDtS = params.timeStepS / plantSubsteps;
  const controllerDtS = Math.max(cameraPeriodS, params.timeStepS);

  const delayedMeasurements: TimedMeasurement[] = [];
  const delayedCommands: TimedCommand[] = [];
  const samples: AimingSample[] = [];
  const playbackCycles: AimingPlaybackCycle[] = [];

  let activeExposure:
    | {
        cycleIndex: number;
        startTimeS: number;
        endTimeS: number;
        sumPointingMrad: number;
        sumOpticalMrad: number;
        sampleCount: number;
        minPointingMrad: number;
        maxPointingMrad: number;
        startPointingMrad: number;
        endPointingMrad: number;
        sumPointingYMrad: number;
        sumOpticalYMrad: number;
        startPointingYMrad: number;
        endPointingYMrad: number;
        sumMirrorPitchMrad: number;
        sumMirrorRollMrad: number;
        pathPoints: Array<{ xMrad: number; yMrad: number }>;
        mirrorAngleBeforeMrad: number;
      }
    | null = null;

  let latestMeasuredErrorMrad = 0;
  let latestMeasuredErrorYMrad = 0;
  let nextCameraSampleS = 0;
  let mirrorAngleMrad = 0;
  let mirrorRollAngleMrad = 0;
  let mirrorVelocityMradPerS = 0;
  let mirrorRollVelocityMradPerS = 0;
  let activeCommandMrad = 0;
  let activeCommandRollMrad = 0;
  let generatorCommandPitchMrad = 0;
  let generatorCommandRollMrad = 0;
  let latestExposureCentroidMrad = 0;
  let latestExposureCentroidYMrad = 0;
  let latestExposureSmearMrad = 0;
  let lastKnownTargetMrad = 0;
  let spotCoverageRatio = 0;
  let laserOn = false;
  let targetTemperatureC = AMBIENT_TEMPERATURE_C;
  let absorbedPowerW = 0;
  let heatLossW = 0;
  let shotsPerSecond = 0;
  let sensorXMm = 0;
  let sensorYMm = 0;
  let targetInSpot = false;
  const shotTimestampsS: number[] = [];
  let lastShotTimeS = -Infinity;
  const controllerState = createPredictiveControllerState();
  let controllerCycleIndex = -1;

  for (let index = 0; index < sampleCount; index += 1) {
    const timeS = index * params.timeStepS;
    const lowFrequencyDisturbanceMrad =
      lowFrequencyGain * params.lowFrequencyDisturbanceMrad * Math.sin(timeS * params.lowFrequencyHz * Math.PI * 2);
    const highFrequencyDisturbanceMrad =
      highFrequencyGain *
      params.highFrequencyDisturbanceMrad *
      (0.76 * Math.sin(timeS * params.highFrequencyHz * Math.PI * 2) +
        0.24 * Math.sin(timeS * params.highFrequencyHz * Math.PI * 3.3));
    const residualPlatformMotionMrad = lowFrequencyDisturbanceMrad + highFrequencyDisturbanceMrad;
    const targetMotionMrad =
      (timeS >= params.targetStepTimeS ? params.targetStepMrad : 0) +
      params.targetSwayMrad * Math.sin(timeS * params.targetSwayHz * Math.PI * 2) +
      params.targetBiasXMrad;
    const residualPlatformMotionYMrad =
      0.38 * lowFrequencyDisturbanceMrad * Math.sin(timeS * params.lowFrequencyHz * Math.PI * 1.2) +
      0.22 * highFrequencyDisturbanceMrad * Math.cos(timeS * params.highFrequencyHz * Math.PI * 1.1);
    const opticalTargetAngleMrad = residualPlatformMotionMrad + targetMotionMrad;
    const opticalTargetAngleYMrad =
      residualPlatformMotionYMrad +
      params.targetBiasYMrad +
      params.targetSwayMrad * 0.55 * Math.cos(timeS * params.targetSwayHz * Math.PI * 1.3);
    const mirrorPitchMrad = mirrorAngleMrad + params.mirrorPitchBiasMrad;
    const mirrorRollMrad = mirrorRollAngleMrad + params.mirrorRollBiasMrad;
    const pointingErrorMrad = opticalTargetAngleMrad - opticalFromMirrorAngle(mirrorPitchMrad);
    const pointingErrorYMrad = opticalTargetAngleYMrad - opticalFromMirrorAngle(mirrorRollMrad);
    updateImuFilters(
      controllerState,
      params,
      residualPlatformMotionMrad,
      residualPlatformMotionYMrad,
      params.timeStepS
    );
    const thermalUpdate = updateLaserThermalState(
      params,
      {
        coverageRatio: spotCoverageRatio,
        laserOn,
        targetTemperatureC,
        shotTimestampsS,
        lastShotTimeS
      },
      pointingErrorMrad,
      pointingErrorYMrad,
      params.timeStepS,
      timeS
    );
    spotCoverageRatio = thermalUpdate.coverageRatio;
    laserOn = thermalUpdate.laserOn;
    targetInSpot = thermalUpdate.targetInSpot;
    absorbedPowerW = thermalUpdate.absorbedPowerW;
    heatLossW = thermalUpdate.heatLossW;
    targetTemperatureC = thermalUpdate.targetTemperatureC;
    shotsPerSecond = thermalUpdate.shotsPerSecond;
    sensorXMm = thermalUpdate.sensorXMm;
    sensorYMm = thermalUpdate.sensorYMm;
    lastShotTimeS = shotTimestampsS.length > 0 ? shotTimestampsS[shotTimestampsS.length - 1] : -Infinity;

    if (activeExposure === null && timeS + 1e-9 >= nextCameraSampleS) {
      activeExposure = {
        cycleIndex: playbackCycles.length,
        startTimeS: timeS,
        endTimeS: timeS + exposureDurationS,
        sumPointingMrad: 0,
        sumOpticalMrad: 0,
        sampleCount: 0,
        minPointingMrad: pointingErrorMrad,
        maxPointingMrad: pointingErrorMrad,
        startPointingMrad: pointingErrorMrad,
        endPointingMrad: pointingErrorMrad,
        sumPointingYMrad: 0,
        sumOpticalYMrad: 0,
        startPointingYMrad: pointingErrorYMrad,
        endPointingYMrad: pointingErrorYMrad,
        sumMirrorPitchMrad: mirrorPitchMrad,
        sumMirrorRollMrad: mirrorRollMrad,
        pathPoints: [],
        mirrorAngleBeforeMrad: mirrorAngleMrad
      };
    }

    if (activeExposure !== null) {
      activeExposure.sumPointingMrad += pointingErrorMrad;
      activeExposure.sumOpticalMrad += opticalTargetAngleMrad;
      activeExposure.sampleCount += 1;
      activeExposure.minPointingMrad = Math.min(activeExposure.minPointingMrad, pointingErrorMrad);
      activeExposure.maxPointingMrad = Math.max(activeExposure.maxPointingMrad, pointingErrorMrad);
      activeExposure.endPointingMrad = pointingErrorMrad;
      activeExposure.sumPointingYMrad += pointingErrorYMrad;
      activeExposure.sumOpticalYMrad += opticalTargetAngleYMrad;
      activeExposure.endPointingYMrad = pointingErrorYMrad;
      activeExposure.sumMirrorPitchMrad += mirrorPitchMrad;
      activeExposure.sumMirrorRollMrad += mirrorRollMrad;
      if (
        activeExposure.pathPoints.length === 0 ||
        activeExposure.pathPoints.length < 18 &&
          activeExposure.sampleCount % 2 === 0
      ) {
        activeExposure.pathPoints.push({
          xMrad: pointingErrorMrad,
          yMrad: pointingErrorYMrad
        });
      }

      if (timeS + 1e-9 >= activeExposure.endTimeS) {
        const centroidMrad = activeExposure.sumPointingMrad / Math.max(activeExposure.sampleCount, 1);
        const centroidYMrad = activeExposure.sumPointingYMrad / Math.max(activeExposure.sampleCount, 1);
        const opticalCentroidMrad = activeExposure.sumOpticalMrad / Math.max(activeExposure.sampleCount, 1);
        const opticalCentroidYMrad = activeExposure.sumOpticalYMrad / Math.max(activeExposure.sampleCount, 1);
        const mirrorPitchCentroidMrad =
          activeExposure.sumMirrorPitchMrad / Math.max(activeExposure.sampleCount, 1);
        const mirrorRollCentroidMrad =
          activeExposure.sumMirrorRollMrad / Math.max(activeExposure.sampleCount, 1);
        const smearWidthMrad = activeExposure.maxPointingMrad - activeExposure.minPointingMrad;
        const noiseMrad =
          (noiseSignal(activeExposure.cycleIndex + 1.7) * 2 - 1) *
          (params.pixelNoisePx / Math.max(pixelsPerMrad, 1e-3));
        const measuredCentroidMrad = centroidMrad + noiseMrad;

        latestExposureCentroidMrad = centroidMrad;
        latestExposureCentroidYMrad = centroidYMrad;
        latestExposureSmearMrad = smearWidthMrad;

        playbackCycles.push({
          exposureStartTimeS: activeExposure.startTimeS,
          exposureEndTimeS: activeExposure.endTimeS,
          measurementTimeS: activeExposure.endTimeS + processingDelayS,
          commandTimeS: activeExposure.endTimeS + processingDelayS + driverDelayS,
          settleEndTimeS: activeExposure.endTimeS + processingDelayS + driverDelayS + settleTimeS,
          actualPointingStartMrad: activeExposure.startPointingMrad,
          actualPointingEndMrad: activeExposure.endPointingMrad,
          actualPointingCentroidMrad: centroidMrad,
          actualPointingCentroidYMrad: centroidYMrad,
          measuredPointingErrorMrad: measuredCentroidMrad,
          measuredPointingErrorYMrad: centroidYMrad,
          smearWidthMrad,
          opticalTargetAngleMrad: opticalCentroidMrad,
          opticalTargetAngleYMrad: opticalCentroidYMrad,
          mirrorAngleBeforeMrad: activeExposure.mirrorAngleBeforeMrad,
          mirrorAngleAfterMrad: activeExposure.mirrorAngleBeforeMrad,
          mirrorCommandMrad: activeCommandMrad,
          mirrorCommandRollMrad: activeCommandRollMrad,
          exposurePathPoints: activeExposure.pathPoints.length > 0
            ? activeExposure.pathPoints
            : [{ xMrad: pointingErrorMrad, yMrad: pointingErrorYMrad }]
        });

        delayedMeasurements.push({
          releaseTimeS: activeExposure.endTimeS + processingDelayS,
          valueXMrad: measuredCentroidMrad,
          valueYMrad: centroidYMrad,
          mirrorPitchMrad: mirrorPitchCentroidMrad,
          mirrorRollMrad: mirrorRollCentroidMrad,
          cycleIndex: activeExposure.cycleIndex
        });

        nextCameraSampleS = Math.max(
          activeExposure.startTimeS + cameraPeriodS,
          activeExposure.endTimeS + processingDelayS + driverDelayS
        );

        activeExposure = null;
      }
    }

    let measurementReleasedThisStep = false;
    while (delayedMeasurements.length > 0 && delayedMeasurements[0].releaseTimeS <= timeS + 1e-9) {
      const releasedMeasurement = delayedMeasurements.shift()!;
      latestMeasuredErrorMrad = releasedMeasurement.valueXMrad;
      latestMeasuredErrorYMrad = releasedMeasurement.valueYMrad;
      lastKnownTargetMrad = releasedMeasurement.valueXMrad;
      controllerCycleIndex = releasedMeasurement.cycleIndex;
      applyMeasurementToPredictor(controllerState, params, releasedMeasurement, timeS);
      measurementReleasedThisStep = true;
    }

    if (shouldIssueGeneratorCommand(controllerState, params, timeS, measurementReleasedThisStep)) {
      const predictiveCommand = computePredictiveCommand(
        controllerState,
        params,
        mirrorPitchMrad,
        mirrorRollMrad,
        controllerDtS,
        timeS
      );
      generatorCommandPitchMrad = predictiveCommand.pitchMrad;
      generatorCommandRollMrad = predictiveCommand.rollMrad;
      delayedCommands.push({
        releaseTimeS: timeS + driverDelayS,
        valuePitchMrad: generatorCommandPitchMrad,
        valueRollMrad: generatorCommandRollMrad,
        cycleIndex: Math.max(controllerCycleIndex, 0)
      });
      controllerState.lastGeneratorIssueTimeS = timeS;
    } else {
      generatorCommandPitchMrad = controllerState.hasMeasurement
        ? controllerState.generatorCommandPitchMrad
        : mirrorPitchMrad;
      generatorCommandRollMrad = controllerState.hasMeasurement
        ? controllerState.generatorCommandRollMrad
        : mirrorRollMrad;
    }

    while (delayedCommands.length > 0 && delayedCommands[0].releaseTimeS <= timeS + 1e-9) {
      const releasedCommand = delayedCommands.shift()!;
      activeCommandMrad = releasedCommand.valuePitchMrad;
      activeCommandRollMrad = releasedCommand.valueRollMrad;
      if (playbackCycles[releasedCommand.cycleIndex]) {
        playbackCycles[releasedCommand.cycleIndex].mirrorCommandMrad = releasedCommand.valuePitchMrad;
        playbackCycles[releasedCommand.cycleIndex].mirrorCommandRollMrad = releasedCommand.valueRollMrad;
      }
    }

    for (let substep = 0; substep < plantSubsteps; substep += 1) {
      const mirrorAccelerationMradPerS2 =
        naturalFrequencyRad * naturalFrequencyRad * (activeCommandMrad - mirrorAngleMrad) -
        2 * params.memsDampingRatio * naturalFrequencyRad * mirrorVelocityMradPerS;

      mirrorVelocityMradPerS += mirrorAccelerationMradPerS2 * plantDtS;
      mirrorAngleMrad = clamp(
        mirrorAngleMrad + mirrorVelocityMradPerS * plantDtS,
        -params.memsMaxAngleMrad,
        params.memsMaxAngleMrad
      );
      const mirrorRollAccelerationMradPerS2 =
        naturalFrequencyRad * naturalFrequencyRad * (activeCommandRollMrad - mirrorRollAngleMrad) -
        2 * params.memsDampingRatio * naturalFrequencyRad * mirrorRollVelocityMradPerS;
      mirrorRollVelocityMradPerS += mirrorRollAccelerationMradPerS2 * plantDtS;
      mirrorRollAngleMrad = clamp(
        mirrorRollAngleMrad + mirrorRollVelocityMradPerS * plantDtS,
        -params.memsMaxAngleMrad,
        params.memsMaxAngleMrad
      );

      if (Math.abs(mirrorAngleMrad) >= params.memsMaxAngleMrad) {
        mirrorVelocityMradPerS *= 0.6;
      }
      if (Math.abs(mirrorRollAngleMrad) >= params.memsMaxAngleMrad) {
        mirrorRollVelocityMradPerS *= 0.6;
      }
    }

    samples.push({
      timeS,
      shutterOpen: activeExposure !== null,
      exposureCentroidMrad: latestExposureCentroidMrad,
      exposureSmearMrad: latestExposureSmearMrad,
      lastKnownTargetMrad,
      lowFrequencyDisturbanceMrad,
      highFrequencyDisturbanceMrad,
      residualPlatformMotionMrad,
      targetMotionMrad,
      opticalTargetAngleMrad,
      opticalTargetAngleYMrad,
      measuredErrorMrad: latestMeasuredErrorMrad,
      measuredErrorYMrad: latestMeasuredErrorYMrad,
      mirrorAngleMrad: mirrorPitchMrad,
      mirrorRollMrad,
      mirrorCommandMrad: activeCommandMrad,
      mirrorCommandRollMrad: activeCommandRollMrad,
      commandGeneratorPitchMrad: generatorCommandPitchMrad,
      commandGeneratorRollMrad: generatorCommandRollMrad,
      pointingErrorMrad,
      pointingErrorYMrad,
      filteredImuPitchMrad: controllerState.filteredImuPitchMrad,
      filteredImuRollMrad: controllerState.filteredImuRollMrad,
      sensorXMm,
      sensorYMm,
      laserOn,
      targetInSpot,
      spotCoveragePct: spotCoverageRatio * 100,
      absorbedPowerW,
      heatLossW,
      targetTemperatureC,
      shotsPerSecond
    });
  }

  const pointingErrors = samples.map((sample) => sample.pointingErrorMrad);
  const lockSamples = samples.filter(
    (sample) => Math.abs(sample.pointingErrorMrad) <= params.lockThresholdMrad
  ).length;

  for (const cycle of playbackCycles) {
    const settledSample = nearestSampleAtTime(samples, cycle.settleEndTimeS);
    cycle.mirrorAngleAfterMrad = settledSample.mirrorAngleMrad;
  }

  return {
    samples,
    metrics: {
      rmsPointingErrorMrad: rms(pointingErrors),
      peakPointingErrorMrad: pointingErrors.reduce(
        (peak, value) => Math.max(peak, Math.abs(value)),
        0
      ),
      lockFractionPct: (lockSamples / samples.length) * 100,
      settlingTimeMs: findSettlingTimeMs(samples, params.targetStepTimeS, params.lockThresholdMrad),
      measuredLatencyMs: params.processingLatencyMs + params.driverLatencyMs + params.exposureTimeMs * 0.5
    },
    playbackCycles
  };
}

function createZeroSample(): AimingSample {
  return {
    timeS: 0,
    shutterOpen: false,
    exposureCentroidMrad: 0,
    exposureSmearMrad: 0,
    lastKnownTargetMrad: 0,
    lowFrequencyDisturbanceMrad: 0,
    highFrequencyDisturbanceMrad: 0,
    residualPlatformMotionMrad: 0,
    targetMotionMrad: 0,
    opticalTargetAngleMrad: 0,
    opticalTargetAngleYMrad: 0,
    measuredErrorMrad: 0,
    measuredErrorYMrad: 0,
    mirrorAngleMrad: 0,
    mirrorRollMrad: 0,
    mirrorCommandMrad: 0,
    mirrorCommandRollMrad: 0,
    commandGeneratorPitchMrad: 0,
    commandGeneratorRollMrad: 0,
    pointingErrorMrad: 0,
    pointingErrorYMrad: 0,
    filteredImuPitchMrad: 0,
    filteredImuRollMrad: 0,
    sensorXMm: 0,
    sensorYMm: 0,
    laserOn: false,
    targetInSpot: false,
    spotCoveragePct: 0,
    absorbedPowerW: 0,
    heatLossW: 0,
    targetTemperatureC: AMBIENT_TEMPERATURE_C,
    shotsPerSecond: 0
  };
}

function computeMetricsFromHistory(
  samples: AimingSample[],
  params: AimingLabParameters
): AimingMetrics {
  if (samples.length === 0) {
    return {
      rmsPointingErrorMrad: 0,
      peakPointingErrorMrad: 0,
      lockFractionPct: 0,
      settlingTimeMs: null,
      measuredLatencyMs: params.processingLatencyMs + params.driverLatencyMs + params.exposureTimeMs * 0.5
    };
  }

  const pointingErrors = samples.map((sample) => sample.pointingErrorMrad);
  const lockSamples = samples.filter(
    (sample) => Math.abs(sample.pointingErrorMrad) <= params.lockThresholdMrad
  ).length;
  const settlingTimeMs =
    samples[0].timeS <= params.targetStepTimeS ? findSettlingTimeMs(samples, params.targetStepTimeS, params.lockThresholdMrad) : null;

  return {
    rmsPointingErrorMrad: rms(pointingErrors),
    peakPointingErrorMrad: pointingErrors.reduce(
      (peak, value) => Math.max(peak, Math.abs(value)),
      0
    ),
    lockFractionPct: (lockSamples / samples.length) * 100,
    settlingTimeMs,
    measuredLatencyMs: params.processingLatencyMs + params.driverLatencyMs + params.exposureTimeMs * 0.5
  };
}

export class AimingLabEngine {
  private params: AimingLabParameters;

  private simTimeS = 0;
  private accumulatorS = 0;
  private nextCameraSampleS = 0;

  private delayedMeasurements: TimedMeasurement[] = [];
  private delayedCommands: TimedCommand[] = [];
  private activeExposure:
    | {
        cycleIndex: number;
        startTimeS: number;
        endTimeS: number;
        sumPointingMrad: number;
        sumOpticalMrad: number;
        sampleCount: number;
        minPointingMrad: number;
        maxPointingMrad: number;
        startPointingMrad: number;
        endPointingMrad: number;
        sumPointingYMrad: number;
        sumOpticalYMrad: number;
        startPointingYMrad: number;
        endPointingYMrad: number;
        sumMirrorPitchMrad: number;
        sumMirrorRollMrad: number;
        pathPoints: Array<{ xMrad: number; yMrad: number }>;
        mirrorAngleBeforeMrad: number;
      }
    | null = null;

  private latestMeasuredErrorMrad = 0;
  private latestMeasuredErrorYMrad = 0;
  private latestExposureCentroidMrad = 0;
  private latestExposureCentroidYMrad = 0;
  private latestExposureSmearMrad = 0;
  private lastKnownTargetMrad = 0;
  private spotCoverageRatio = 0;
  private laserOn = false;
  private targetTemperatureC = AMBIENT_TEMPERATURE_C;
  private absorbedPowerW = 0;
  private heatLossW = 0;
  private shotsPerSecond = 0;
  private sensorXMm = 0;
  private sensorYMm = 0;
  private targetInSpot = false;
  private shotTimestampsS: number[] = [];
  private lastShotTimeS = -Infinity;

  private controllerState = createPredictiveControllerState();
  private controllerCycleIndex = -1;
  private mirrorAngleMrad = 0;
  private mirrorRollAngleMrad = 0;
  private mirrorVelocityMradPerS = 0;
  private mirrorRollVelocityMradPerS = 0;
  private activeCommandMrad = 0;
  private activeCommandRollMrad = 0;
  private generatorCommandPitchMrad = 0;
  private generatorCommandRollMrad = 0;

  private currentSample: AimingSample = createZeroSample();
  private metricSamples: AimingSample[] = [];
  private chartHistory: AimingHistoryPoint[] = [];
  private captureHistory: Array<{ id: number; cycle: AimingPlaybackCycle }> = [];
  private latestCaptureId: number | null = null;
  private captureIdCounter = 0;
  private lastExposureCloseTimeS = -Infinity;
  private lastMeasurementTimeS = -Infinity;
  private lastCommandTimeS = -Infinity;

  constructor(params: AimingLabParameters) {
    this.params = { ...params };
    this.currentSample = createZeroSample();
  }

  reset(params: AimingLabParameters): void {
    this.params = { ...params };
    this.simTimeS = 0;
    this.accumulatorS = 0;
    this.nextCameraSampleS = 0;
    this.delayedMeasurements = [];
    this.delayedCommands = [];
    this.activeExposure = null;
    this.latestMeasuredErrorMrad = 0;
    this.latestMeasuredErrorYMrad = 0;
    this.latestExposureCentroidMrad = 0;
    this.latestExposureCentroidYMrad = 0;
    this.latestExposureSmearMrad = 0;
    this.lastKnownTargetMrad = 0;
    this.spotCoverageRatio = 0;
    this.laserOn = false;
    this.targetTemperatureC = AMBIENT_TEMPERATURE_C;
    this.absorbedPowerW = 0;
    this.heatLossW = 0;
    this.shotsPerSecond = 0;
    this.sensorXMm = 0;
    this.sensorYMm = 0;
    this.targetInSpot = false;
    this.shotTimestampsS = [];
    this.lastShotTimeS = -Infinity;
    this.controllerState = createPredictiveControllerState();
    this.controllerCycleIndex = -1;
    this.mirrorAngleMrad = 0;
    this.mirrorRollAngleMrad = 0;
    this.mirrorVelocityMradPerS = 0;
    this.mirrorRollVelocityMradPerS = 0;
    this.activeCommandMrad = 0;
    this.activeCommandRollMrad = 0;
    this.generatorCommandPitchMrad = 0;
    this.generatorCommandRollMrad = 0;
    this.metricSamples = [];
    this.chartHistory = [];
    this.captureHistory = [];
    this.latestCaptureId = null;
    this.captureIdCounter = 0;
    this.lastExposureCloseTimeS = -Infinity;
    this.lastMeasurementTimeS = -Infinity;
    this.lastCommandTimeS = -Infinity;
    this.currentSample = createZeroSample();
  }

  updateParams(params: AimingLabParameters): void {
    this.params = { ...params };
  }

  step(simAdvanceS: number): void {
    const maxAdvanceS = Math.max(0, simAdvanceS);
    if (maxAdvanceS <= 0) {
      return;
    }

    this.accumulatorS += maxAdvanceS;
    const dtS = Math.max(this.params.timeStepS, 1e-6);
    const maxSteps = 2000;
    let steps = 0;

    while (this.accumulatorS >= dtS && steps < maxSteps) {
      this.stepOne(dtS);
      this.accumulatorS -= dtS;
      steps += 1;
    }
  }

  getSnapshot(): AimingLiveSnapshot {
    const closePhaseDurationS = Math.min(0.00035, Math.max(0.00005, (this.params.processingLatencyMs / 1000) * 0.2));
    let phase: AimingPlaybackPhase = "delay";
    if (this.activeExposure !== null) {
      phase = "open";
    } else if (this.simTimeS < this.lastExposureCloseTimeS + closePhaseDurationS) {
      phase = "close";
    } else if (this.simTimeS < this.lastMeasurementTimeS) {
      phase = "centroid";
    } else if (this.simTimeS < this.lastCommandTimeS) {
      phase = "command";
    }

    return {
      simTimeS: this.simTimeS,
      currentSample: this.currentSample,
      metrics: computeMetricsFromHistory(this.metricSamples, this.params),
      recentHistory: [...this.chartHistory],
      captures: this.captureHistory.map((capture, index) => ({
        id: capture.id,
        cycle: capture.cycle,
        showCentroid: capture.id !== this.latestCaptureId || this.simTimeS >= capture.cycle.measurementTimeS,
        isIncoming: capture.id === this.latestCaptureId && this.simTimeS < capture.cycle.exposureEndTimeS + 0.0012
      })),
      phase,
      commandFeedActive: this.simTimeS < this.lastCommandTimeS + 0.0006,
      flashActive: this.simTimeS < this.lastExposureCloseTimeS + 0.00026,
      shotFlashActive: this.simTimeS < this.lastShotTimeS + SHOT_FLASH_DURATION_S
    };
  }

  private stepOne(dtS: number): void {
    const cameraPeriodS = 1 / Math.max(this.params.cameraFps, 1);
    const exposureDurationS = clamp(this.params.exposureTimeMs / 1000, dtS, cameraPeriodS);
    const processingDelayS = this.params.processingLatencyMs / 1000;
    const driverDelayS = this.params.driverLatencyMs / 1000;
    const pixelsPerMrad = 512 / Math.max(this.params.cameraFovMrad, 0.1);
    const naturalFrequencyRad = this.params.memsNaturalFrequencyHz * Math.PI * 2;
    const lowFrequencyGain = suppressionResidualGain(this.params.gimbalSuppressionPct);
    const highFrequencyGain = suppressionResidualGain(this.params.dampingSuppressionPct);
    const plantSubsteps = Math.max(1, Math.ceil(dtS / 0.00005));
    const plantDtS = dtS / plantSubsteps;
    const controllerDtS = Math.max(cameraPeriodS, dtS);
    const settleTimeS = Math.max(0.0005, 4 / Math.max(this.params.memsDampingRatio * naturalFrequencyRad, 1e-6));
    const timeS = this.simTimeS;

    const lowFrequencyDisturbanceMrad =
      lowFrequencyGain * this.params.lowFrequencyDisturbanceMrad * Math.sin(timeS * this.params.lowFrequencyHz * Math.PI * 2);
    const highFrequencyDisturbanceMrad =
      highFrequencyGain *
      this.params.highFrequencyDisturbanceMrad *
      (0.76 * Math.sin(timeS * this.params.highFrequencyHz * Math.PI * 2) +
        0.24 * Math.sin(timeS * this.params.highFrequencyHz * Math.PI * 3.3));
    const residualPlatformMotionMrad = lowFrequencyDisturbanceMrad + highFrequencyDisturbanceMrad;
    const targetMotionMrad =
      (timeS >= this.params.targetStepTimeS ? this.params.targetStepMrad : 0) +
      this.params.targetSwayMrad * Math.sin(timeS * this.params.targetSwayHz * Math.PI * 2) +
      this.params.targetBiasXMrad;
    const residualPlatformMotionYMrad =
      0.38 * lowFrequencyDisturbanceMrad * Math.sin(timeS * this.params.lowFrequencyHz * Math.PI * 1.2) +
      0.22 * highFrequencyDisturbanceMrad * Math.cos(timeS * this.params.highFrequencyHz * Math.PI * 1.1);
    const opticalTargetAngleMrad = residualPlatformMotionMrad + targetMotionMrad;
    const opticalTargetAngleYMrad =
      residualPlatformMotionYMrad +
      this.params.targetBiasYMrad +
      this.params.targetSwayMrad * 0.55 * Math.cos(timeS * this.params.targetSwayHz * Math.PI * 1.3);
    const mirrorPitchMrad = this.mirrorAngleMrad + this.params.mirrorPitchBiasMrad;
    const mirrorRollMrad = this.mirrorRollAngleMrad + this.params.mirrorRollBiasMrad;
    const pointingErrorMrad = opticalTargetAngleMrad - opticalFromMirrorAngle(mirrorPitchMrad);
    const pointingErrorYMrad = opticalTargetAngleYMrad - opticalFromMirrorAngle(mirrorRollMrad);
    updateImuFilters(
      this.controllerState,
      this.params,
      residualPlatformMotionMrad,
      residualPlatformMotionYMrad,
      dtS
    );
    const thermalUpdate = updateLaserThermalState(
      this.params,
      {
        coverageRatio: this.spotCoverageRatio,
        laserOn: this.laserOn,
        targetTemperatureC: this.targetTemperatureC,
        shotTimestampsS: this.shotTimestampsS,
        lastShotTimeS: this.lastShotTimeS
      },
      pointingErrorMrad,
      pointingErrorYMrad,
      dtS,
      timeS
    );
    this.spotCoverageRatio = thermalUpdate.coverageRatio;
    this.laserOn = thermalUpdate.laserOn;
    this.targetInSpot = thermalUpdate.targetInSpot;
    this.absorbedPowerW = thermalUpdate.absorbedPowerW;
    this.heatLossW = thermalUpdate.heatLossW;
    this.targetTemperatureC = thermalUpdate.targetTemperatureC;
    this.shotsPerSecond = thermalUpdate.shotsPerSecond;
    this.sensorXMm = thermalUpdate.sensorXMm;
    this.sensorYMm = thermalUpdate.sensorYMm;
    this.lastShotTimeS =
      this.shotTimestampsS.length > 0 ? this.shotTimestampsS[this.shotTimestampsS.length - 1] : -Infinity;

    if (this.activeExposure === null && timeS + 1e-9 >= this.nextCameraSampleS) {
      this.activeExposure = {
        cycleIndex: this.captureIdCounter,
        startTimeS: timeS,
        endTimeS: timeS + exposureDurationS,
        sumPointingMrad: 0,
        sumOpticalMrad: 0,
        sampleCount: 0,
        minPointingMrad: pointingErrorMrad,
        maxPointingMrad: pointingErrorMrad,
        startPointingMrad: pointingErrorMrad,
        endPointingMrad: pointingErrorMrad,
        sumPointingYMrad: 0,
        sumOpticalYMrad: 0,
        startPointingYMrad: pointingErrorYMrad,
        endPointingYMrad: pointingErrorYMrad,
        sumMirrorPitchMrad: mirrorPitchMrad,
        sumMirrorRollMrad: mirrorRollMrad,
        pathPoints: [],
        mirrorAngleBeforeMrad: this.mirrorAngleMrad
      };
    }

    if (this.activeExposure !== null) {
      this.activeExposure.sumPointingMrad += pointingErrorMrad;
      this.activeExposure.sumOpticalMrad += opticalTargetAngleMrad;
      this.activeExposure.sampleCount += 1;
      this.activeExposure.minPointingMrad = Math.min(this.activeExposure.minPointingMrad, pointingErrorMrad);
      this.activeExposure.maxPointingMrad = Math.max(this.activeExposure.maxPointingMrad, pointingErrorMrad);
      this.activeExposure.endPointingMrad = pointingErrorMrad;
      this.activeExposure.sumPointingYMrad += pointingErrorYMrad;
      this.activeExposure.sumOpticalYMrad += opticalTargetAngleYMrad;
      this.activeExposure.endPointingYMrad = pointingErrorYMrad;
      this.activeExposure.sumMirrorPitchMrad += mirrorPitchMrad;
      this.activeExposure.sumMirrorRollMrad += mirrorRollMrad;
      if (
        this.activeExposure.pathPoints.length === 0 ||
        (this.activeExposure.pathPoints.length < 18 && this.activeExposure.sampleCount % 2 === 0)
      ) {
        this.activeExposure.pathPoints.push({
          xMrad: pointingErrorMrad,
          yMrad: pointingErrorYMrad
        });
      }

      if (timeS + 1e-9 >= this.activeExposure.endTimeS) {
        const centroidMrad = this.activeExposure.sumPointingMrad / Math.max(this.activeExposure.sampleCount, 1);
        const centroidYMrad = this.activeExposure.sumPointingYMrad / Math.max(this.activeExposure.sampleCount, 1);
        const opticalCentroidMrad = this.activeExposure.sumOpticalMrad / Math.max(this.activeExposure.sampleCount, 1);
        const opticalCentroidYMrad = this.activeExposure.sumOpticalYMrad / Math.max(this.activeExposure.sampleCount, 1);
        const mirrorPitchCentroidMrad =
          this.activeExposure.sumMirrorPitchMrad / Math.max(this.activeExposure.sampleCount, 1);
        const mirrorRollCentroidMrad =
          this.activeExposure.sumMirrorRollMrad / Math.max(this.activeExposure.sampleCount, 1);
        const smearWidthMrad = this.activeExposure.maxPointingMrad - this.activeExposure.minPointingMrad;
        const noiseMrad =
          (noiseSignal(this.activeExposure.cycleIndex + 1.7) * 2 - 1) *
          (this.params.pixelNoisePx / Math.max(pixelsPerMrad, 1e-3));
        const measuredCentroidMrad = centroidMrad + noiseMrad;
        const captureId = this.captureIdCounter + 1;
        this.captureIdCounter = captureId;

        this.latestExposureCentroidMrad = centroidMrad;
        this.latestExposureCentroidYMrad = centroidYMrad;
        this.latestExposureSmearMrad = smearWidthMrad;
        this.lastExposureCloseTimeS = this.activeExposure.endTimeS;
        this.lastMeasurementTimeS = this.activeExposure.endTimeS + processingDelayS;
        this.lastCommandTimeS = this.activeExposure.endTimeS + processingDelayS + driverDelayS;

        const captureCycle: AimingPlaybackCycle = {
          exposureStartTimeS: this.activeExposure.startTimeS,
          exposureEndTimeS: this.activeExposure.endTimeS,
          measurementTimeS: this.lastMeasurementTimeS,
          commandTimeS: this.lastCommandTimeS,
          settleEndTimeS: this.lastCommandTimeS + settleTimeS,
          actualPointingStartMrad: this.activeExposure.startPointingMrad,
          actualPointingEndMrad: this.activeExposure.endPointingMrad,
          actualPointingCentroidMrad: centroidMrad,
          actualPointingCentroidYMrad: centroidYMrad,
          measuredPointingErrorMrad: measuredCentroidMrad,
          measuredPointingErrorYMrad: centroidYMrad,
          smearWidthMrad,
          opticalTargetAngleMrad: opticalCentroidMrad,
          opticalTargetAngleYMrad: opticalCentroidYMrad,
          mirrorAngleBeforeMrad: this.activeExposure.mirrorAngleBeforeMrad,
          mirrorAngleAfterMrad: this.activeExposure.mirrorAngleBeforeMrad,
          mirrorCommandMrad: this.activeCommandMrad,
          mirrorCommandRollMrad: this.activeCommandRollMrad,
          exposurePathPoints:
            this.activeExposure.pathPoints.length > 0
              ? this.activeExposure.pathPoints.map((point) => ({ ...point }))
              : [{ xMrad: pointingErrorMrad, yMrad: pointingErrorYMrad }]
        };

        this.captureHistory = [
          { id: captureId, cycle: captureCycle },
          ...this.captureHistory
        ].slice(0, 5);
        this.latestCaptureId = captureId;

        this.delayedMeasurements.push({
          releaseTimeS: this.lastMeasurementTimeS,
          valueXMrad: measuredCentroidMrad,
          valueYMrad: centroidYMrad,
          mirrorPitchMrad: mirrorPitchCentroidMrad,
          mirrorRollMrad: mirrorRollCentroidMrad,
          cycleIndex: captureId
        });

        this.nextCameraSampleS = Math.max(
          this.activeExposure.startTimeS + cameraPeriodS,
          this.activeExposure.endTimeS + processingDelayS + driverDelayS
        );
        this.activeExposure = null;
      }
    }

    let measurementReleasedThisStep = false;
    while (this.delayedMeasurements.length > 0 && this.delayedMeasurements[0].releaseTimeS <= timeS + 1e-9) {
      const releasedMeasurement = this.delayedMeasurements.shift()!;
      this.latestMeasuredErrorMrad = releasedMeasurement.valueXMrad;
      this.latestMeasuredErrorYMrad = releasedMeasurement.valueYMrad;
      this.lastKnownTargetMrad = releasedMeasurement.valueXMrad;
      this.controllerCycleIndex = releasedMeasurement.cycleIndex;
      applyMeasurementToPredictor(this.controllerState, this.params, releasedMeasurement, timeS);
      measurementReleasedThisStep = true;
    }

    if (shouldIssueGeneratorCommand(this.controllerState, this.params, timeS, measurementReleasedThisStep)) {
      const predictiveCommand = computePredictiveCommand(
        this.controllerState,
        this.params,
        mirrorPitchMrad,
        mirrorRollMrad,
        controllerDtS,
        timeS
      );
      this.generatorCommandPitchMrad = predictiveCommand.pitchMrad;
      this.generatorCommandRollMrad = predictiveCommand.rollMrad;
      this.delayedCommands.push({
        releaseTimeS: timeS + driverDelayS,
        valuePitchMrad: this.generatorCommandPitchMrad,
        valueRollMrad: this.generatorCommandRollMrad,
        cycleIndex: Math.max(this.controllerCycleIndex, 0)
      });
      this.controllerState.lastGeneratorIssueTimeS = timeS;
    } else {
      this.generatorCommandPitchMrad = this.controllerState.hasMeasurement
        ? this.controllerState.generatorCommandPitchMrad
        : mirrorPitchMrad;
      this.generatorCommandRollMrad = this.controllerState.hasMeasurement
        ? this.controllerState.generatorCommandRollMrad
        : mirrorRollMrad;
    }

    while (this.delayedCommands.length > 0 && this.delayedCommands[0].releaseTimeS <= timeS + 1e-9) {
      const releasedCommand = this.delayedCommands.shift()!;
      this.activeCommandMrad = releasedCommand.valuePitchMrad;
      this.activeCommandRollMrad = releasedCommand.valueRollMrad;
      this.lastCommandTimeS = releasedCommand.releaseTimeS;
    }

    for (let substep = 0; substep < plantSubsteps; substep += 1) {
      const mirrorAccelerationMradPerS2 =
        naturalFrequencyRad * naturalFrequencyRad * (this.activeCommandMrad - this.mirrorAngleMrad) -
        2 * this.params.memsDampingRatio * naturalFrequencyRad * this.mirrorVelocityMradPerS;
      this.mirrorVelocityMradPerS += mirrorAccelerationMradPerS2 * plantDtS;
      this.mirrorAngleMrad = clamp(
        this.mirrorAngleMrad + this.mirrorVelocityMradPerS * plantDtS,
        -this.params.memsMaxAngleMrad,
        this.params.memsMaxAngleMrad
      );

      const mirrorRollAccelerationMradPerS2 =
        naturalFrequencyRad * naturalFrequencyRad * (this.activeCommandRollMrad - this.mirrorRollAngleMrad) -
        2 * this.params.memsDampingRatio * naturalFrequencyRad * this.mirrorRollVelocityMradPerS;
      this.mirrorRollVelocityMradPerS += mirrorRollAccelerationMradPerS2 * plantDtS;
      this.mirrorRollAngleMrad = clamp(
        this.mirrorRollAngleMrad + this.mirrorRollVelocityMradPerS * plantDtS,
        -this.params.memsMaxAngleMrad,
        this.params.memsMaxAngleMrad
      );

      if (Math.abs(this.mirrorAngleMrad) >= this.params.memsMaxAngleMrad) {
        this.mirrorVelocityMradPerS *= 0.6;
      }
      if (Math.abs(this.mirrorRollAngleMrad) >= this.params.memsMaxAngleMrad) {
        this.mirrorRollVelocityMradPerS *= 0.6;
      }
    }

    this.currentSample = {
      timeS,
      shutterOpen: this.activeExposure !== null,
      exposureCentroidMrad: this.latestExposureCentroidMrad,
      exposureSmearMrad: this.latestExposureSmearMrad,
      lastKnownTargetMrad: this.lastKnownTargetMrad,
      lowFrequencyDisturbanceMrad,
      highFrequencyDisturbanceMrad,
      residualPlatformMotionMrad,
      targetMotionMrad,
      opticalTargetAngleMrad,
      opticalTargetAngleYMrad,
      measuredErrorMrad: this.latestMeasuredErrorMrad,
      measuredErrorYMrad: this.latestMeasuredErrorYMrad,
      mirrorAngleMrad: mirrorPitchMrad,
      mirrorRollMrad,
      mirrorCommandMrad: this.activeCommandMrad,
      mirrorCommandRollMrad: this.activeCommandRollMrad,
      commandGeneratorPitchMrad: this.generatorCommandPitchMrad,
      commandGeneratorRollMrad: this.generatorCommandRollMrad,
      pointingErrorMrad,
      pointingErrorYMrad,
      filteredImuPitchMrad: this.controllerState.filteredImuPitchMrad,
      filteredImuRollMrad: this.controllerState.filteredImuRollMrad,
      sensorXMm: this.sensorXMm,
      sensorYMm: this.sensorYMm,
      laserOn: this.laserOn,
      targetInSpot: this.targetInSpot,
      spotCoveragePct: this.spotCoverageRatio * 100,
      absorbedPowerW: this.absorbedPowerW,
      heatLossW: this.heatLossW,
      targetTemperatureC: this.targetTemperatureC,
      shotsPerSecond: this.shotsPerSecond
    };

    this.metricSamples.push(this.currentSample);
    const metricCutoffS = timeS - Math.max(this.params.durationS, 0.5);
    while (this.metricSamples.length > 1 && this.metricSamples[0].timeS < metricCutoffS) {
      this.metricSamples.shift();
    }

    this.chartHistory.push({
      timeS,
      targetX: opticalTargetAngleMrad,
      targetY: opticalTargetAngleYMrad,
      commandPitch: this.currentSample.commandGeneratorPitchMrad,
      commandRoll: this.currentSample.commandGeneratorRollMrad,
      mirrorPitch: mirrorPitchMrad,
      mirrorRoll: mirrorRollMrad,
      spotCoveragePct: this.spotCoverageRatio * 100,
      laserOn: this.laserOn ? 100 : 0,
      targetTemperatureC: this.targetTemperatureC,
      shotsPerSecond: this.shotsPerSecond
    });
    const chartCutoffS = timeS - 0.18;
    while (this.chartHistory.length > 1 && this.chartHistory[0].timeS < chartCutoffS) {
      this.chartHistory.shift();
    }

    this.simTimeS += dtS;

  }
}

export function downsampleAimingSamples(samples: AimingSample[], maxPoints: number): AimingSample[] {
  if (samples.length <= maxPoints) {
    return samples;
  }
  const stride = samples.length / maxPoints;
  const reduced: AimingSample[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    reduced.push(samples[Math.floor(index * stride)]);
  }
  return reduced;
}

function nearestSampleAtTime(samples: AimingSample[], timeS: number): AimingSample {
  if (samples.length === 0) {
    throw new Error("Aiming playback cycles require at least one simulation sample.");
  }
  const clampedTime = clamp(timeS, samples[0].timeS, samples[samples.length - 1].timeS);
  const index = Math.round(clampedTime / Math.max(samples[1]?.timeS ?? 0.001, 1e-6));
  return samples[Math.min(samples.length - 1, Math.max(0, index))];
}

export function buildAimingPlaybackCycles(
  samples: AimingSample[],
  params: AimingLabParameters
): AimingPlaybackCycle[] {
  if (samples.length === 0) {
    return [];
  }

  const cameraPeriodS = 1 / Math.max(params.cameraFps, 1);
  const exposureDurationS = clamp(params.exposureTimeMs / 1000, params.timeStepS, cameraPeriodS);
  const measurementDelayS = params.processingLatencyMs / 1000;
  const commandDelayS = params.driverLatencyMs / 1000;
  const settleTimeS = Math.max(
    0.0005,
    4 / Math.max(params.memsDampingRatio * params.memsNaturalFrequencyHz * Math.PI * 2, 1e-6)
  );
  const durationS = samples[samples.length - 1].timeS;
  const cycleCount = Math.max(1, Math.floor(durationS / cameraPeriodS));
  const cycles: AimingPlaybackCycle[] = [];

  for (let index = 0; index < cycleCount; index += 1) {
    const exposureStartTimeS = index * cameraPeriodS;
    const exposureEndTimeS = exposureStartTimeS + exposureDurationS;
    const measurementTimeS = exposureEndTimeS + measurementDelayS;
    const commandTimeS = measurementTimeS + commandDelayS;
    const settleEndTimeS = commandTimeS + settleTimeS;

    const startSample = nearestSampleAtTime(samples, exposureStartTimeS);
    const endSample = nearestSampleAtTime(samples, exposureEndTimeS);
    const measurementSample = nearestSampleAtTime(samples, measurementTimeS);
    const commandSample = nearestSampleAtTime(samples, settleEndTimeS);

    cycles.push({
      exposureStartTimeS,
      exposureEndTimeS,
      measurementTimeS,
      commandTimeS,
      settleEndTimeS,
      actualPointingStartMrad: startSample.pointingErrorMrad,
      actualPointingEndMrad: endSample.pointingErrorMrad,
      actualPointingCentroidMrad: measurementSample.exposureCentroidMrad,
      actualPointingCentroidYMrad: measurementSample.measuredErrorYMrad,
      measuredPointingErrorMrad: measurementSample.measuredErrorMrad,
      measuredPointingErrorYMrad: measurementSample.measuredErrorYMrad,
      smearWidthMrad: measurementSample.exposureSmearMrad,
      opticalTargetAngleMrad: startSample.opticalTargetAngleMrad,
      opticalTargetAngleYMrad: startSample.opticalTargetAngleYMrad,
      mirrorAngleBeforeMrad: startSample.mirrorAngleMrad,
      mirrorAngleAfterMrad: commandSample.mirrorAngleMrad,
      mirrorCommandMrad: commandSample.mirrorCommandMrad,
      mirrorCommandRollMrad: commandSample.mirrorCommandRollMrad,
      exposurePathPoints: [
        { xMrad: startSample.pointingErrorMrad, yMrad: startSample.pointingErrorYMrad },
        { xMrad: endSample.pointingErrorMrad, yMrad: endSample.pointingErrorYMrad }
      ]
    });
  }

  return cycles;
}
