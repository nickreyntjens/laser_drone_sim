import { horizontalDistance } from "./math";
import { SimulationParameters, TargetState, Vec3 } from "./types";

const STRIP_FALLBACK_THRESHOLD = 5000;

function cellKey(cellX: number, cellZ: number): string {
  return `${cellX}:${cellZ}`;
}

function stripOrderedRoute(
  params: SimulationParameters,
  targets: TargetState[]
): number[] {
  const bandWidthM = Math.max(params.laneSpacingM * 3, 18);
  const sorted = [...targets].sort((a, b) => {
    const bandA = Math.floor(a.position.x / bandWidthM);
    const bandB = Math.floor(b.position.x / bandWidthM);
    if (bandA !== bandB) {
      return bandA - bandB;
    }

    const ascending = bandA % 2 === 0;
    return ascending ? a.position.z - b.position.z : b.position.z - a.position.z;
  });

  return sorted.map((target) => target.id);
}

// This is a scalable approximation rather than an exact TSP solver.
// For normal target counts it uses a spatially bucketed nearest-neighbor heuristic,
// and for very large infestations it falls back to strip ordering to keep planning bounded.
export function planPreSurveyedTargetRoute(
  params: SimulationParameters,
  origin: Vec3,
  targets: TargetState[]
): number[] {
  if (targets.length <= 1) {
    return targets.map((target) => target.id);
  }

  if (targets.length > STRIP_FALLBACK_THRESHOLD) {
    return stripOrderedRoute(params, targets);
  }

  const cellSizeM = Math.max(params.laneSpacingM * 1.8, params.detectionRadiusM * 1.6, 10);
  const cells = new Map<string, Set<number>>();
  const targetById = new Map<number, TargetState>();
  const targetCell = new Map<number, [number, number]>();

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const cellX = Math.floor(target.position.x / cellSizeM);
    const cellZ = Math.floor(target.position.z / cellSizeM);
    const key = cellKey(cellX, cellZ);
    const bucket = cells.get(key) ?? new Set<number>();
    bucket.add(target.id);
    cells.set(key, bucket);
    targetById.set(target.id, target);
    targetCell.set(target.id, [cellX, cellZ]);
  }

  const maxRadius =
    Math.ceil(params.fieldLengthM / cellSizeM) + Math.ceil(params.fieldWidthM / cellSizeM) + 2;
  const route: number[] = [];
  let currentPoint = origin;

  const removeTarget = (targetId: number): void => {
    const cell = targetCell.get(targetId);
    if (!cell) {
      return;
    }

    const key = cellKey(cell[0], cell[1]);
    const bucket = cells.get(key);
    if (!bucket) {
      return;
    }

    bucket.delete(targetId);
    if (bucket.size === 0) {
      cells.delete(key);
    }
  };

  while (route.length < targets.length) {
    const currentCellX = Math.floor(currentPoint.x / cellSizeM);
    const currentCellZ = Math.floor(currentPoint.z / cellSizeM);
    let bestId: number | null = null;
    let bestDistanceM = Number.POSITIVE_INFINITY;

    for (let radius = 0; radius <= maxRadius && bestId === null; radius += 1) {
      for (let deltaX = -radius; deltaX <= radius; deltaX += 1) {
        for (let deltaZ = -radius; deltaZ <= radius; deltaZ += 1) {
          if (
            radius > 0 &&
            Math.abs(deltaX) !== radius &&
            Math.abs(deltaZ) !== radius
          ) {
            continue;
          }

          const bucket = cells.get(cellKey(currentCellX + deltaX, currentCellZ + deltaZ));
          if (!bucket || bucket.size === 0) {
            continue;
          }

          for (const targetId of bucket) {
            const target = targetById.get(targetId);
            if (!target) {
              continue;
            }

            const candidateDistanceM = horizontalDistance(currentPoint, target.position);
            if (candidateDistanceM < bestDistanceM) {
              bestDistanceM = candidateDistanceM;
              bestId = targetId;
            }
          }
        }
      }
    }

    if (bestId === null) {
      return route.concat(stripOrderedRoute(params, targets.filter((target) => !route.includes(target.id))));
    }

    route.push(bestId);
    removeTarget(bestId);
    const chosenTarget = targetById.get(bestId);
    if (chosenTarget) {
      currentPoint = chosenTarget.position;
    }
  }

  return route;
}
