import { describe, expect, it } from "vitest";
import { defaultParameters } from "./defaults";
import { applyFieldTypePreset, formatPressureLabel, getFieldProfile } from "./fieldProfiles";

describe("fieldProfiles", () => {
  it("keeps potato as the default field mode", () => {
    expect(defaultParameters.fieldType).toBe("potatoColoradoBeetle");
  });

  it("applies rice-specific flight and crop defaults when switching modes", () => {
    const riceParams = applyFieldTypePreset(defaultParameters, "riceYellowStemBorerEgg");

    expect(riceParams.fieldType).toBe("riceYellowStemBorerEgg");
    expect(riceParams.rowSpacingM).toBeCloseTo(0.2, 6);
    expect(riceParams.engageAltitudeM).toBeCloseTo(1.55, 6);
    expect(riceParams.detectionRadiusM).toBeCloseTo(2.4, 6);
  });

  it("applies orchard-specific geometry defaults when switching modes", () => {
    const orchardParams = applyFieldTypePreset(defaultParameters, "orchardMarmoratedStinkBug");
    const orchardProfile = getFieldProfile("orchardMarmoratedStinkBug");

    expect(orchardParams.fieldType).toBe("orchardMarmoratedStinkBug");
    expect(orchardParams.rowSpacingM).toBeCloseTo(3.5, 6);
    expect(orchardParams.searchAltitudeM).toBeCloseTo(4.9, 6);
    expect(orchardParams.safetyFocalDistanceM).toBeCloseTo(0.9, 6);
    expect(orchardProfile.cropVisualStyle).toBe("orchard");
    expect(orchardProfile.targetVisualStyle).toBe("stinkBug");
    expect(orchardProfile.inRowPlantSpacingM).toBeCloseTo(1.2, 6);
    expect(orchardProfile.canopyRadiusM).toBeCloseTo(0.45, 6);
  });

  it("applies greenhouse-specific indoor flight defaults when switching modes", () => {
    const greenhouseParams = applyFieldTypePreset(defaultParameters, "greenhouseTulipCaterpillar");
    const greenhouseProfile = getFieldProfile("greenhouseTulipCaterpillar");

    expect(greenhouseParams.fieldType).toBe("greenhouseTulipCaterpillar");
    expect(greenhouseParams.rowSpacingM).toBeCloseTo(0.45, 6);
    expect(greenhouseParams.searchAltitudeM).toBeCloseTo(2.15, 6);
    expect(greenhouseParams.safetyFocalDistanceM).toBeCloseTo(0.45, 6);
    expect(greenhouseProfile.cropVisualStyle).toBe("greenhouse");
    expect(greenhouseProfile.targetVisualStyle).toBe("caterpillar");
  });

  it("formats pressure labels with the active field profile units", () => {
    expect(formatPressureLabel("potatoColoradoBeetle", 400)).toBe("400 beetles/ha");
    expect(formatPressureLabel("riceYellowStemBorerEgg", 400)).toBe("400 egg masses/ha");
    expect(formatPressureLabel("orchardMarmoratedStinkBug", 400)).toBe("400 stink bugs/ha");
    expect(formatPressureLabel("greenhouseTulipCaterpillar", 400)).toBe("400 caterpillars/ha");
    expect(getFieldProfile("riceYellowStemBorerEgg").representativePlantDensityPerM2).toBeCloseTo(62.5, 6);
  });
});
