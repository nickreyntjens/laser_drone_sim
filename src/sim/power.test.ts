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

  it("has less than 12% mean absolute error across the flight-level points", () => {
    const errors = M100_MEASURED.map((m) =>
      Math.abs(steadyLevelFlightPowerW(M100_PARAMS, m.speedMps) - m.measuredW) / m.measuredW,
    );
    expect(errors.reduce((sum, error) => sum + error, 0) / errors.length).toBeLessThan(0.12);
  });

  it("stores flight counts so the validation cannot silently revert to sample weighting", () => {
    expect(M100_MEASURED.every((m) => m.flights > 0)).toBe(true);
    expect(M100_MEASURED.find((m) => m.commandedSpeedMps === 12)?.samples).toBe(48);
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
