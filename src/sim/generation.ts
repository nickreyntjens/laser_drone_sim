import { clamp } from "./defaults";
import { FieldProfile, getFieldProfile } from "./fieldProfiles";
import { createRng, samplePoisson, vec3 } from "./math";
import { SimulationParameters, TargetState, Vec3 } from "./types";

function snapToGrid(value: number, spacingM: number, minM: number, maxM: number): number {
  const snappedValue = Math.round(value / spacingM) * spacingM;
  return clamp(snappedValue, minM, maxM);
}

export interface RiceLeafTipPlacement {
  hillX: number;
  hillZ: number;
  supportX: number;
  supportY: number;
  supportZ: number;
  tipX: number;
  tipZ: number;
  tipHeightM: number;
  leafTipAngleRad: number;
}

export function computeRiceLeafTipPlacement(
  baseX: number,
  baseZ: number,
  params: SimulationParameters,
  fieldProfile: FieldProfile,
  rng: () => number
): RiceLeafTipPlacement {
  const hillX = snapToGrid(baseX, params.rowSpacingM, 0.3, params.fieldLengthM - 0.3);
  const hillZ = snapToGrid(baseZ, params.rowSpacingM, 0.15, params.fieldWidthM - 0.15);
  const leafTipAngleRad = rng() * Math.PI * 2;
  const tipReachM =
    fieldProfile.representativeLeafLengthM * (0.72 + rng() * 0.18);
  const supportReachRatio = 0.18 + rng() * 0.08;
  const supportX = clamp(
    hillX + Math.cos(leafTipAngleRad) * tipReachM * supportReachRatio,
    0.3,
    params.fieldLengthM - 0.3
  );
  const supportZ = clamp(
    hillZ + Math.sin(leafTipAngleRad) * tipReachM * supportReachRatio * 0.45,
    0.15,
    params.fieldWidthM - 0.15
  );
  const tipX = clamp(
    hillX + Math.cos(leafTipAngleRad) * tipReachM * 0.58,
    0.3,
    params.fieldLengthM - 0.3
  );
  const tipZ = clamp(
    hillZ + Math.sin(leafTipAngleRad) * tipReachM * 0.26,
    0.15,
    params.fieldWidthM - 0.15
  );
  const supportY =
    fieldProfile.maturePlantHeightM * (0.74 + rng() * 0.06);
  const tipHeightM =
    fieldProfile.maturePlantHeightM * (0.92 + rng() * 0.04);

  return {
    hillX,
    hillZ,
    supportX,
    supportY,
    supportZ,
    tipX,
    tipZ,
    tipHeightM,
    leafTipAngleRad
  };
}

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
  const fieldProfile = getFieldProfile(params.fieldType);
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
    const canopyOffset = (rng() - 0.5) * params.rowSpacingM * fieldProfile.canopyOffsetFactor;
    const alongRowJitter = (rng() - 0.5) * fieldProfile.alongRowJitterM;
    const isRice = fieldProfile.cropVisualStyle === "rice";
    const baseX = clamp(x + alongRowJitter, 0.4, params.fieldLengthM - 0.4);
    const baseZ = clamp(rowCenter + canopyOffset, 0.2, params.fieldWidthM - 0.2);
    const ricePlacement = isRice
      ? computeRiceLeafTipPlacement(baseX, baseZ, params, fieldProfile, rng)
      : null;
    const tipX = ricePlacement ? ricePlacement.tipX : baseX;
    const tipZ = ricePlacement ? ricePlacement.tipZ : baseZ;
    const targetHeightM = ricePlacement
      ? ricePlacement.tipHeightM
      : fieldProfile.targetHeightBaseM + rng() * fieldProfile.targetHeightJitterM;
    const supportPosition = ricePlacement
      ? vec3(ricePlacement.supportX, ricePlacement.supportY, ricePlacement.supportZ)
      : null;

    accepted.push({
      id: accepted.length,
      position: vec3(
        tipX,
        targetHeightM,
        tipZ
      ),
      supportPosition,
      rowIndex,
      alive: true,
      discovered: false,
      queued: false,
      detectionPulse: 0,
      neutralizationPulse: 0,
      engagementProgress: 0,
      detectedAtS: null,
      neutralizedAtS: null,
      blockedUntilS: 0
    });
  }

  accepted.sort((a, b) => a.position.x - b.position.x);
  for (let index = 0; index < accepted.length; index += 1) {
    accepted[index].id = index;
  }

  return accepted;
}
