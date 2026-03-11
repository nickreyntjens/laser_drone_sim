import { clamp } from "./defaults";

export interface AimingLabParameters {
  durationS: number;
  timeStepS: number;
  cameraFps: number;
  exposureTimeMs: number;
  cameraFovMrad: number;
  processingLatencyMs: number;
  driverLatencyMs: number;
  memsNaturalFrequencyHz: number;
  memsDampingRatio: number;
  memsMaxAngleMrad: number;
  pidKp: number;
  pidKi: number;
  pidKd: number;
  integralLimitMrad: number;
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
  lockThresholdMrad: number;
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
  measuredErrorMrad: number;
  mirrorAngleMrad: number;
  mirrorCommandMrad: number;
  pointingErrorMrad: number;
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

export interface AimingPlaybackCycle {
  exposureStartTimeS: number;
  exposureEndTimeS: number;
  measurementTimeS: number;
  commandTimeS: number;
  settleEndTimeS: number;
  actualPointingStartMrad: number;
  actualPointingEndMrad: number;
  actualPointingCentroidMrad: number;
  measuredPointingErrorMrad: number;
  smearWidthMrad: number;
  opticalTargetAngleMrad: number;
  mirrorAngleBeforeMrad: number;
  mirrorAngleAfterMrad: number;
  mirrorCommandMrad: number;
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
  valueMrad: number;
  cycleIndex: number;
}

interface TimedCommand {
  releaseTimeS: number;
  valueMrad: number;
  cycleIndex: number;
}

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
  processingLatencyMs: 2.3,
  driverLatencyMs: 0.35,
  memsNaturalFrequencyHz: 950,
  memsDampingRatio: 0.62,
  memsMaxAngleMrad: 2.5,
  pidKp: 0.72,
  pidKi: 18,
  pidKd: 0.0005,
  integralLimitMrad: 1.4,
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
  lockThresholdMrad: 0.08
};

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
  const lowFrequencyGain = 1 - clamp(params.gimbalSuppressionPct / 100, 0, 0.995);
  const highFrequencyGain = 1 - clamp(params.dampingSuppressionPct / 100, 0, 0.995);
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
        mirrorAngleBeforeMrad: number;
      }
    | null = null;

  let latestMeasuredErrorMrad = 0;
  let nextCameraSampleS = 0;
  let integralError = 0;
  let previousMeasuredErrorMrad = 0;
  let mirrorAngleMrad = 0;
  let mirrorVelocityMradPerS = 0;
  let activeCommandMrad = 0;
  let latestExposureCentroidMrad = 0;
  let latestExposureSmearMrad = 0;
  let lastKnownTargetMrad = 0;

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
      params.targetSwayMrad * Math.sin(timeS * params.targetSwayHz * Math.PI * 2);
    const opticalTargetAngleMrad = residualPlatformMotionMrad + targetMotionMrad;
    const pointingErrorMrad = opticalTargetAngleMrad - mirrorAngleMrad;

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

      if (timeS + 1e-9 >= activeExposure.endTimeS) {
        const centroidMrad = activeExposure.sumPointingMrad / Math.max(activeExposure.sampleCount, 1);
        const opticalCentroidMrad = activeExposure.sumOpticalMrad / Math.max(activeExposure.sampleCount, 1);
        const smearWidthMrad = activeExposure.maxPointingMrad - activeExposure.minPointingMrad;
        const noiseMrad =
          (noiseSignal(activeExposure.cycleIndex + 1.7) * 2 - 1) *
          (params.pixelNoisePx / Math.max(pixelsPerMrad, 1e-3));
        const measuredCentroidMrad = centroidMrad + noiseMrad;

        latestExposureCentroidMrad = centroidMrad;
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
          measuredPointingErrorMrad: measuredCentroidMrad,
          smearWidthMrad,
          opticalTargetAngleMrad: opticalCentroidMrad,
          mirrorAngleBeforeMrad: activeExposure.mirrorAngleBeforeMrad,
          mirrorAngleAfterMrad: activeExposure.mirrorAngleBeforeMrad,
          mirrorCommandMrad: activeCommandMrad
        });

        delayedMeasurements.push({
          releaseTimeS: activeExposure.endTimeS + processingDelayS,
          valueMrad: measuredCentroidMrad,
          cycleIndex: activeExposure.cycleIndex
        });

        nextCameraSampleS = Math.max(
          activeExposure.startTimeS + cameraPeriodS,
          activeExposure.endTimeS + processingDelayS + driverDelayS
        );

        activeExposure = null;
      }
    }

    let releasedMeasurementCycleIndex = -1;
    while (delayedMeasurements.length > 0 && delayedMeasurements[0].releaseTimeS <= timeS + 1e-9) {
      const releasedMeasurement = delayedMeasurements.shift()!;
      latestMeasuredErrorMrad = releasedMeasurement.valueMrad;
      lastKnownTargetMrad = releasedMeasurement.valueMrad;
      releasedMeasurementCycleIndex = releasedMeasurement.cycleIndex;
    }

    if (releasedMeasurementCycleIndex >= 0) {
      integralError = clamp(
        integralError + latestMeasuredErrorMrad * controllerDtS,
        -params.integralLimitMrad,
        params.integralLimitMrad
      );
      const derivativeError = (latestMeasuredErrorMrad - previousMeasuredErrorMrad) / controllerDtS;
      const correctionCommandMrad =
        params.pidKp * latestMeasuredErrorMrad +
        params.pidKi * integralError +
        params.pidKd * derivativeError;
      const controllerCommandMrad = clamp(
        mirrorAngleMrad + correctionCommandMrad,
        -params.memsMaxAngleMrad,
        params.memsMaxAngleMrad
      );
      previousMeasuredErrorMrad = latestMeasuredErrorMrad;

      delayedCommands.push({
        releaseTimeS: timeS + driverDelayS,
        valueMrad: controllerCommandMrad,
        cycleIndex: releasedMeasurementCycleIndex
      });
    }

    while (delayedCommands.length > 0 && delayedCommands[0].releaseTimeS <= timeS + 1e-9) {
      const releasedCommand = delayedCommands.shift()!;
      activeCommandMrad = releasedCommand.valueMrad;
      if (playbackCycles[releasedCommand.cycleIndex]) {
        playbackCycles[releasedCommand.cycleIndex].mirrorCommandMrad = releasedCommand.valueMrad;
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

      if (Math.abs(mirrorAngleMrad) >= params.memsMaxAngleMrad) {
        mirrorVelocityMradPerS *= 0.6;
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
      measuredErrorMrad: latestMeasuredErrorMrad,
      mirrorAngleMrad,
      mirrorCommandMrad: activeCommandMrad,
      pointingErrorMrad
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
      measuredPointingErrorMrad: measurementSample.measuredErrorMrad,
      smearWidthMrad: measurementSample.exposureSmearMrad,
      opticalTargetAngleMrad: startSample.opticalTargetAngleMrad,
      mirrorAngleBeforeMrad: startSample.mirrorAngleMrad,
      mirrorAngleAfterMrad: commandSample.mirrorAngleMrad,
      mirrorCommandMrad: commandSample.mirrorCommandMrad
    });
  }

  return cycles;
}
