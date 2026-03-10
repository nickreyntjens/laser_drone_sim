import { describe, expect, it } from "vitest";
import {
  deriveSafetyZoneEditorView,
  SafetyZoneEditorDraft
} from "./SafetyZonePanel";

function createDraft(
  overrides: Partial<SafetyZoneEditorDraft> = {}
): SafetyZoneEditorDraft {
  return {
    safetyFocalDistanceM: 0.62,
    safetyStartingApertureMm: 11,
    laserPowerW: 80,
    requiredShotEnergyJ: 3,
    previewFarmerDistanceM: 4.6,
    ...overrides
  };
}

describe("deriveSafetyZoneEditorView", () => {
  it("keeps preview farmer distance independent from focal distance changes", () => {
    const baseline = deriveSafetyZoneEditorView(createDraft());
    const longerFocus = deriveSafetyZoneEditorView(
      createDraft({ safetyFocalDistanceM: 0.98 })
    );

    expect(baseline.previewFarmerDistanceM).toBeCloseTo(4.6, 6);
    expect(longerFocus.previewFarmerDistanceM).toBeCloseTo(4.6, 6);
    expect(longerFocus.metrics.nominalSafetyZoneRadiusM).not.toBeCloseTo(
      baseline.metrics.nominalSafetyZoneRadiusM,
      3
    );
  });

  it("keeps the slider range large enough to preserve the chosen preview distance", () => {
    const view = deriveSafetyZoneEditorView(
      createDraft({ previewFarmerDistanceM: 7.4 })
    );

    expect(view.previewDistanceMax).toBeGreaterThanOrEqual(7.4);
    expect(view.previewFarmerDistanceM).toBeCloseTo(7.4, 6);
  });

  it("back-solves dwell time from insect energy and laser power", () => {
    const baseline = deriveSafetyZoneEditorView(createDraft({ requiredShotEnergyJ: 5, laserPowerW: 50 }));
    const higherPower = deriveSafetyZoneEditorView(createDraft({ requiredShotEnergyJ: 5, laserPowerW: 100 }));

    expect(baseline.derivedDwellS).toBeCloseTo(0.1, 6);
    expect(higherPower.derivedDwellS).toBeCloseTo(0.05, 6);
    expect(higherPower.metrics.shotEnergyJ).toBeCloseTo(5, 6);
  });
});
