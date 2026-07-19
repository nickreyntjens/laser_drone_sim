import { describe, it, expect } from "vitest";
import { hopTimeS, predictGridFlightTimeS, paperSliceTimeS } from "./hoppingModel";
import { MissionEngine } from "./engine";
import { DEFAULT_SEED, defaultParameters } from "./defaults";
import { vec3 } from "./math";
import type { TargetState, SimulationParameters } from "./types";

describe("hoppingModel (closed form)", () => {
  it("triangular hop time is exactly 2·√(d/a) when the cruise cap is not reached", () => {
    // v_peak = √(a·d) = √(3.4·5) = 4.12 m/s < 8 → triangular
    expect(hopTimeS(5, { accelMps2: 3.4, cruiseCapMps: 8 })).toBeCloseTo(2 * Math.sqrt(5 / 3.4), 9);
    expect(hopTimeS(5, { accelMps2: 3.4 })).toBeCloseTo(2 * Math.sqrt(5 / 3.4), 9);
  });

  it("a cruise cap makes long hops slower than the triangular ideal (trapezoid)", () => {
    const d = 200, a = 3.4, vmax = 8;
    // √(a·d) = √680 = 26 m/s ≫ 8 → capped
    const capped = hopTimeS(d, { accelMps2: a, cruiseCapMps: vmax });
    const triangle = 2 * Math.sqrt(d / a);
    expect(capped).toBeGreaterThan(triangle);
    // closed trapezoid value: 2·(vmax/a) + (d − vmax²/a)/vmax
    expect(capped).toBeCloseTo(2 * (vmax / a) + (d - (vmax * vmax) / a) / vmax, 9);
  });

  it("zero distance costs zero time", () => {
    expect(hopTimeS(0, { accelMps2: 3.4 })).toBe(0);
  });

  it("visiting N grid points is N−1 hops plus N dwells", () => {
    const p = predictGridFlightTimeS({ count: 16, spacingM: 5, dwellS: 0.2, kinematics: { accelMps2: 3.4 } });
    expect(p.hops).toBe(15);
    expect(p.dwellTotalS).toBeCloseTo(16 * 0.2, 9);
    expect(p.flightTimeS).toBeCloseTo(15 * hopTimeS(5, { accelMps2: 3.4 }) + 16 * 0.2, 9);
  });

  it("flight time grows monotonically with grid size and shrinks with acceleration", () => {
    const t = (n: number, a: number) => predictGridFlightTimeS({ count: n, spacingM: 5, dwellS: 0.2, kinematics: { accelMps2: a } }).flightTimeS;
    expect(t(36, 3.4)).toBeGreaterThan(t(16, 3.4));
    expect(t(36, 6)).toBeLessThan(t(36, 3.4));
  });

  it("paper slice formula matches 2·√(N·D/a) + N·t_act", () => {
    expect(paperSliceTimeS(40, 30, 5, 1)).toBeCloseTo(2 * Math.sqrt((40 * 30) / 5) + 40 * 1, 9);
  });
});

// ---- the actual verification: full engine vs closed form on a uniform grid ----

function buildGrid(side: number, spacingM: number, params: SimulationParameters): TargetState[] {
  const targets: TargetState[] = [];
  const span = (side - 1) * spacingM;
  const x0 = Math.max(1, (params.fieldLengthM - span) / 2);
  const z0 = Math.max(1, (params.fieldWidthM - span) / 2);
  let id = 0;
  for (let r = 0; r < side; r += 1) {
    for (let cRaw = 0; cRaw < side; cRaw += 1) {
      const c = r % 2 === 0 ? cRaw : side - 1 - cRaw;
      targets.push({
        id: id++, position: vec3(x0 + c * spacingM, 0.15, z0 + r * spacingM), supportPosition: null,
        rowIndex: r, alive: true, discovered: true, queued: false, detectionPulse: 0,
        neutralizationPulse: 0, engagementProgress: 0, detectedAtS: null, neutralizedAtS: null, blockedUntilS: 0,
      });
    }
  }
  return targets;
}

describe("hoppingModel vs full physics engine (uniform grid)", () => {
  it("the engine clears the grid and sits at or above the closed form, within ~3×", () => {
    const side = 6, spacingM = 5;
    const params: SimulationParameters = {
      ...defaultParameters, targetingMode: "preSurveyed", farmersPerHectare: 0,
      neonicBorderEnabled: false, batteryCapacityWh: 100000, reserveBatteryPct: 0,
      searchAltitudeM: defaultParameters.engageAltitudeM,
    };
    const targets = buildGrid(side, spacingM, params);
    const engine = new MissionEngine(params, DEFAULT_SEED, 1, { initialTargets: targets, initialBatteryWh: 100000 });
    let steps = 0;
    const MAX = (50 * 3600) / 0.05;
    while (!engine.summary && steps < MAX) {
      if (engine.drone.mode === "charging") engine.skipCharging();
      engine.step(0.05); steps += 1;
    }
    expect(engine.summary).not.toBeNull();
    expect(engine.summary!.beetlesNeutralized).toBe(side * side);

    const closed = predictGridFlightTimeS({
      count: targets.length, spacingM, dwellS: params.engagementDwellS,
      kinematics: { accelMps2: params.maxHorizontalAccelMps2, cruiseCapMps: params.cruiseSpeedMps },
    }).flightTimeS;
    const engineS = engine.summary!.flightTimeS;

    // The closed form is a lower bound; the engine adds cruise-cap, altitude and
    // acquisition overhead. Agreement to a small constant factor validates the model.
    expect(engineS).toBeGreaterThan(closed * 0.9);
    expect(engineS).toBeLessThan(closed * 3);
  });
});
