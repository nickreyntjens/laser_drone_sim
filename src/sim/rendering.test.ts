import { describe, expect, it } from "vitest";
import { defaultParameters } from "./defaults";
import {
  DJI_MINI_REFERENCE_LENGTH_M,
  DJI_MINI_REFERENCE_MASS_KG,
  DRONE_MODEL_SPAN_SCENE_UNITS,
  estimatedDroneLengthM,
  metersToSceneUnits,
  NOMINAL_TARGET_MARKER_HEIGHT_M,
  nominalDroneModelScale
} from "./rendering";
import { calculateSafetyMetrics, safetyInputFromParameters } from "./safety";

describe("rendering dimensions", () => {
  it("scales drone length linearly from the DJI Mini reference mass", () => {
    expect(estimatedDroneLengthM(DJI_MINI_REFERENCE_MASS_KG)).toBeCloseTo(
      DJI_MINI_REFERENCE_LENGTH_M,
      6
    );
    expect(estimatedDroneLengthM(1)).toBeCloseTo(1, 6);
    expect(estimatedDroneLengthM(2)).toBeCloseTo(2, 6);
  });

  it("keeps the nominal safety radius larger than the physical drone span", () => {
    const renderScaleMPerUnit = 5;
    const safetyRadiusSceneUnits = metersToSceneUnits(
      calculateSafetyMetrics(safetyInputFromParameters(defaultParameters)).nominalSafetyZoneRadiusM,
      renderScaleMPerUnit
    );
    const droneSpanSceneUnits =
      nominalDroneModelScale(1, renderScaleMPerUnit) * DRONE_MODEL_SPAN_SCENE_UNITS;

    expect(droneSpanSceneUnits).toBeCloseTo(estimatedDroneLengthM(1) / renderScaleMPerUnit, 6);
    expect(safetyRadiusSceneUnits).toBeGreaterThan(0.55);
    expect(safetyRadiusSceneUnits).toBeLessThan(0.7);
    expect(droneSpanSceneUnits).toBeLessThan(safetyRadiusSceneUnits * 0.4);
  });

  it("uses a 30 cm target marker by default", () => {
    expect(NOMINAL_TARGET_MARKER_HEIGHT_M).toBeCloseTo(0.3, 6);
  });
});
