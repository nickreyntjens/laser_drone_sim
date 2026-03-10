import { describe, expect, it } from "vitest";
import { defaultParameters } from "./defaults";
import { getFieldProfile } from "./fieldProfiles";
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

  it("places rice egg masses near the leaf tips instead of the potato canopy height", () => {
    const potatoTargets = generateTargets(createParams({ fieldType: "potatoColoradoBeetle" }), 17);
    const riceProfile = getFieldProfile("riceYellowStemBorerEgg");
    const riceTargets = generateTargets(
      createParams({
        fieldType: "riceYellowStemBorerEgg",
        rowSpacingM: 0.2
      }),
      17
    );

    const potatoMeanHeight =
      potatoTargets.reduce((sum, target) => sum + target.position.y, 0) / potatoTargets.length;
    const riceMeanHeight =
      riceTargets.reduce((sum, target) => sum + target.position.y, 0) / riceTargets.length;

    expect(riceMeanHeight).toBeGreaterThan(potatoMeanHeight + 0.35);
    expect(riceTargets.every((target) => target.position.y >= 0.68)).toBe(true);
    expect(
      riceTargets.every((target) => {
        if (!target.supportPosition) {
          return false;
        }

        const dx = Math.abs(target.position.x - target.supportPosition.x);
        const dz = Math.abs(target.position.z - target.supportPosition.z);
        const dy = target.position.y - target.supportPosition.y;
        return (
          dx <= riceProfile.representativeLeafLengthM * 0.48 + 1e-6 &&
          dz <= riceProfile.representativeLeafLengthM * 0.2 + 1e-6 &&
          dy >= 0.08 &&
          dy <= 0.24 &&
          target.position.y >= riceProfile.maturePlantHeightM * 0.9
        );
      })
    ).toBe(true);
  });
});
