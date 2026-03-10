import { FieldProfile } from "./fieldProfiles";
import { SimulationParameters, Vec3 } from "./types";

const EDGE_MARGIN_M = 1.4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function orchardTreeOriginXM(params: SimulationParameters, profile: FieldProfile): number {
  return Math.max(EDGE_MARGIN_M, profile.canopyRadiusM + 0.7);
}

function orchardMaxTreeXM(params: SimulationParameters, profile: FieldProfile): number {
  return Math.max(orchardTreeOriginXM(params, profile), params.fieldLengthM - orchardTreeOriginXM(params, profile));
}

export function snapOrchardTreeCenterX(
  xM: number,
  params: SimulationParameters,
  profile: FieldProfile
): number {
  const originX = orchardTreeOriginXM(params, profile);
  const treePitchM = Math.max(profile.inRowPlantSpacingM, 0.8);
  const index = Math.round((xM - originX) / treePitchM);
  return clamp(originX + index * treePitchM, originX, orchardMaxTreeXM(params, profile));
}

export function orchardRowCenterZ(rowIndex: number, params: SimulationParameters): number {
  return rowIndex * params.rowSpacingM + params.rowSpacingM * 0.5;
}

export function orchardTreeCenter(
  rowIndex: number,
  xM: number,
  params: SimulationParameters,
  profile: FieldProfile
): Vec3 {
  return {
    x: snapOrchardTreeCenterX(xM, params, profile),
    y: profile.maturePlantHeightM * 0.52,
    z: orchardRowCenterZ(rowIndex, params)
  };
}

export function orchardSweepLaneCenters(params: SimulationParameters): number[] {
  const centers: number[] = [];
  for (let z = 0; z <= params.fieldWidthM; z += params.rowSpacingM) {
    centers.push(clamp(z, 0, params.fieldWidthM));
  }
  if (centers.length === 0 || centers[centers.length - 1] !== params.fieldWidthM) {
    centers.push(params.fieldWidthM);
  }
  return centers;
}

export function enumerateNearbyOrchardTreeCenters(
  position: Vec3,
  params: SimulationParameters,
  profile: FieldProfile,
  radiusRows = 1,
  radiusTrees = 1
): Vec3[] {
  const treePitchM = Math.max(profile.inRowPlantSpacingM, 0.8);
  const originX = orchardTreeOriginXM(params, profile);
  const maxX = orchardMaxTreeXM(params, profile);
  const rowCount = Math.max(1, Math.round(params.fieldWidthM / params.rowSpacingM));
  const nearestRow = clamp(
    Math.round((position.z - params.rowSpacingM * 0.5) / params.rowSpacingM),
    0,
    rowCount - 1
  );
  const nearestTree = Math.round((position.x - originX) / treePitchM);
  const trees: Vec3[] = [];

  for (let rowOffset = -radiusRows; rowOffset <= radiusRows; rowOffset += 1) {
    const rowIndex = clamp(nearestRow + rowOffset, 0, rowCount - 1);
    const rowCenterZ = orchardRowCenterZ(rowIndex, params);
    for (let treeOffset = -radiusTrees; treeOffset <= radiusTrees; treeOffset += 1) {
      const treeIndex = nearestTree + treeOffset;
      const treeCenterX = clamp(originX + treeIndex * treePitchM, originX, maxX);
      trees.push({
        x: treeCenterX,
        y: profile.maturePlantHeightM * 0.52,
        z: rowCenterZ
      });
    }
  }

  return trees;
}
