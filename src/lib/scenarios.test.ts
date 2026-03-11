import { describe, expect, it } from "vitest";
import { defaultAimingLabParameters } from "../sim/aiming";
import { defaultParameters } from "../sim/defaults";
import {
  applyScenarioToState,
  buildScenarioFromState,
  createPersistentAppState,
  parseScenarioImport,
  readPersistentAppState,
  readSavedScenarios,
  serializeScenarioExport
} from "./scenarios";

describe("scenarios", () => {
  it("stores only the selected sections in a scenario", () => {
    const scenario = buildScenarioFromState({
      name: "Pressure + aiming",
      sections: ["field", "aiming"],
      activeParams: {
        ...defaultParameters,
        edgeDensityPerHectare: 1800,
        droneMassKg: 4
      },
      aimingParams: {
        ...defaultAimingLabParameters,
        exposureTimeMs: 2.4
      },
      seed: 23
    });

    expect(scenario.simulationPatch.edgeDensityPerHectare).toBe(1800);
    expect("droneMassKg" in scenario.simulationPatch).toBe(false);
    expect(scenario.aimingPatch.exposureTimeMs).toBe(2.4);
    expect(scenario.seed).toBe(23);
  });

  it("merges a scenario into the current state without overwriting untouched sections", () => {
    const scenario = buildScenarioFromState({
      name: "Drone spec preset",
      sections: ["drone"],
      activeParams: {
        ...defaultParameters,
        droneMassKg: 2.4,
        cruiseSpeedMps: 11
      },
      aimingParams: defaultAimingLabParameters,
      seed: 99
    });

    const applied = applyScenarioToState({
      scenario,
      simulationParams: {
        ...defaultParameters,
        edgeDensityPerHectare: 900
      },
      aimingParams: {
        ...defaultAimingLabParameters,
        exposureTimeMs: 3
      }
    });

    expect(applied.nextSimulationParams.droneMassKg).toBe(2.4);
    expect(applied.nextSimulationParams.cruiseSpeedMps).toBe(11);
    expect(applied.nextSimulationParams.edgeDensityPerHectare).toBe(900);
    expect(applied.nextAimingParams.exposureTimeMs).toBe(3);
    expect(applied.nextSeed).toBe(99);
  });

  it("round-trips exported scenarios through import parsing", () => {
    const scenario = buildScenarioFromState({
      name: "Export me",
      sections: ["field", "aiming"],
      activeParams: defaultParameters,
      aimingParams: defaultAimingLabParameters,
      seed: 17
    });

    const imported = parseScenarioImport(serializeScenarioExport(scenario));

    expect(imported.name).toBe("Export me");
    expect(imported.sections).toEqual(["field", "aiming"]);
  });

  it("hydrates persistent state by merging stored values onto current defaults", () => {
    const stored = JSON.stringify(
      createPersistentAppState({
        activeParams: {
          ...defaultParameters,
          edgeDensityPerHectare: 950
        },
        draftParams: {
          ...defaultParameters,
          droneMassKg: 1.6
        },
        aimingLabParams: {
          ...defaultAimingLabParameters,
          exposureTimeMs: 1.8
        },
        seed: 25,
        playbackSpeed: 20
      })
    );

    const hydrated = readPersistentAppState(stored, {
      simulation: defaultParameters,
      aiming: defaultAimingLabParameters,
      seed: 17,
      playbackSpeed: 1
    });

    expect(hydrated.activeParams.edgeDensityPerHectare).toBe(950);
    expect(hydrated.draftParams.droneMassKg).toBe(1.6);
    expect(hydrated.aimingLabParams.exposureTimeMs).toBe(1.8);
    expect(hydrated.seed).toBe(25);
    expect(hydrated.playbackSpeed).toBe(20);
  });

  it("ignores malformed scenario storage", () => {
    expect(readSavedScenarios("{bad json")).toEqual([]);
  });
});
