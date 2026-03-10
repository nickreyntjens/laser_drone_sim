import { clamp } from "./defaults";
import { NOMINAL_FARMER_HEIGHT_M } from "./rendering";
import { FarmerState, SimulationParameters, Vec3 } from "./types";

const FARMER_SHOULDER_WIDTH_M = 0.5;
const FARMER_BASE_SPEED_MPS = 0.9;
const FARMER_MAX_COUNT = 18;
const FARMER_SERVICE_MARGIN_M = 6;
const FARMER_TRACKING_GAIN = 0.7;
const FARMER_MAX_Z_OFFSET_M = 5;

export interface InternalFarmerState extends FarmerState {
  baseZ: number;
  offsetXM: number;
  swayPhase: number;
  speedMps: number;
}

function hash(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
}

export function initializeFarmers(
  params: SimulationParameters,
  seed: number
): InternalFarmerState[] {
  const fieldAreaHectares = (params.fieldLengthM * params.fieldWidthM) / 10_000;
  const requestedCount = Math.round(fieldAreaHectares * params.farmersPerHectare);
  const farmerCount = clamp(requestedCount, 0, FARMER_MAX_COUNT);

  return Array.from({ length: farmerCount }, (_, index) => {
    const n1 = hash(seed + index * 17.1);
    const n2 = hash(seed + index * 31.7);
    const n3 = hash(seed + index * 53.9);
    const baseZ = clamp(
      (index + 0.5) * (params.fieldWidthM / Math.max(farmerCount, 1)) + (n1 - 0.5) * 8,
      3,
      params.fieldWidthM - 3
    );
    const startX = clamp(n2 * params.fieldLengthM, 0, params.fieldLengthM);

    return {
      id: index,
      position: {
        x: startX,
        y: 0,
        z: baseZ
      },
      headingRad: 0,
      heightM: NOMINAL_FARMER_HEIGHT_M,
      shoulderWidthM: FARMER_SHOULDER_WIDTH_M,
      baseZ,
      offsetXM: (n3 - 0.5) * 10,
      swayPhase: n1 * Math.PI * 2,
      speedMps: FARMER_BASE_SPEED_MPS * (0.9 + n2 * 0.35)
    };
  });
}

export function stepFarmers(
  farmers: InternalFarmerState[],
  params: SimulationParameters,
  dronePosition: Vec3,
  missionElapsedS: number,
  simDt: number
): void {
  const minX = -FARMER_SERVICE_MARGIN_M;
  const maxX = params.fieldLengthM + FARMER_SERVICE_MARGIN_M;

  for (let index = 0; index < farmers.length; index += 1) {
    const farmer = farmers[index];
    const sway = Math.sin(missionElapsedS * 0.22 + farmer.swayPhase);
    const desiredX = clamp(
      dronePosition.x + farmer.offsetXM + sway * 3.2,
      minX,
      maxX
    );
    const desiredZ = clamp(
      farmer.baseZ + (dronePosition.z - farmer.baseZ) * FARMER_TRACKING_GAIN + sway * 0.8,
      Math.max(1.5, farmer.baseZ - FARMER_MAX_Z_OFFSET_M),
      Math.min(params.fieldWidthM - 1.5, farmer.baseZ + FARMER_MAX_Z_OFFSET_M)
    );

    let dx = desiredX - farmer.position.x;
    let dz = desiredZ - farmer.position.z;
    const distance = Math.hypot(dx, dz);

    const droneDx = farmer.position.x - dronePosition.x;
    const droneDz = farmer.position.z - dronePosition.z;
    const droneDistance = Math.hypot(droneDx, droneDz);
    if (droneDistance < 1.1 && droneDistance > 1e-6) {
      dx += (droneDx / droneDistance) * (1.1 - droneDistance) * 1.8;
      dz += (droneDz / droneDistance) * (1.1 - droneDistance) * 1.8;
    }

    const moveDistance = Math.hypot(dx, dz);
    if (moveDistance > 1e-6) {
      const stepDistance = Math.min(farmer.speedMps * simDt, moveDistance);
      farmer.position.x += (dx / moveDistance) * stepDistance;
      farmer.position.z += (dz / moveDistance) * stepDistance;
      farmer.headingRad = Math.atan2(dz, dx);
    }
  }
}

export function horizontalDistanceToPoint(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
