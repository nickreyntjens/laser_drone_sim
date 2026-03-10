import { clamp } from "./defaults";
import { SimulationParameters, Vec3 } from "./types";

export const GREENHOUSE_BAY_LENGTH_M = 4.2;
export const GREENHOUSE_BAY_WIDTH_M = 4.5;
export const GREENHOUSE_COLUMN_RADIUS_M = 0.08;
export const GREENHOUSE_GUTTER_HEIGHT_M = 3.4;
export const GREENHOUSE_RIDGE_HEIGHT_M = 4.2;

const END_MARGIN_M = 1.8;

export function greenhouseSupportLineCenters(params: SimulationParameters): number[] {
  const centers: number[] = [];
  for (let z = GREENHOUSE_BAY_WIDTH_M; z < params.fieldWidthM; z += GREENHOUSE_BAY_WIDTH_M) {
    if (z > 0.8 && z < params.fieldWidthM - 0.8) {
      centers.push(z);
    }
  }
  return centers;
}

export function greenhouseAisleCenters(params: SimulationParameters): number[] {
  const boundaries = [0, ...greenhouseSupportLineCenters(params), params.fieldWidthM];
  const aisles: number[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    aisles.push((boundaries[index] + boundaries[index + 1]) * 0.5);
  }
  return aisles;
}

export function greenhouseColumnCenters(params: SimulationParameters): Vec3[] {
  const columns: Vec3[] = [];
  const supportLines = greenhouseSupportLineCenters(params);

  for (let x = END_MARGIN_M; x < params.fieldLengthM - END_MARGIN_M + 1e-6; x += GREENHOUSE_BAY_LENGTH_M) {
    for (let index = 0; index < supportLines.length; index += 1) {
      columns.push({
        x,
        y: GREENHOUSE_GUTTER_HEIGHT_M * 0.5,
        z: supportLines[index]
      });
    }
  }

  return columns;
}

export function greenhouseNearestAisleZ(zM: number, params: SimulationParameters): number {
  const aisles = greenhouseAisleCenters(params);
  let best = aisles[0] ?? params.fieldWidthM * 0.5;
  let bestDistance = Math.abs(best - zM);
  for (let index = 1; index < aisles.length; index += 1) {
    const candidate = aisles[index];
    const candidateDistance = Math.abs(candidate - zM);
    if (candidateDistance < bestDistance) {
      best = candidate;
      bestDistance = candidateDistance;
    }
  }
  return best;
}

export function enumerateNearbyGreenhouseColumns(
  position: Vec3,
  params: SimulationParameters,
  radiusBays = 1,
  radiusLines = 1
): Vec3[] {
  const supportLines = greenhouseSupportLineCenters(params);
  if (supportLines.length === 0) {
    return [];
  }

  const nearestBayIndex = Math.round((position.x - END_MARGIN_M) / GREENHOUSE_BAY_LENGTH_M);
  const nearestLineIndex = supportLines.reduce((bestIndex, z, index) => {
    return Math.abs(z - position.z) < Math.abs(supportLines[bestIndex] - position.z) ? index : bestIndex;
  }, 0);

  const columns: Vec3[] = [];
  for (let bayOffset = -radiusBays; bayOffset <= radiusBays; bayOffset += 1) {
    const x = clamp(
      END_MARGIN_M + (nearestBayIndex + bayOffset) * GREENHOUSE_BAY_LENGTH_M,
      END_MARGIN_M,
      params.fieldLengthM - END_MARGIN_M
    );
    for (let lineOffset = -radiusLines; lineOffset <= radiusLines; lineOffset += 1) {
      const lineIndex = nearestLineIndex + lineOffset;
      if (lineIndex < 0 || lineIndex >= supportLines.length) {
        continue;
      }
      columns.push({
        x,
        y: GREENHOUSE_GUTTER_HEIGHT_M * 0.5,
        z: supportLines[lineIndex]
      });
    }
  }

  return columns;
}
