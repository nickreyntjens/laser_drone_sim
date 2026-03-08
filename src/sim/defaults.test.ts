import { describe, expect, it } from "vitest";
import { PLAYBACK_SPEED_OPTIONS, defaultParameters } from "./defaults";

describe("default playback speeds", () => {
  it("includes the full speed ladder for the player dropdown", () => {
    expect([...PLAYBACK_SPEED_OPTIONS]).toEqual([1, 2, 5.25, 10.5, 20, 40]);
  });

  it("defaults to showing only the selected target marker", () => {
    expect(defaultParameters.showOnlySelectedTargetMarkers).toBe(true);
  });
});
