import { describe, expect, it } from "vitest";
import { defaultParameters } from "./defaults";
import { calculateSafetyMetrics, safetyInputFromParameters } from "./safety";

describe("nominal safety model", () => {
  it("keeps the default nominal safety zone close to the existing 3 m visualization", () => {
    const metrics = calculateSafetyMetrics(safetyInputFromParameters(defaultParameters));

    expect(metrics.nominalSafetyZoneRadiusM).toBeGreaterThan(2.8);
    expect(metrics.nominalSafetyZoneRadiusM).toBeLessThan(3.2);
  });

  it("shortens the nominal safety zone when the starting aperture gets larger", () => {
    const narrowAperture = calculateSafetyMetrics({
      ...safetyInputFromParameters(defaultParameters),
      safetyStartingApertureMm: 8
    });
    const wideAperture = calculateSafetyMetrics({
      ...safetyInputFromParameters(defaultParameters),
      safetyStartingApertureMm: 18
    });

    expect(wideAperture.nominalSafetyZoneRadiusM).toBeLessThan(
      narrowAperture.nominalSafetyZoneRadiusM
    );
  });

  it("lengthens the nominal safety zone when focal distance increases", () => {
    const shortFocus = calculateSafetyMetrics({
      ...safetyInputFromParameters(defaultParameters),
      safetyFocalDistanceM: 0.35
    });
    const longFocus = calculateSafetyMetrics({
      ...safetyInputFromParameters(defaultParameters),
      safetyFocalDistanceM: 0.85
    });

    expect(longFocus.nominalSafetyZoneRadiusM).toBeGreaterThan(
      shortFocus.nominalSafetyZoneRadiusM
    );
  });

  it("lengthens the nominal safety zone when shot energy rises", () => {
    const lowEnergy = calculateSafetyMetrics({
      ...safetyInputFromParameters(defaultParameters),
      laserPowerW: 40,
      engagementDwellS: 0.15
    });
    const highEnergy = calculateSafetyMetrics({
      ...safetyInputFromParameters(defaultParameters),
      laserPowerW: 80,
      engagementDwellS: 0.25
    });

    expect(highEnergy.shotEnergyJ).toBeGreaterThan(lowEnergy.shotEnergyJ);
    expect(highEnergy.nominalSafetyZoneRadiusM).toBeGreaterThan(
      lowEnergy.nominalSafetyZoneRadiusM
    );
  });

  it("stays approximately constant when power rises but dwell falls to keep shot energy fixed", () => {
    const baseline = calculateSafetyMetrics({
      ...safetyInputFromParameters(defaultParameters),
      laserPowerW: 50,
      engagementDwellS: 0.2
    });
    const shorterDwell = calculateSafetyMetrics({
      ...safetyInputFromParameters(defaultParameters),
      laserPowerW: 100,
      engagementDwellS: 0.1
    });

    expect(shorterDwell.shotEnergyJ).toBeCloseTo(baseline.shotEnergyJ, 6);
    expect(shorterDwell.nominalSafetyZoneRadiusM).toBeCloseTo(
      baseline.nominalSafetyZoneRadiusM,
      6
    );
  });
});
