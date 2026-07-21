import { describe, it, expect } from "vitest";
import {
  calculateDroneFlightHourCost,
  FLIGHT_COST_DEFAULTS,
  FLIGHT_COST_SCENARIOS,
  type DroneFlightCostInputs,
} from "./flightCostModel";

const calc = (patch: Partial<DroneFlightCostInputs> = {}) =>
  calculateDroneFlightHourCost({ ...FLIGHT_COST_DEFAULTS, ...patch });

describe("calculateDroneFlightHourCost", () => {
  it("baseline battery depreciation matches the sim sweep (~€0.813/h)", () => {
    const r = calc();
    // 180 × 253 / (140 × 400)
    expect(r.batteryDepreciationPerHour).toBeCloseTo((180 * 253) / (140 * 400), 6);
    expect(r.batteryDepreciationPerHour).toBeCloseTo(0.813, 3);
    expect(r.errors).toEqual([]);
  });

  it("paper small-drone battery check: €50 × 90 W / (17.3 Wh × 1000) ≈ €0.260/h", () => {
    const r = calculateDroneFlightHourCost(FLIGHT_COST_SCENARIOS["paper-small-drone"].inputs);
    expect(r.batteryDepreciationPerHour).toBeCloseTo(0.26, 2);
  });

  it("more battery cycles reduce battery cost proportionally", () => {
    const base = calc().batteryDepreciationPerHour;
    const doubled = calc({ batteryCycleLife: 800 }).batteryDepreciationPerHour;
    expect(doubled).toBeCloseTo(base / 2, 9);
  });

  it("doubling average power doubles both energy-dependent hourly costs", () => {
    const base = calc();
    const dbl = calc({ averagePowerW: 506 });
    expect(dbl.batteryDepreciationPerHour).toBeCloseTo(base.batteryDepreciationPerHour * 2, 9);
    expect(dbl.electricityCostPerHour).toBeCloseTo(base.electricityCostPerHour * 2, 9);
  });

  it("electricity cost includes charging losses", () => {
    const r = calc();
    // 253 W / 0.9 / 1000 × €0.15
    expect(r.gridEnergyPerHourKwh).toBeCloseTo(253 / 0.9 / 1000, 9);
    expect(r.electricityCostPerHour).toBeCloseTo((253 / 0.9 / 1000) * 0.15, 9);
    const lossless = calc({ chargingEfficiency: 1 });
    expect(r.electricityCostPerHour).toBeGreaterThan(lossless.electricityCostPerHour);
  });

  it("residual value is deducted from drone capital", () => {
    const r = calc({ droneResidualValueEur: 300 });
    expect(r.droneDepreciableValueEur).toBe(1500);
    expect(r.droneCapitalCostPerHour).toBeCloseTo(1500 / (5 * 300), 9);
  });

  it("write-off hours = years × hours/yr; baseline reproduces the sim's 1,500 h airframe life", () => {
    const r = calc();
    expect(r.droneLifetimeHours).toBe(1500);
    expect(r.droneCapitalCostPerHour).toBeCloseTo(1800 / 1500, 9);
    expect(r.opticalCapitalCostPerHour).toBeCloseTo(6000 / 10000, 9);
  });

  it("shared charger is allocated across drones and their utilisation", () => {
    const r = calc({ chargerPurchasePriceEur: 300, chargerWriteOffYears: 5, chargerSharedDrones: 3, chargerAnnualHoursPerDrone: 200 });
    // (300/5) / (3×200) = 0.1
    expect(r.sharedEquipmentCostPerHour).toBeCloseTo(0.1, 9);
  });

  it("outliving the write-off spreads the airframe over the real life (lower €/h)", () => {
    const base = calc().droneCapitalCostPerHour;                            // 1800 / (5×300) = 1.20
    const durable = calc({ droneOutliveWriteOffYears: 5 }).droneCapitalCostPerHour; // 1800 / (10×300) = 0.60
    expect(base).toBeCloseTo(1800 / (5 * 300), 9);
    expect(durable).toBeCloseTo(1800 / (10 * 300), 9);
    expect(durable).toBeLessThan(base);
    // outlive=0 must reproduce the plain write-off (no silent behaviour change)
    expect(calc({ droneOutliveWriteOffYears: 0 }).droneCapitalCostPerHour).toBeCloseTo(base, 12);
  });

  it("totals equal the sum of their components", () => {
    const r = calc({ chargerPurchasePriceEur: 300 });
    expect(r.marginalFlightCostPerHour).toBeCloseTo(
      r.batteryDepreciationPerHour + r.electricityCostPerHour + r.maintenanceCostPerHour, 12);
    expect(r.ordinaryDroneCostPerHour).toBeCloseTo(
      r.marginalFlightCostPerHour + r.droneCapitalCostPerHour + r.sharedEquipmentCostPerHour, 12);
    expect(r.fullyAllocatedSystemCostPerHour).toBeCloseTo(
      r.ordinaryDroneCostPerHour + r.opticalCapitalCostPerHour, 12);
  });

  it("invalid zero/out-of-range inputs produce errors and finite zeros, never NaN/Infinity", () => {
    const cases: Partial<DroneFlightCostInputs>[] = [
      { batteryCycleLife: 0 },
      { batteryCapacityWh: 0 },
      { droneOperatingHoursPerYear: 0 },
      { chargingEfficiency: 0 },
      { chargingEfficiency: 1.4 },
      { droneResidualValueEur: 99999 },
      { batteryPriceEur: -5 },
      { opticalLifetimeHours: 0 },
      { averagePowerW: NaN },
    ];
    for (const patch of cases) {
      const r = calc(patch);
      expect(r.errors.length).toBeGreaterThan(0);
      for (const v of Object.values(r)) {
        if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("baseline fully-allocated rate matches the sim's published $2.80/flight-h (capital+laser+maintenance) plus energy", () => {
    const r = calc();
    // sim rate: airframe 1800/1500 + laser 6000/10000 + maintenance 1.0 = 2.80
    const simCapitalMaint = r.droneCapitalCostPerHour + r.opticalCapitalCostPerHour + r.maintenanceCostPerHour;
    expect(simCapitalMaint).toBeCloseTo(2.8, 9);
    expect(r.fullyAllocatedSystemCostPerHour).toBeCloseTo(2.8 + r.batteryDepreciationPerHour + r.electricityCostPerHour, 9);
  });
});
