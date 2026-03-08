import { describe, expect, it } from "vitest";
import { shouldRenderMarkerForTarget } from "./visuals";

describe("shouldRenderMarkerForTarget", () => {
  it("hides non-selected live target markers in reduced-clutter mode", () => {
    expect(
      shouldRenderMarkerForTarget(
        {
          alive: true,
          neutralizationPulse: 0
        },
        false,
        true
      )
    ).toBe(false);
  });

  it("keeps the selected live target marker visible in reduced-clutter mode", () => {
    expect(
      shouldRenderMarkerForTarget(
        {
          alive: true,
          neutralizationPulse: 0
        },
        true,
        true
      )
    ).toBe(true);
  });

  it("shows all live markers when clutter reduction is disabled", () => {
    expect(
      shouldRenderMarkerForTarget(
        {
          alive: true,
          neutralizationPulse: 0
        },
        false,
        false
      )
    ).toBe(true);
  });

  it("keeps recent neutralization markers visible", () => {
    expect(
      shouldRenderMarkerForTarget(
        {
          alive: false,
          neutralizationPulse: 0.2
        },
        false,
        true
      )
    ).toBe(true);
  });
});
