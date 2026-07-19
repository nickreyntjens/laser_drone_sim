import { AimingLabParameters } from "../sim/aiming";
import { SimulationParameters } from "../sim/types";

export type ScenarioSectionId =
  | "field"
  | "drone"
  | "laser"
  | "battery"
  | "mission"
  | "aiming";

export interface ScenarioSectionDefinition {
  id: ScenarioSectionId;
  label: string;
  description: string;
}

export interface SavedScenario {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sections: ScenarioSectionId[];
  simulationPatch: Partial<SimulationParameters>;
  aimingPatch: Partial<AimingLabParameters>;
  seed?: number;
}

export interface PersistentAppState {
  version: 1;
  activeParams: SimulationParameters;
  draftParams: SimulationParameters;
  aimingLabParams: AimingLabParameters;
  seed: number;
  playbackSpeed: number;
}

export interface PersistentDefaults {
  simulation: SimulationParameters;
  aiming: AimingLabParameters;
  seed: number;
  playbackSpeed: number;
}

export interface AppliedScenarioState {
  nextSimulationParams: SimulationParameters;
  nextAimingParams: AimingLabParameters;
  nextSeed: number | null;
  updatesSimulation: boolean;
  updatesAiming: boolean;
}

export interface ScenarioExportPayload {
  version: 1;
  exportedAt: string;
  scenario: SavedScenario;
}

export const PERSISTENT_APP_STATE_STORAGE_KEY = "laser-drone-sim:persistent-state:v2";
export const SAVED_SCENARIOS_STORAGE_KEY = "laser-drone-sim:scenarios:v1";

const SIMULATION_SECTION_KEYS: Record<Exclude<ScenarioSectionId, "aiming">, Array<keyof SimulationParameters>> = {
  field: [
    "fieldType",
    "fieldLengthM",
    "fieldWidthM",
    "edgeDensityPerHectare",
    "gradientStrength",
    "farmersPerHectare",
    "rowSpacingM",
    "laneSpacingM",
    "detectionRadiusM",
    "searchAltitudeM",
    "engageAltitudeM",
    "neonicBorderEnabled",
    "borderInterceptionFraction",
    "neonicBorderCostPerHectareUsd"
  ],
  drone: [
    "droneMassKg",
    "airframeBaseMassKg",
    "batterySpecificEnergyWhPerKg",
    "cruiseSpeedMps",
    "effectiveDragAreaM2",
    "maxHorizontalAccelMps2",
    "maxVerticalSpeedMps",
    "rotorDiskAreaM2",
    "propulsionEfficiency",
    "avionicsPowerW"
  ],
  laser: [
    "laserPowerW",
    "engagementDwellS",
    "maxFiringSpeedMps",
    "safetyFocalDistanceM",
    "safetyStartingApertureMm",
    "aimDurationS",
    "confirmDurationS"
  ],
  battery: [
    "batteryCapacityWh",
    "batteryCycleLife",
    "batteryReplacementCostUsd",
    "reserveBatteryPct",
    "rechargeTimeMin",
    "chargerEfficiency",
    "airframeCostUsd",
    "airframeLifeHours",
    "laserCostUsd",
    "laserLifeHours",
    "maintenanceCostPerFlightHourUsd"
  ],
  mission: [
    "targetingMode",
    "targetLayout",
    "showOnlySelectedTargetMarkers"
  ]
};

const AIMING_KEYS: Array<keyof AimingLabParameters> = [
  "durationS",
  "timeStepS",
  "cameraFps",
  "exposureTimeMs",
  "cameraFovMrad",
  "laserPowerW",
  "laserSpotDiameterMm",
  "processingLatencyMs",
  "driverLatencyMs",
  "memsNaturalFrequencyHz",
  "memsDampingRatio",
  "memsMaxAngleMrad",
  "pidKp",
  "pidKi",
  "pidKd",
  "integralLimitMrad",
  "commandGeneratorMode",
  "predictorLeadMs",
  "centroidVelocityGain",
  "imuFeedforwardGain",
  "imuLowPassHz",
  "imuRateLeadGain",
  "phasePredictorBaseFrequencyHz",
  "dmdWindowSize",
  "dmdCommandPeriodMs",
  "pixelNoisePx",
  "gimbalSuppressionPct",
  "dampingSuppressionPct",
  "lowFrequencyDisturbanceMrad",
  "lowFrequencyHz",
  "highFrequencyDisturbanceMrad",
  "highFrequencyHz",
  "targetStepMrad",
  "targetStepTimeS",
  "targetSwayMrad",
  "targetSwayHz",
  "targetBiasXMrad",
  "targetBiasYMrad",
  "mirrorPitchBiasMrad",
  "mirrorRollBiasMrad",
  "lockThresholdMrad",
  "targetMassMg",
  "targetSpecificHeatJPerKgC",
  "targetHeatLossWPerC",
  "targetLethalTemperatureC",
  "targetAbsorptivityPct",
  "laserEngageCoveragePct"
];

export const SCENARIO_SECTIONS: ScenarioSectionDefinition[] = [
  {
    id: "field",
    label: "Field + pest pressure",
    description: "Crop type, field size, infestation pressure, gradient, farmers, and search geometry."
  },
  {
    id: "drone",
    label: "Drone specs",
    description: "Mass, cruise speed, drag, acceleration, propulsion, and avionics."
  },
  {
    id: "laser",
    label: "Laser + engagement",
    description: "Laser power, dwell, firing speed, aiming, confirmation, and nominal safety optics."
  },
  {
    id: "battery",
    label: "Battery + economics",
    description: "Battery size, reserve, recharge time, cycle life, and replacement cost."
  },
  {
    id: "mission",
    label: "Mission logic",
    description: "Target intelligence mode and marker visibility."
  },
  {
    id: "aiming",
    label: "Aiming lab",
    description: "Camera, shutter, MEMS, predictor, and thermal target parameters."
  }
];

