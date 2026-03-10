import { describe, expect, it } from "vitest";
import { getBeetleIntroVisualState } from "./intro";
import { TargetState } from "./types";

function createTarget(id: number, x: number, z: number): TargetState {
  return {
    id,
    position: { x, y: 0.22, z },
    rowIndex: Math.max(0, Math.round(z / 0.9)),
    alive: true,
    discovered: false,
    queued: false,
    detectionPulse: 0,
    neutralizationPulse: 0,
    engagementProgress: 0,
    detectedAtS: null,
    neutralizedAtS: null,
    blockedUntilS: 0
  };
}

describe("getBeetleIntroVisualState", () => {
  it("keeps every beetle visible from the first intro frame", () => {
    const targets = [
      createTarget(0, 1.2, 4.5),
      createTarget(1, 6.6, 4.9),
      createTarget(2, 13.8, 7.2)
    ];

    for (const target of targets) {
      const state = getBeetleIntroVisualState(target, 0);
      expect(state.opacityFactor).toBeGreaterThan(0.6);
      expect(state.spawnLiftSceneUnits).toBeGreaterThan(0);
      expect(state.scaleFactor).toBeGreaterThan(0.8);
    }
  });

  it("settles beetles onto the field by the end of the intro", () => {
    const state = getBeetleIntroVisualState(createTarget(3, 8.2, 7.4), 1);
    expect(state.settleProgress).toBe(1);
    expect(state.spawnLiftSceneUnits).toBeCloseTo(0, 6);
    expect(state.opacityFactor).toBe(1);
  });
});
