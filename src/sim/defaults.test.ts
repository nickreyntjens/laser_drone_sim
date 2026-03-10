import { describe, expect, it } from "vitest";
import { PLAYBACK_SPEED, PLAYBACK_SPEED_OPTIONS, defaultParameters } from "./defaults";

describe("default playback speeds", () => {
  it("includes the full speed ladder for the player dropdown", () => {
    expect([...PLAYBACK_SPEED_OPTIONS]).toEqual([1, 2, 5.25, 10.5, 20, 40]);
  });

  it("defaults playback to realtime speed", () => {
    expect(PLAYBACK_SPEED).toBe(1);
  });

  it("defaults to pre-surveyed target intelligence", () => {
    expect(defaultParameters.targetingMode).toBe("preSurveyed");
  });

  it("defaults to showing only the selected target marker", () => {
    expect(defaultParameters.showOnlySelectedTargetMarkers).toBe(true);
  });

  it("defaults to the potato / Colorado beetle field mode", () => {
    expect(defaultParameters.fieldType).toBe("potatoColoradoBeetle");
  });

  it("defaults the nominal safety optics close to a 3 m zone", () => {
    expect(defaultParameters.safetyFocalDistanceM).toBeCloseTo(0.5, 6);
    expect(defaultParameters.safetyStartingApertureMm).toBeCloseTo(10, 6);
  });

  it("defaults to 2 farmers per hectare in the field model", () => {
    expect(defaultParameters.farmersPerHectare).toBeCloseTo(2, 6);
  });
});
