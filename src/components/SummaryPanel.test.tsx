import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MissionSummary } from "../sim/types";
import { SummaryPanel } from "./SummaryPanel";

function createSummary(): MissionSummary {
  return {
    totalMissionTimeS: 5400,
    flightTimeS: 5400,
    totalEnergyWh: 4200,
    rechargeCycles: 28,
    beetlesNeutralized: 38000,
    averageTimePerTargetS: 0.14,
    energyPerBeetleWh: 0.11,
    batteryDepreciationCostUsd: 9,
    energyCostUsd: 0.63,
    amortizationCostUsd: 4.2,
    borderCostUsd: 0,
    costPerHectareUsd: 0.0963,
    equivalentFullCyclesUsed: 30,
    energyBreakdown: {
      flightWh: 2400,
      hoverWh: 800,
      accelerationWh: 400,
      laserWh: 200,
      avionicsWh: 400
    },
    energyFractions: {
      flight: 0.57,
      hover: 0.19,
      acceleration: 0.1,
      laser: 0.05,
      avionics: 0.09
    }
  };
}

describe("SummaryPanel", () => {
  it("leads with the cost story and spray comparison when the mission completes", () => {
    const markup = renderToStaticMarkup(
      <SummaryPanel summary={createSummary()} fieldType="potatoColoradoBeetle" />
    );

    expect(markup).toContain("cheaper than spraying");
    expect(markup).toContain("Laser drone (this run)");
    expect(markup).toContain("conventional insecticide pass");
    expect(markup).toContain("Charging electricity");
    expect(markup).toContain("battery wear plus charging electricity");
  });

  it("shows the waiting note before completion", () => {
    const markup = renderToStaticMarkup(
      <SummaryPanel summary={null} fieldType="potatoColoradoBeetle" />
    );

    expect(markup).toContain("Awaiting completion");
    expect(markup).not.toContain("cheaper than spraying");
  });
});
