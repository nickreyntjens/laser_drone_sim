import { clamp } from "./defaults";
import { NOMINAL_FARMER_HEIGHT_M } from "./rendering";
import { FarmerState, FieldType, SimulationParameters, Vec3 } from "./types";
import { nextFarmerChatterLine } from "../content/farmerChatter";

const FARMER_SHOULDER_WIDTH_M = 0.5;
const FARMER_BASE_SPEED_MPS = 0.9;
const FARMER_MAX_COUNT = 18;
const FARMER_SERVICE_MARGIN_M = 6;
const FARMER_TRACKING_GAIN = 0.7;
const FARMER_MAX_Z_OFFSET_M = 5;
const FARMER_PRESENTATION_RANGE_M = 12;
const FARMER_PLACARD_RANGE_M = 16;
const FARMER_PRESENTATION_SLOWDOWN = 0.25;
const FARMER_PRESENTATION_CYCLE_S = 54;
const FARMER_DINNER_CYCLE_S = 86;
const FARMER_DINNER_RANGE_M = 18;
const FARMER_DINNER_MEET_DISTANCE_M = 1.2;
const FARMER_DINNER_WINDOW_S = 14;

export interface FarmerDinnerState {
  callerId: number | null;
  responderId: number | null;
  callerLine: string | null;
  responderLine: string | null;
  phase: "approach" | "announce" | "reply" | "depart";
}

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

function nearbyFarmers(
  farmers: InternalFarmerState[],
  dronePosition: Vec3,
  rangeM: number
): InternalFarmerState[] {
  return farmers.filter((farmer) => horizontalDistanceToPoint(farmer.position, dronePosition) <= rangeM);
}

function presentationWindowForCycle(
  cycleIndex: number,
  mode: "chatter" | "placard"
): { startS: number; endS: number } {
  const cycleJitterS = (hash(cycleIndex + 0.31 + 7.1) - 0.5) * 3.2;
  const cycleS = FARMER_PRESENTATION_CYCLE_S + cycleJitterS;
  const cycleStartS = cycleIndex * FARMER_PRESENTATION_CYCLE_S;
  const visibleFraction =
    mode === "placard"
      ? clamp(0.58 + hash(cycleIndex + 0.77 + 2.4) * 0.16, 0.54, 0.74)
      : clamp(0.29 + hash(cycleIndex + 0.77 + 2.4) * 0.08, 0.27, 0.37);
  return {
    startS: cycleStartS,
    endS: cycleStartS + Math.max(1.2, cycleS * visibleFraction)
  };
}

function activePresentationCycleIndex(
  missionElapsedS: number,
  mode: "chatter" | "placard"
): number | null {
  if (missionElapsedS < 10) {
    return null;
  }

  const cycleIndex = Math.floor(missionElapsedS / FARMER_PRESENTATION_CYCLE_S);
  const window = presentationWindowForCycle(cycleIndex, mode);
  if (missionElapsedS < window.startS || missionElapsedS > window.endS) {
    return null;
  }

  return cycleIndex;
}

function assignDinnerPair(
  farmers: InternalFarmerState[],
  dronePosition: Vec3,
  cycleIndex: number
): { callerId: number | null; responderId: number | null } {
  const nearby = nearbyFarmers(farmers, dronePosition, FARMER_DINNER_RANGE_M);
  const callerGender = cycleIndex % 2 === 0 ? "female" : "male";
  const responderGender = callerGender === "female" ? "male" : "female";
  const callers = nearby.filter((farmer) => farmer.gender === callerGender);
  const responders = nearby.filter((farmer) => farmer.gender === responderGender);

  if (callers.length === 0 || responders.length === 0) {
    return { callerId: null, responderId: null };
  }

  const caller = callers[Math.floor(hash(cycleIndex + 4.7) * callers.length)];
  const responder = responders
    .slice()
    .sort(
      (left, right) =>
        horizontalDistanceToPoint(left.position, caller.position) -
        horizontalDistanceToPoint(right.position, caller.position)
    )[0];

  return { callerId: caller?.id ?? null, responderId: responder?.id ?? null };
}

export function activeFarmerDinnerState(
  farmers: InternalFarmerState[],
  dronePosition: Vec3,
  missionElapsedS: number
): FarmerDinnerState {
  if (missionElapsedS < 14) {
    return { callerId: null, responderId: null, callerLine: null, responderLine: null, phase: "approach" };
  }

  const cycleIndex = Math.floor(missionElapsedS / FARMER_DINNER_CYCLE_S);
  if (hash(cycleIndex + 6.9) < 0.58) {
    return { callerId: null, responderId: null, callerLine: null, responderLine: null, phase: "approach" };
  }

  const cycleStartS = cycleIndex * FARMER_DINNER_CYCLE_S;
  const elapsedInCycleS = missionElapsedS - cycleStartS;
  if (elapsedInCycleS < 0 || elapsedInCycleS > FARMER_DINNER_WINDOW_S) {
    return { callerId: null, responderId: null, callerLine: null, responderLine: null, phase: "approach" };
  }

  const pair = assignDinnerPair(farmers, dronePosition, cycleIndex);
  if (pair.callerId === null || pair.responderId === null) {
    return { callerId: null, responderId: null, callerLine: null, responderLine: null, phase: "approach" };
  }

  const phase =
    elapsedInCycleS < 5
      ? "approach"
      : elapsedInCycleS < 8
        ? "announce"
        : elapsedInCycleS < 10
          ? "reply"
          : "depart";

  return {
    callerId: pair.callerId,
    responderId: pair.responderId,
    callerLine: phase === "announce" ? "Dinner is ready" : null,
    responderLine: phase === "reply" ? "ok" : null,
    phase
  };
}

