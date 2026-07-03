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
  costPerHa: number;
  missionTimeS: number;
  totalEnergyWh: number;
  targets: number;
  neutralized: number;
  rechargeCycles: number;
}

function runMission(pressure: number): SweepPoint {
  const params = {
    ...defaultParameters,
    edgeDensityPerHectare: pressure,
    farmersPerHectare: 0
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
      `Mission did not complete at pressure=${pressure} within ${MAX_STEPS} steps (mode=${engine.drone.mode})`
    );
  }

  return {
    pressure,
    costPerHa: engine.summary.costPerHectareUsd,
    missionTimeS: engine.summary.totalMissionTimeS,
    totalEnergyWh: engine.summary.totalEnergyWh,
    targets,
    neutralized: engine.summary.beetlesNeutralized,
    rechargeCycles: engine.summary.rechargeCycles
  };
}

const cliPressures = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
const pressures =
  cliPressures.length > 0
    ? cliPressures
    : Array.from({ length: 20 }, (_, i) => 100 + i * 100);

const points: SweepPoint[] = [];
for (const pressure of pressures) {
  const startedAt = Date.now();
  const point = runMission(pressure);
  points.push(point);
  console.error(
    `pressure=${pressure} cost/ha=$${point.costPerHa.toFixed(2)} ` +
      `targets=${point.targets} missionTime=${(point.missionTimeS / 3600).toFixed(2)}h ` +
      `recharges=${point.rechargeCycles} (wall ${(Date.now() - startedAt) / 1000}s)`
  );
}

const output = {
  meta: {
    seed: DEFAULT_SEED,
    farmersPerHectare: 0,
    fieldLengthM: defaultParameters.fieldLengthM,
    fieldWidthM: defaultParameters.fieldWidthM,
    fieldType: defaultParameters.fieldType,
    stepS: STEP_S
  },
  points
};

const outDir = join(dirname(fileURLToPath(import.meta.url)), "out");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "cost-sweep.json");
writeFileSync(outPath, JSON.stringify(output, null, 2));
console.error(`\nWrote ${points.length} points to ${outPath}`);
console.log(JSON.stringify(output));
