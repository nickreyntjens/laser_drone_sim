import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultParameters, MODE_LABELS } from "../sim/defaults";
import { SimulationSnapshot } from "../sim/types";
import { SceneHud } from "./SceneHud";

function createSnapshot(): SimulationSnapshot {
  return {
    params: defaultParameters,
    nominalSafetyZoneRadiusM: 3,
    drone: {
      position: { x: 0, y: defaultParameters.searchAltitudeM, z: 0 },
      velocity: { x: 3, y: 0, z: 4 },
      acceleration: { x: 0, y: 0, z: 0 },
      headingRad: 0,
      yawRateRadS: 0.4,
      rollRad: 0,
      pitchRad: 0,
      instantaneousPowerW: 118,
      batteryWh: 112,
      batteryPct: 0.8,
      mode: "searching",
      activeTargetId: null,
      activeWaypointIndex: 2
    },
    targets: [],
    metrics: {
      missionElapsedS: 95,
      totalEnergyWh: 12.5,
      rechargeCycles: 0,
      beetlesNeutralized: 8,
      beetlesRemaining: 23,
      averageTimePerTargetS: 11.875,
      energyPerBeetleWh: 1.5625,
      flightTimeS: 95,
      batteryDepreciationCostUsd: 0.03,
      energyCostUsd: 0.002,
      amortizationCostUsd: 0.14,
      borderCostUsd: 0,
      costPerHectareUsd: 0.003,
      equivalentFullCyclesUsed: 0.09,
      energyFractions: {
        flight: 0.56,
        hover: 0.16,
        acceleration: 0.08,
        laser: 0.04,
        avionics: 0.16
      }
    },
    chargeStatus: null,
    summary: null,
    farmers: [],
    seed: 17,
    playbackSpeed: 5.25,
    renderScaleMPerUnit: 5,
    dockPosition: { x: 0, y: 0, z: 0 },
    pathHistory: [],
    sweepPath: []
  };
}

describe("SceneHud", () => {
  it("keeps mission time leftmost and state rightmost in compact mode", () => {
    const snapshot = createSnapshot();
    const markup = renderToStaticMarkup(
      <SceneHud snapshot={snapshot} isIntroActive={false} isExpanded={false} controlsHidden={false} />
    );
    const expectedItems = [
      "Mission time 1m 35s",
      "10.0 ha",
      "400 beetles/ha",
      MODE_LABELS.searching
    ];

    expect((markup.match(/class=\"small-pill\"/g) ?? []).length).toBe(4);

    let previousIndex = -1;
    expectedItems.forEach((item) => {
      const itemIndex = markup.indexOf(item);
      expect(itemIndex).toBeGreaterThan(previousIndex);
      previousIndex = itemIndex;
    });
  });

  it("shows current speed immediately to the right of mission time in expanded mode", () => {
    const snapshot = createSnapshot();
    const markup = renderToStaticMarkup(
      <SceneHud snapshot={snapshot} isIntroActive={false} isExpanded={true} controlsHidden={false} />
    );
    const expectedItems = [
      "Mission time 1m 35s",
      "Speed 5.0 m/s",
      "10.0 ha",
      "400 beetles/ha",
      MODE_LABELS.searching
    ];

    let previousIndex = -1;
    expectedItems.forEach((item) => {
      const itemIndex = markup.indexOf(item);
      expect(itemIndex).toBeGreaterThan(previousIndex);
      previousIndex = itemIndex;
    });

    expect(markup).toContain("Attitude / horizon");
  });

  it("shows only the attitude instrument when viewport controls are hidden", () => {
    const snapshot = createSnapshot();
    const markup = renderToStaticMarkup(
      <SceneHud snapshot={snapshot} isIntroActive={false} isExpanded={true} controlsHidden={true} />
    );

    expect(markup).toContain("Attitude / horizon");
    expect(markup).not.toContain("Mission time 1m 35s");
    expect(markup).not.toContain("Power draw");
    expect(markup).not.toContain("Neutralized");
  });
});
