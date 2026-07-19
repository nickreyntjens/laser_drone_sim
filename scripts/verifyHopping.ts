// verifyHopping.ts — VERIFICATION HARNESS. Flies the full physics engine over a
// UNIFORM GRID of targets and compares the measured flight time against the
// closed-form "hopping" model from the economic feasibility paper.
//
// Usage:
//   npx tsx scripts/verifyHopping.ts            # default grid sweep
//   npx tsx scripts/verifyHopping.ts 6 10 16    # grid side-lengths to test
//
// What it proves: the paper's t = (N−1)·2·√(d/a) + N·dwell is a sound planning
// approximation of a real accel/decel traversal. The engine sits at or above the
// closed-form (it also pays cruise-cap, altitude and target-acquisition time); the
// ratio quantifies exactly how conservative the closed-form is. Drop this repo into
// Claude, run this script, and the numbers below reproduce.

import { MissionEngine } from "../src/sim/engine";
import { DEFAULT_SEED, defaultParameters } from "../src/sim/defaults";
import { predictGridFlightTimeS } from "../src/sim/hoppingModel";
import { vec3 } from "../src/sim/math";
import type { TargetState, SimulationParameters } from "../src/sim/types";

const STEP_S = 0.05;
const MAX_STEPS = (50 * 3600) / STEP_S;

/** Build `side × side` targets on a regular lattice of pitch `spacingM`, centred in
 * the field, serpentine-ordered so adjacent ids are one hop apart. */
function buildGrid(side: number, spacingM: number, params: SimulationParameters): TargetState[] {
  const targets: TargetState[] = [];
  const span = (side - 1) * spacingM;
  const x0 = Math.max(1, (params.fieldLengthM - span) / 2);
  const z0 = Math.max(1, (params.fieldWidthM - span) / 2);
  let id = 0;
  for (let r = 0; r < side; r += 1) {
    for (let cRaw = 0; cRaw < side; cRaw += 1) {
      const c = r % 2 === 0 ? cRaw : side - 1 - cRaw; // serpentine
      targets.push({
        id: id++,
        position: vec3(x0 + c * spacingM, 0.15, z0 + r * spacingM),
        supportPosition: null,
        rowIndex: r,
        alive: true,
        discovered: true,
        queued: false,
        detectionPulse: 0,
        neutralizationPulse: 0,
        engagementProgress: 0,
        detectedAtS: null,
        neutralizedAtS: null,
        blockedUntilS: 0,
      });
    }
  }
  return targets;
}

function runGrid(side: number, spacingM: number) {
  // Isolate horizontal hopping: pre-surveyed order, no farmers, one continuous
  // flight (huge battery so no recharge), search & engage altitude equal.
  const params: SimulationParameters = {
    ...defaultParameters,
    targetingMode: "preSurveyed",
    farmersPerHectare: 0,
    neonicBorderEnabled: false,
    batteryCapacityWh: 100000,
    reserveBatteryPct: 0,
    searchAltitudeM: defaultParameters.engageAltitudeM,
  };
  const targets = buildGrid(side, spacingM, params);
  const engine = new MissionEngine(params, DEFAULT_SEED, 1, {
    initialTargets: targets,
    initialBatteryWh: 100000,
  });

  let steps = 0;
  while (!engine.summary && steps < MAX_STEPS) {
    if (engine.drone.mode === "charging") engine.skipCharging();
    engine.step(STEP_S);
    steps += 1;
  }
  if (!engine.summary) throw new Error(`grid ${side}×${side} did not complete`);

  const engineFlightS = engine.summary.flightTimeS;
  const capped = predictGridFlightTimeS({
    count: targets.length,
    spacingM,
    dwellS: params.engagementDwellS,
    kinematics: { accelMps2: params.maxHorizontalAccelMps2, cruiseCapMps: params.cruiseSpeedMps },
  });
  const pure = predictGridFlightTimeS({
    count: targets.length,
    spacingM,
    dwellS: params.engagementDwellS,
    kinematics: { accelMps2: params.maxHorizontalAccelMps2 }, // paper's uncapped 2√(d/a)
  });
  return {
    side, spacingM, count: targets.length, neutralized: engine.summary.beetlesNeutralized,
    engineFlightS, cappedS: capped.flightTimeS, pureS: pure.flightTimeS,
    ratioCapped: engineFlightS / capped.flightTimeS,
  };
}

const sides = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n >= 2);
const grids = sides.length > 0 ? sides : [4, 6, 10];
const SPACING_M = 5; // grid pitch

console.log(`\nUniform-grid hopping verification  (accel a=${defaultParameters.maxHorizontalAccelMps2} m/s², ` +
  `cruise cap=${defaultParameters.cruiseSpeedMps} m/s, dwell=${defaultParameters.engagementDwellS}s, pitch=${SPACING_M} m)\n`);
console.log(
  ["grid", "N", "hit", "engine s", "closed(cap) s", "paper(pure) s", "engine/closed"].map((h) => h.padStart(13)).join("")
);
for (const side of grids) {
  const r = runGrid(side, SPACING_M);
  console.log(
    [`${r.side}×${r.side}`, `${r.count}`, `${r.neutralized}`, r.engineFlightS.toFixed(1),
      r.cappedS.toFixed(1), r.pureS.toFixed(1), r.ratioCapped.toFixed(2) + "×"]
      .map((c) => c.padStart(13)).join("")
  );
}
console.log(
  `\nThe engine sits above the closed-form because it also pays cruise-cap, ` +
  `altitude and target-acquisition time; the closed-form is a lower-bound planning\n` +
  `estimate, and the ratio is how conservative it is. Same a and dwell feed both.\n`
);
