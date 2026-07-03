import { clamp } from "./defaults";
import { FieldProfile, getFieldProfile } from "./fieldProfiles";
import { greenhouseAisleCenters } from "./greenhouse";
import { createRng, samplePoisson, vec3 } from "./math";
import { orchardSweepLaneCenters, orchardTreeCenter } from "./orchard";
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

interface OrchardTargetPlacement {
  targetX: number;
  targetY: number;
  targetZ: number;
  supportX: number;
  supportY: number;
  supportZ: number;
}

interface GreenhouseTargetPlacement {
  targetX: number;
  targetY: number;
  targetZ: number;
  supportX: number;
  supportY: number;
  supportZ: number;
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

function computeOrchardTargetPlacement(
  baseX: number,
  rowIndex: number,
  params: SimulationParameters,
  fieldProfile: FieldProfile,
  rng: () => number
): OrchardTargetPlacement {
  const treeCenter = orchardTreeCenter(rowIndex, baseX, params, fieldProfile);
  const topTarget = rng() < 0.42;

  if (topTarget) {
    const angleRad = rng() * Math.PI * 2;
    const radialM = fieldProfile.canopyRadiusM * (0.18 + rng() * 0.28);
    return {
      targetX: clamp(treeCenter.x + Math.cos(angleRad) * radialM, 0.8, params.fieldLengthM - 0.8),
      targetY: fieldProfile.maturePlantHeightM * (0.9 + rng() * 0.07),
      targetZ: clamp(treeCenter.z + Math.sin(angleRad) * radialM * 0.55, 0.25, params.fieldWidthM - 0.25),
      supportX: treeCenter.x,
      supportY: fieldProfile.maturePlantHeightM * 0.55,
      supportZ: treeCenter.z
    };
  }

  let sideSign = rng() < 0.5 ? -1 : 1;
  const lowerAlleyExists = treeCenter.z - params.rowSpacingM * 0.5 >= 0;
  const upperAlleyExists = treeCenter.z + params.rowSpacingM * 0.5 <= params.fieldWidthM;
  if (!lowerAlleyExists) {
    sideSign = 1;
  } else if (!upperAlleyExists) {
    sideSign = -1;
  }

  return {
    targetX: clamp(
      treeCenter.x + (rng() - 0.5) * fieldProfile.canopyRadiusM * 0.55,
      0.8,
      params.fieldLengthM - 0.8
    ),
    targetY: fieldProfile.maturePlantHeightM * (0.45 + rng() * 0.28),
    targetZ: clamp(
      treeCenter.z + sideSign * fieldProfile.canopyRadiusM * (0.72 + rng() * 0.18),
      0.25,
      params.fieldWidthM - 0.25
    ),
    supportX: treeCenter.x,
    supportY: fieldProfile.maturePlantHeightM * 0.55,
    supportZ: treeCenter.z
  };
}

function computeGreenhouseTargetPlacement(
  baseX: number,
  baseZ: number,
  params: SimulationParameters,
  fieldProfile: FieldProfile,
  rng: () => number
): GreenhouseTargetPlacement {
  const plantX = snapToGrid(baseX, fieldProfile.inRowPlantSpacingM, 0.35, params.fieldLengthM - 0.35);
  const rowCenterZ = snapToGrid(baseZ, params.rowSpacingM, 0.2, params.fieldWidthM - 0.2);
  const leafAngleRad = (rng() - 0.5) * 1.1;
  const leafReachM = fieldProfile.representativeLeafLengthM * (0.6 + rng() * 0.22);
  const sideOffsetM = (rng() - 0.5) * fieldProfile.canopyRadiusM * 0.9;
  const supportY = fieldProfile.maturePlantHeightM * (0.34 + rng() * 0.12);
  const tipY = fieldProfile.maturePlantHeightM * (0.66 + rng() * 0.16);

  return {
    targetX: clamp(plantX + Math.cos(leafAngleRad) * leafReachM * 0.48, 0.35, params.fieldLengthM - 0.35),
    targetY: tipY,
    targetZ: clamp(rowCenterZ + sideOffsetM, 0.2, params.fieldWidthM - 0.2),
    supportX: clamp(plantX + Math.cos(leafAngleRad) * leafReachM * 0.16, 0.35, params.fieldLengthM - 0.35),
    supportY,
    supportZ: clamp(rowCenterZ - sideOffsetM * 0.28, 0.2, params.fieldWidthM - 0.2)
  };
}

export function buildSweepPath(params: SimulationParameters): Vec3[] {
  const fieldProfile = getFieldProfile(params.fieldType);
  const laneCenters =
    fieldProfile.cropVisualStyle === "orchard"
      ? orchardSweepLaneCenters(params)
      : fieldProfile.cropVisualStyle === "greenhouse"
        ? greenhouseAisleCenters(params)
      : (() => {
          const lanes: number[] = [];
          for (let z = params.laneSpacingM * 0.5; z < params.fieldWidthM; z += params.laneSpacingM) {
            lanes.push(z);
          }
          return lanes;
        })();

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
  // A neonicotinoid perimeter treatment intercepts a fraction of invading beetles
  // at the field edge, so fewer reach the crop for the drone to hunt.
  const borderPassThrough = params.neonicBorderEnabled
    ? Math.max(0, 1 - params.borderInterceptionFraction)
    : 1;
  const targetCountMean =
    params.edgeDensityPerHectare * fieldAreaHectares * borderPassThrough;
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
      Math.floor(z / params.rowSpacingM),
      0,
      rowCount - 1
    );
    const rowCenter = rowIndex * params.rowSpacingM + params.rowSpacingM * 0.5;
    const canopyOffset = (rng() - 0.5) * params.rowSpacingM * fieldProfile.canopyOffsetFactor;
    const alongRowJitter = (rng() - 0.5) * fieldProfile.alongRowJitterM;
    const baseX = clamp(x + alongRowJitter, 0.4, params.fieldLengthM - 0.4);
    const baseZ = clamp(rowCenter + canopyOffset, 0.2, params.fieldWidthM - 0.2);

    let position = vec3(
      baseX,
      fieldProfile.targetHeightBaseM + rng() * fieldProfile.targetHeightJitterM,
      baseZ
    );
    let supportPosition = null;

    if (fieldProfile.cropVisualStyle === "rice") {
      const ricePlacement = computeRiceLeafTipPlacement(baseX, baseZ, params, fieldProfile, rng);
      position = vec3(ricePlacement.tipX, ricePlacement.tipHeightM, ricePlacement.tipZ);
      supportPosition = vec3(ricePlacement.supportX, ricePlacement.supportY, ricePlacement.supportZ);
    } else if (fieldProfile.cropVisualStyle === "orchard") {
      const orchardPlacement = computeOrchardTargetPlacement(baseX, rowIndex, params, fieldProfile, rng);
      position = vec3(orchardPlacement.targetX, orchardPlacement.targetY, orchardPlacement.targetZ);
      supportPosition = vec3(
        orchardPlacement.supportX,
        orchardPlacement.supportY,
        orchardPlacement.supportZ
      );
    } else if (fieldProfile.cropVisualStyle === "greenhouse") {
      const greenhousePlacement = computeGreenhouseTargetPlacement(baseX, baseZ, params, fieldProfile, rng);
      position = vec3(
        greenhousePlacement.targetX,
        greenhousePlacement.targetY,
        greenhousePlacement.targetZ
      );
      supportPosition = vec3(
        greenhousePlacement.supportX,
        greenhousePlacement.supportY,
        greenhousePlacement.supportZ
      );
    }

    accepted.push({
      id: accepted.length,
      position,
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
