import { describe, expect, it } from "vitest";
import { defaultParameters } from "./defaults";
import { generateTargets } from "./generation";
import { SimulationParameters } from "./types";

function createParams(overrides: Partial<SimulationParameters> = {}): SimulationParameters {
  return {
    ...defaultParameters,
    fieldLengthM: 400,
    fieldWidthM: 250,
    edgeDensityPerHectare: 200,
    gradientStrength: 9,
    ...overrides
  };
}

describe("generateTargets", () => {
  it("keeps the expected beetle count aligned with beetles-per-hectare pressure", () => {
    const params = createParams();
    const expectedCount = (params.fieldLengthM * params.fieldWidthM) / 10_000 * params.edgeDensityPerHectare;
    const runs = 120;
    let totalCount = 0;

    for (let seed = 1; seed <= runs; seed += 1) {
      totalCount += generateTargets(params, seed).length;
    }

    const meanCount = totalCount / runs;

    expect(meanCount).toBeGreaterThan(expectedCount * 0.95);
    expect(meanCount).toBeLessThan(expectedCount * 1.05);
  });

  it("still concentrates beetles near the invasion edge when decay is strong", () => {
    const params = createParams({
      edgeDensityPerHectare: 400,
      gradientStrength: 10
    });
    const targets = generateTargets(params, 17);
    const nearEdgeCount = targets.filter((target) => target.position.x < params.fieldLengthM * 0.2).length;
    const deepFieldCount = targets.filter((target) => target.position.x > params.fieldLengthM * 0.8).length;

    expect(nearEdgeCount).toBeGreaterThan(deepFieldCount * 3);
  });
});
