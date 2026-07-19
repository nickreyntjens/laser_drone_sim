import { describe, it, expect } from "vitest";
import { steadyLevelFlightPowerW, calculateHoverPowerW, flightMassKg } from "./engine";
import { M100_PARAMS, M100_MEASURED } from "./m100Reference";
import { defaultParameters } from "./defaults";

// EXTERNAL validation: the simulator's flight-power model vs measured DJI Matrice
// 100 telemetry (figshare 10.1184/R1/12683453). The M100 params use the drone's
// real mass/rotor geometry with the sim's OWN default electrical assumptions —
// nothing is fitted to the measured data, so this genuinely tests the model.
describe("flight-power model vs measured DJI M100 telemetry", () => {
  it("predicts hover + cruise power within 15% of measured, at the right magnitude", () => {
    for (const m of M100_MEASURED) {
      const sim = steadyLevelFlightPowerW(M100_PARAMS, m.speedMps);
      const relErr = Math.abs(sim - m.measuredW) / m.measuredW;
      expect(relErr).toBeLessThan(0.15);
    }
  });

  it("reproduces the measured roughly-flat power-vs-speed shape (not rising steeply)", () => {
    const cruise = M100_MEASURED.filter((m) => m.speedMps > 0).map((m) => steadyLevelFlightPowerW(M100_PARAMS, m.speedMps));
    const ratio = Math.max(...cruise) / Math.min(...cruise);
    // measured cruise varies ~452–480 W (ratio ~1.06); the model must be similarly flat
    expect(ratio).toBeLessThan(1.15);
  });

  it("under-predicts by a consistent offset (fixed avionics gap, not a shape error)", () => {
    const errs = M100_MEASURED.map((m) => steadyLevelFlightPowerW(M100_PARAMS, m.speedMps) - m.measuredW);
    // all same sign (under), and the spread of the offset is small vs its magnitude
    expect(errs.every((e) => e < 0)).toBe(true);
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    const spread = Math.max(...errs) - Math.min(...errs);
    expect(spread).toBeLessThan(Math.abs(mean)); // offset is stable, not speed-dependent
  });

  it("sanity: M100 flight mass and hover power land in physical ranges", () => {
    expect(flightMassKg(M100_PARAMS)).toBeCloseTo(3.68, 2);
    const hover = calculateHoverPowerW(M100_PARAMS);
    expect(hover).toBeGreaterThan(300);
    expect(hover).toBeLessThan(450);
  });

  it("the default (2.2 kg paper) drone hovers on less power than the 3.68 kg M100", () => {
    // heavier craft needs more induced power — a basic monotonicity guard
    expect(calculateHoverPowerW(defaultParameters)).toBeLessThan(calculateHoverPowerW(M100_PARAMS));
  });
});