function pickKeys<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Partial<Pick<T, K>> {
  const next: Partial<Pick<T, K>> = {};
  keys.forEach((key) => {
    next[key] = source[key];
  });
  return next;
}

function mergePatch<T extends object>(defaults: T, patch: Partial<T> | null | undefined): T {
  return {
    ...defaults,
    ...(patch ?? {})
  };
}

export function buildScenarioFromState(input: {
  name: string;
  sections: ScenarioSectionId[];
  activeParams: SimulationParameters;
  aimingParams: AimingLabParameters;
  seed: number;
  existingId?: string;
  createdAt?: string;
}): SavedScenario {
  const sections = Array.from(new Set(input.sections));
  const simulationKeys = sections
    .filter((section): section is Exclude<ScenarioSectionId, "aiming"> => section !== "aiming")
    .flatMap((section) => SIMULATION_SECTION_KEYS[section]);
  const simulationPatch = pickKeys(input.activeParams, simulationKeys);
  const aimingPatch = sections.includes("aiming") ? pickKeys(input.aimingParams, AIMING_KEYS) : {};
  const nowIso = new Date().toISOString();

  return {
    id: input.existingId ?? `scenario-${Math.random().toString(36).slice(2, 10)}`,
    name: input.name.trim(),
    createdAt: input.createdAt ?? nowIso,
    updatedAt: nowIso,
    sections,
    simulationPatch,
    aimingPatch,
    seed: simulationKeys.length > 0 ? input.seed : undefined
  };
}

export function applyScenarioToState(input: {
  scenario: SavedScenario;
  simulationParams: SimulationParameters;
  aimingParams: AimingLabParameters;
}): AppliedScenarioState {
  const updatesSimulation = Object.keys(input.scenario.simulationPatch).length > 0;
  const updatesAiming = Object.keys(input.scenario.aimingPatch).length > 0;

  return {
    nextSimulationParams: updatesSimulation
      ? mergePatch(input.simulationParams, input.scenario.simulationPatch)
      : input.simulationParams,
    nextAimingParams: updatesAiming
      ? mergePatch(input.aimingParams, input.scenario.aimingPatch)
      : input.aimingParams,
    nextSeed: updatesSimulation && typeof input.scenario.seed === "number" ? input.scenario.seed : null,
    updatesSimulation,
    updatesAiming
  };
}

export function createPersistentAppState(input: {
  activeParams: SimulationParameters;
  draftParams: SimulationParameters;
  aimingLabParams: AimingLabParameters;
  seed: number;
  playbackSpeed: number;
}): PersistentAppState {
  return {
    version: 1,
    activeParams: input.activeParams,
    draftParams: input.draftParams,
    aimingLabParams: input.aimingLabParams,
    seed: input.seed,
    playbackSpeed: input.playbackSpeed
  };
}

export function readPersistentAppState(
  storageValue: string | null,
  defaults: PersistentDefaults
): PersistentAppState {
  if (!storageValue) {
    return createPersistentAppState({
      activeParams: defaults.simulation,
      draftParams: defaults.simulation,
      aimingLabParams: defaults.aiming,
      seed: defaults.seed,
      playbackSpeed: defaults.playbackSpeed
    });
  }

  try {
    const parsed = JSON.parse(storageValue) as Partial<PersistentAppState>;
    return {
      version: 1,
      activeParams: mergePatch(defaults.simulation, parsed.activeParams),
      draftParams: mergePatch(defaults.simulation, parsed.draftParams),
      aimingLabParams: mergePatch(defaults.aiming, parsed.aimingLabParams),
      seed: typeof parsed.seed === "number" ? parsed.seed : defaults.seed,
      playbackSpeed:
        typeof parsed.playbackSpeed === "number" ? parsed.playbackSpeed : defaults.playbackSpeed
    };
  } catch {
    return createPersistentAppState({
      activeParams: defaults.simulation,
      draftParams: defaults.simulation,
      aimingLabParams: defaults.aiming,
      seed: defaults.seed,
      playbackSpeed: defaults.playbackSpeed
    });
  }
}

export function readSavedScenarios(storageValue: string | null): SavedScenario[] {
  if (!storageValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(storageValue) as SavedScenario[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (scenario) =>
        typeof scenario?.id === "string" &&
        typeof scenario?.name === "string" &&
        Array.isArray(scenario?.sections)
    );
  } catch {
    return [];
  }
}

export function serializeScenarioExport(scenario: SavedScenario): string {
  const payload: ScenarioExportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    scenario
  };
  return JSON.stringify(payload, null, 2);
}

export function parseScenarioImport(raw: string): SavedScenario {
  const parsed = JSON.parse(raw) as ScenarioExportPayload | SavedScenario;
  const scenario = "scenario" in parsed ? parsed.scenario : parsed;
  if (
    !scenario ||
    typeof scenario.id !== "string" ||
    typeof scenario.name !== "string" ||
    !Array.isArray(scenario.sections)
  ) {
    throw new Error("Imported file is not a valid scenario.");
  }
  return {
    ...scenario,
    id: `scenario-${Math.random().toString(36).slice(2, 10)}`,
    updatedAt: new Date().toISOString()
  };
}
