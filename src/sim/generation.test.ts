import { describe, expect, it } from "vitest";
import { defaultParameters } from "./defaults";
import { buildSweepPath, generateTargets } from "./generation";
import { getFieldProfile } from "./fieldProfiles";
import { greenhouseAisleCenters, greenhouseSupportLineCenters } from "./greenhouse";
import { orchardTreeCenter } from "./orchard";
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

  it("places orchard stink bugs on tree tops and side faces tied to orchard tree centers", () => {
    const orchardParams = createParams({
      fieldType: "orchardMarmoratedStinkBug",
      rowSpacingM: 3.5,
      laneSpacingM: 3.5,
      fieldLengthM: 140,
      fieldWidthM: 42
    });
    const orchardProfile = getFieldProfile("orchardMarmoratedStinkBug");
    const orchardTargets = generateTargets(orchardParams, 23);

    expect(orchardTargets.length).toBeGreaterThan(0);
    expect(
      orchardTargets.every((target) => {
        if (!target.supportPosition) {
          return false;
        }

        const treeCenter = orchardTreeCenter(target.rowIndex, target.position.x, orchardParams, orchardProfile);
        const dzToRow = Math.abs(treeCenter.z - target.supportPosition.z);
        const dxToTree = Math.abs(treeCenter.x - target.supportPosition.x);
        const radialDistance = Math.hypot(
          target.position.x - treeCenter.x,
          target.position.z - treeCenter.z
        );
        const topTarget = target.position.y >= orchardProfile.maturePlantHeightM * 0.82;
        const sideTarget =
          target.position.y >= orchardProfile.maturePlantHeightM * 0.42 &&
          target.position.y <= orchardProfile.maturePlantHeightM * 0.78;

        return (
          dzToRow <= 1e-6 &&
          dxToTree <= 1e-6 &&
          radialDistance <= orchardProfile.canopyRadiusM + 0.18 &&
          radialDistance >= orchardProfile.canopyRadiusM * 0.08 &&
          (topTarget || sideTarget)
        );
      })
    ).toBe(true);
  });

  it("uses alley-centered sweep lanes in orchard mode", () => {
    const orchardParams = createParams({
      fieldType: "orchardMarmoratedStinkBug",
      rowSpacingM: 3.5,
      laneSpacingM: 3.5,
      fieldWidthM: 14,
      fieldLengthM: 60
    });
    const sweepPath = buildSweepPath(orchardParams);
    const uniqueLaneCenters = [...new Set(sweepPath.map((point) => Number(point.z.toFixed(4))))];

    expect(uniqueLaneCenters).toContain(0);
    expect(uniqueLaneCenters).toContain(3.5);
    expect(uniqueLaneCenters).toContain(7);
    expect(uniqueLaneCenters).toContain(10.5);
    expect(uniqueLaneCenters).toContain(14);
  });

  it("places greenhouse caterpillars on tulip leaves and sweeps greenhouse aisles", () => {
    const greenhouseParams = createParams({
      fieldType: "greenhouseTulipCaterpillar",
      rowSpacingM: 0.45,
      laneSpacingM: 2.25,
      fieldWidthM: 18,
      fieldLengthM: 60
    });
    const greenhouseProfile = getFieldProfile("greenhouseTulipCaterpillar");
    const greenhouseTargets = generateTargets(greenhouseParams, 31);
    const sweepPath = buildSweepPath(greenhouseParams);
    const laneCenters = [...new Set(sweepPath.map((point) => Number(point.z.toFixed(4))))];
    const expectedAisles = greenhouseAisleCenters(greenhouseParams).map((value) => Number(value.toFixed(4)));
    const supportLines = greenhouseSupportLineCenters(greenhouseParams);

    expect(greenhouseTargets.length).toBeGreaterThan(0);
    expect(
      greenhouseTargets.every((target) => {
        if (!target.supportPosition) {
          return false;
        }

        const dx = Math.abs(target.position.x - target.supportPosition.x);
        const dz = Math.abs(target.position.z - target.supportPosition.z);
        const dy = target.position.y - target.supportPosition.y;
        return (
          dx <= greenhouseProfile.representativeLeafLengthM * 0.36 + 1e-6 &&
          dz <= greenhouseProfile.canopyRadiusM * 0.6 + 1e-6 &&
          dy >= 0.12 &&
          dy <= 0.34 &&
          target.position.y >= greenhouseProfile.maturePlantHeightM * 0.62
        );
      })
    ).toBe(true);
    expect(laneCenters.sort((a, b) => a - b)).toEqual(expectedAisles.sort((a, b) => a - b));
    expect(supportLines.length).toBeGreaterThan(0);
  });
});
