import { describe, expect, it } from "vitest";
import { defaultParameters } from "./defaults";
import { planPreSurveyedTargetRoute } from "./planner";
import { SimulationParameters, TargetState } from "./types";

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
    neutralizedAtS: null
  };
}

function createParams(overrides: Partial<SimulationParameters> = {}): SimulationParameters {
  return {
    ...defaultParameters,
    targetingMode: "preSurveyed",
    fieldLengthM: 80,
    fieldWidthM: 40,
    laneSpacingM: 4,
    detectionRadiusM: 3,
    ...overrides
  };
}

describe("planPreSurveyedTargetRoute", () => {
  it("returns a unique route that covers every known target", () => {
    const params = createParams();
    const origin = { x: -10, y: 0, z: 20 };
    const targets = [
      createTarget(0, 4, 4),
      createTarget(1, 7, 8),
      createTarget(2, 12, 5),
      createTarget(3, 18, 9),
      createTarget(4, 28, 14),
      createTarget(5, 36, 18)
    ];

    const route = planPreSurveyedTargetRoute(params, origin, targets);
    const nearestTargetId = [...targets]
      .sort((a, b) => {
        const distanceA = Math.hypot(a.position.x - origin.x, a.position.z - origin.z);
        const distanceB = Math.hypot(b.position.x - origin.x, b.position.z - origin.z);
        return distanceA - distanceB;
      })[0]?.id;

    expect(route).toHaveLength(targets.length);
    expect(new Set(route).size).toBe(targets.length);
    expect(route[0]).toBe(nearestTargetId);
  });

  it("stays bounded on very large target counts by falling back to strip ordering", () => {
    const params = createParams({
      fieldLengthM: 400,
      fieldWidthM: 250
    });
    const targets = Array.from({ length: 6001 }, (_, index) =>
      createTarget(index, (index % 400) + 0.5, ((index * 7) % 250) + 0.5)
    );

    const route = planPreSurveyedTargetRoute(params, { x: -10, y: 0, z: 125 }, targets);

    expect(route).toHaveLength(targets.length);
    expect(new Set(route).size).toBe(targets.length);
  });
});
