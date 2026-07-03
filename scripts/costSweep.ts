// Headless cost sweep: runs full missions across a range of pest pressures
// (edgeDensityPerHectare) and records cost per hectare, without a browser.
// Usage:
//   npx tsx scripts/costSweep.ts                 # full sweep 100..2000 step 100
//   npx tsx scripts/costSweep.ts 400             # single pressure value
//   npx tsx scripts/costSweep.ts 100 400 1200    # explicit list
// Output: scripts/out/cost-sweep.json (+ progress on stderr).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MissionEngine } from "../src/sim/engine";
import { DEFAULT_SEED, defaultParameters } from "../src/sim/defaults";

const STEP_S = 0.05;
// Generous cap: 200 sim-hours per mission. Missions that exceed it are reported, not silently dropped.
const MAX_STEPS = (200 * 3600) / STEP_S;

interface SweepPoint {
  pressure: number;
  border: boolean;
  costPerHa: number;
  // per-hectare cost components (sum to costPerHa)
  amortizationPerHa: number;
  batteryPerHa: number;
  electricityPerHa: number;
  borderPerHa: number;
  flightHours: number;
  missionHours: number;
  targets: number;
  neutralized: number;
  rechargeCycles: number;
}

const FIELD_HA =
  (defaultParameters.fieldLengthM * defaultParameters.fieldWidthM) / 10_000;

function runMission(pressure: number, border: boolean): SweepPoint {
  const params = {
    ...defaultParameters,
    edgeDensityPerHectare: pressure,
    farmersPerHectare: 0,
    neonicBorderEnabled: border
  };
  const engine = new MissionEngine(params, DEFAULT_SEED);
  const targets = engine.targets.length;

  let steps = 0;
  while (!engine.summary && steps < MAX_STEPS) {
    // Charging consumes no mission energy; cost depends only on energy drawn,
    // so fast-forwarding recharges is exact, not an approximation.
    if (engine.drone.mode === "charging") {
      engine.skipCharging();
    }
    engine.step(STEP_S);
    steps += 1;
  }

  if (!engine.summary) {
    throw new Error(
      `Mission did not complete at pressure=${pressure} (border=${border}) within ${MAX_STEPS} steps (mode=${engine.drone.mode})`
    );
  }

  const s = engine.summary;
  return {
    pressure,
    border,
    costPerHa: s.costPerHectareUsd,
    amortizationPerHa: s.amortizationCostUsd / FIELD_HA,
    batteryPerHa: s.batteryDepreciationCostUsd / FIELD_HA,
    electricityPerHa: s.energyCostUsd / FIELD_HA,
    borderPerHa: s.borderCostUsd / FIELD_HA,
    flightHours: s.flightTimeS / 3600,
    missionHours: s.totalMissionTimeS / 3600,
    targets,
    neutralized: s.beetlesNeutralized,
    rechargeCycles: s.rechargeCycles
  };
}

const cliPressures = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
const pressures =
  cliPressures.length > 0
    ? cliPressures
    : Array.from({ length: 20 }, (_, i) => 100 + i * 100);

const points: SweepPoint[] = [];
for (const pressure of pressures) {
  for (const border of [false, true]) {
    const startedAt = Date.now();
    const point = runMission(pressure, border);
    points.push(point);
    console.error(
      `pressure=${pressure}${border ? " +border" : "        "} ` +
        `cost/ha=$${point.costPerHa.toFixed(3)} ` +
        `(amort $${point.amortizationPerHa.toFixed(3)} · batt $${point.batteryPerHa.toFixed(3)} · ` +
        `elec $${point.electricityPerHa.toFixed(3)} · border $${point.borderPerHa.toFixed(2)}) ` +
        `flight=${point.flightHours.toFixed(2)}h recharges=${point.rechargeCycles} ` +
        `(wall ${((Date.now() - startedAt) / 1000).toFixed(1)}s)`
    );
  }
}

const output = {
  meta: {
    seed: DEFAULT_SEED,
    farmersPerHectare: 0,
    fieldLengthM: defaultParameters.fieldLengthM,
    fieldWidthM: defaultParameters.fieldWidthM,
    fieldHa: FIELD_HA,
    fieldType: defaultParameters.fieldType,
    stepS: STEP_S,
    costModel: {
      flightMassKg:
        defaultParameters.airframeBaseMassKg +
        defaultParameters.batteryCapacityWh / defaultParameters.batterySpecificEnergyWhPerKg,
      airframeCostUsd: defaultParameters.airframeCostUsd,
      airframeLifeHours: defaultParameters.airframeLifeHours,
      laserCostUsd: defaultParameters.laserCostUsd,
      laserLifeHours: defaultParameters.laserLifeHours,
      maintenanceCostPerFlightHourUsd: defaultParameters.maintenanceCostPerFlightHourUsd,
      batteryCycleLife: defaultParameters.batteryCycleLife,
      batteryReplacementCostUsd: defaultParameters.batteryReplacementCostUsd,
      chargerEfficiency: defaultParameters.chargerEfficiency,
      electricityUsdPerKwh: 0.15,
      borderInterceptionFraction: defaultParameters.borderInterceptionFraction,
      neonicBorderCostPerHectareUsd: defaultParameters.neonicBorderCostPerHectareUsd
    }
  },
  points
};

const outDir = join(dirname(fileURLToPath(import.meta.url)), "out");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "cost-sweep.json");
writeFileSync(outPath, JSON.stringify(output, null, 2));
console.error(`\nWrote ${points.length} points to ${outPath}`);
console.log(JSON.stringify(output));
