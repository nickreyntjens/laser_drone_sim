import { clamp } from "./defaults";
import { createRng, samplePoisson, vec3 } from "./math";
import { SimulationParameters, TargetState, Vec3 } from "./types";

export function buildSweepPath(params: SimulationParameters): Vec3[] {
  const laneCenters: number[] = [];
  for (let z = params.laneSpacingM * 0.5; z < params.fieldWidthM; z += params.laneSpacingM) {
    laneCenters.push(z);
  }

  const center = params.fieldWidthM * 0.5;
  laneCenters.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));

  const path: Vec3[] = [];
  let currentX = 0;

  for (let index = 0; index < laneCenters.length; index += 1) {
    const laneZ = laneCenters[index];
    path.push(vec3(currentX, params.searchAltitudeM, laneZ));
    currentX = currentX === 0 ? params.fieldLengthM : 0;
    path.push(vec3(currentX, params.searchAltitudeM, laneZ));
  }

  return path;
}

export function generateTargets(
  params: SimulationParameters,
  seed: number
): TargetState[] {
  const rng = createRng(seed);
  const fieldArea = params.fieldLengthM * params.fieldWidthM;
  const fieldAreaHectares = fieldArea / 10_000;
  const targetCountMean = params.edgeDensityPerHectare * fieldAreaHectares;
  const targetCount = samplePoisson(targetCountMean, rng);
  const rowCount = Math.max(1, Math.round(params.fieldWidthM / params.rowSpacingM));
  const accepted: TargetState[] = [];
  const decay = Math.max(params.gradientStrength, 1e-6);
  const expNegDecay = Math.exp(-decay);

  for (let index = 0; index < targetCount; index += 1) {
    const depthUnit =
      decay < 1e-3
        ? rng()
        : -Math.log(1 - rng() * (1 - expNegDecay)) / decay;
    const x = clamp(depthUnit * params.fieldLengthM, 0, params.fieldLengthM);
    const z = rng() * params.fieldWidthM;

    const rowIndex = clamp(
      Math.round(z / params.rowSpacingM),
      0,
      rowCount - 1
    );
    const rowCenter = rowIndex * params.rowSpacingM + params.rowSpacingM * 0.5;
    const canopyOffset = (rng() - 0.5) * params.rowSpacingM * 0.35;
    const alongRowJitter = (rng() - 0.5) * 0.7;

    accepted.push({
      id: accepted.length,
      position: vec3(
        clamp(x + alongRowJitter, 0.4, params.fieldLengthM - 0.4),
        0.18 + rng() * 0.12,
        clamp(rowCenter + canopyOffset, 0.2, params.fieldWidthM - 0.2)
      ),
      rowIndex,
      alive: true,
      discovered: false,
      queued: false,
      detectionPulse: 0,
      neutralizationPulse: 0,
      engagementProgress: 0,
      detectedAtS: null,
      neutralizedAtS: null
    });
  }

  accepted.sort((a, b) => a.position.x - b.position.x);
  for (let index = 0; index < accepted.length; index += 1) {
    accepted[index].id = index;
  }

  return accepted;
}