export function activeFarmerChatterState(
  farmers: InternalFarmerState[],
  fieldType: FieldType,
  dronePosition: Vec3,
  missionElapsedS: number
): { farmerId: number | null; line: string | null } {
  const cycleIndex = activePresentationCycleIndex(missionElapsedS, "chatter");
  if (cycleIndex === null || hash(cycleIndex + 0.41 + 19.2) < 0.5) {
    return { farmerId: null, line: null };
  }
  const nearby = nearbyFarmers(farmers, dronePosition, FARMER_PRESENTATION_RANGE_M);
  if (nearby.length === 0) {
    return { farmerId: null, line: null };
  }

  const speaker = nearby[cycleIndex % nearby.length];
  return { farmerId: speaker?.id ?? null, line: nextFarmerChatterLine(fieldType, cycleIndex) };
}

export function activeFarmerPlacardState(
  farmers: InternalFarmerState[],
  dronePosition: Vec3,
  missionElapsedS: number
): { farmerId: number | null; label: string | null } {
  const cycleIndex = activePresentationCycleIndex(missionElapsedS, "placard");
  if (cycleIndex === null || hash(cycleIndex + 0.41 + 19.2) >= 0.5) {
    return { farmerId: null, label: null };
  }
  const nearby = nearbyFarmers(farmers, dronePosition, FARMER_PLACARD_RANGE_M);
  if (nearby.length === 0) {
    return { farmerId: null, label: null };
  }

  const speaker = nearby[(cycleIndex + 1) % nearby.length];
  const placards = [
    "Photonic Insecticides",
    "No more pesticides",
    "I want chocolat",
    "Free willy!",
    "No placards!",
    "Potatos have rights!",
    "Ban white socks!",
    "Smorks are the future!",
    "Spants are the future!",
    "I'm serious!",
    "Holahoops are cool!",
    "I'm a proud 3D figure!"
  ] as const;
  const labelIndex = Math.floor(hash(cycleIndex + 0.63 + 8.7) * placards.length);
  return { farmerId: speaker?.id ?? null, label: placards[labelIndex] };
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
      gender: index % 2 === 0 ? "female" : "male",
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
  const activeChatter = activeFarmerChatterState(farmers, params.fieldType, dronePosition, missionElapsedS);
  const activePlacard = activeFarmerPlacardState(farmers, dronePosition, missionElapsedS);
  const activeDinner = activeFarmerDinnerState(farmers, dronePosition, missionElapsedS);
  const dinnerCaller =
    activeDinner.callerId === null ? null : farmers.find((farmer) => farmer.id === activeDinner.callerId) ?? null;
  const dinnerResponder =
    activeDinner.responderId === null
      ? null
      : farmers.find((farmer) => farmer.id === activeDinner.responderId) ?? null;

  for (let index = 0; index < farmers.length; index += 1) {
    const farmer = farmers[index];
    const sway = Math.sin(missionElapsedS * 0.22 + farmer.swayPhase);
    let desiredX = clamp(dronePosition.x + farmer.offsetXM + sway * 3.2, minX, maxX);
    let desiredZ = clamp(
      farmer.baseZ + (dronePosition.z - farmer.baseZ) * FARMER_TRACKING_GAIN + sway * 0.8,
      Math.max(1.5, farmer.baseZ - FARMER_MAX_Z_OFFSET_M),
      Math.min(params.fieldWidthM - 1.5, farmer.baseZ + FARMER_MAX_Z_OFFSET_M)
    );

    if (activeDinner.callerId === farmer.id && dinnerResponder) {
      if (activeDinner.phase === "approach" || activeDinner.phase === "announce" || activeDinner.phase === "reply") {
        desiredX = dinnerResponder.position.x - Math.cos(dinnerResponder.headingRad) * FARMER_DINNER_MEET_DISTANCE_M;
        desiredZ = dinnerResponder.position.z - Math.sin(dinnerResponder.headingRad) * FARMER_DINNER_MEET_DISTANCE_M;
      } else {
        desiredX = clamp(maxX - 2.5, minX, maxX);
        desiredZ = clamp(dinnerResponder.baseZ + 1.2, 1.5, params.fieldWidthM - 1.5);
      }
    } else if (activeDinner.responderId === farmer.id && dinnerCaller) {
      if (activeDinner.phase === "approach") {
        desiredX = clamp(farmer.position.x, minX, maxX);
        desiredZ = clamp(farmer.position.z, 1.5, params.fieldWidthM - 1.5);
      } else if (activeDinner.phase === "announce" || activeDinner.phase === "reply") {
        desiredX = clamp(farmer.position.x, minX, maxX);
        desiredZ = clamp(farmer.position.z, 1.5, params.fieldWidthM - 1.5);
      } else {
        desiredX = clamp(maxX - 1.2, minX, maxX);
        desiredZ = clamp(farmer.baseZ - 1.2, 1.5, params.fieldWidthM - 1.5);
      }
    }

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
      const presentationSlowdown =
        activeChatter.farmerId === farmer.id ||
        activePlacard.farmerId === farmer.id ||
        activeDinner.callerId === farmer.id ||
        activeDinner.responderId === farmer.id
          ? FARMER_PRESENTATION_SLOWDOWN
          : 1;
      const stepDistance = Math.min(farmer.speedMps * presentationSlowdown * simDt, moveDistance);
      farmer.position.x += (dx / moveDistance) * stepDistance;
      farmer.position.z += (dz / moveDistance) * stepDistance;
      farmer.headingRad = Math.atan2(dz, dx);
    }
  }
}

export function horizontalDistanceToPoint(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
