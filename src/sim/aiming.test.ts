import { describe, expect, it } from "vitest";
import {
  computeAimingDiagramState,
  defaultAimingLabParameters,
  runAimingSimulation
} from "./aiming";

describe("runAimingSimulation", () => {
  it("improves lock fraction when the controller is enabled", () => {
    const openLoop = runAimingSimulation({
      ...defaultAimingLabParameters,
      pidKp: 0,
      pidKi: 0,
      pidKd: 0
    });
    const closedLoop = runAimingSimulation(defaultAimingLabParameters);

    expect(closedLoop.metrics.lockFractionPct).toBeGreaterThan(openLoop.metrics.lockFractionPct);
    expect(closedLoop.metrics.rmsPointingErrorMrad).toBeLessThan(openLoop.metrics.rmsPointingErrorMrad);
  });

  it("benefits from gimbal and damping suppression", () => {
    const raw = runAimingSimulation({
      ...defaultAimingLabParameters,
      gimbalSuppressionPct: 0,
      dampingSuppressionPct: 0
    });
    const stabilized = runAimingSimulation(defaultAimingLabParameters);

    expect(stabilized.metrics.rmsPointingErrorMrad).toBeLessThan(raw.metrics.rmsPointingErrorMrad);
  });

  it("gets worse when vision and driver latency increase sharply", () => {
    const baseline = runAimingSimulation(defaultAimingLabParameters);
    const delayed = runAimingSimulation({
      ...defaultAimingLabParameters,
      processingLatencyMs: 8,
      driverLatencyMs: 2
    });

    expect(delayed.metrics.lockFractionPct).toBeLessThan(baseline.metrics.lockFractionPct);
    expect(delayed.metrics.rmsPointingErrorMrad).toBeGreaterThan(baseline.metrics.rmsPointingErrorMrad);
  });

  it("maps optical target angle and mirror angle into a living diagram state", () => {
    const centered = computeAimingDiagramState({
      timeS: 0,
      shutterOpen: false,
      exposureCentroidMrad: 0,
      exposureSmearMrad: 0,
      lastKnownTargetMrad: 0,
      lowFrequencyDisturbanceMrad: 0,
      highFrequencyDisturbanceMrad: 0,
      residualPlatformMotionMrad: 0,
      targetMotionMrad: 0,
      opticalTargetAngleMrad: 0,
      measuredErrorMrad: 0,
      mirrorAngleMrad: 0,
      mirrorCommandMrad: 0,
      pointingErrorMrad: 0
    });
    const offset = computeAimingDiagramState({
      timeS: 0.5,
      shutterOpen: false,
      exposureCentroidMrad: 0.3,
      exposureSmearMrad: 0.12,
      lastKnownTargetMrad: 0.41,
      lowFrequencyDisturbanceMrad: 0.1,
      highFrequencyDisturbanceMrad: 0.03,
      residualPlatformMotionMrad: 0.13,
      targetMotionMrad: 0.5,
      opticalTargetAngleMrad: 0.63,
      measuredErrorMrad: 0.41,
      mirrorAngleMrad: 0.18,
      mirrorCommandMrad: 0.22,
      pointingErrorMrad: 0.45
    });

    expect(Math.abs(offset.actualSensorPoint.z)).toBeGreaterThan(Math.abs(centered.actualSensorPoint.z));
    expect(offset.mirrorYawRadVisual).not.toBe(centered.mirrorYawRadVisual);
    expect(offset.chiefRayPoints).toHaveLength(4);
    expect(offset.focalRayPoints).toHaveLength(5);
    expect(Math.abs(offset.actualSensorPoint.z)).toBeGreaterThan(0);
  });

  it("supports visual exaggeration of mirror motion in the side view", () => {
    const sample = {
      timeS: 0.5,
      shutterOpen: false,
      exposureCentroidMrad: 0.3,
      exposureSmearMrad: 0.12,
      lastKnownTargetMrad: 0.41,
      lowFrequencyDisturbanceMrad: 0.1,
      highFrequencyDisturbanceMrad: 0.03,
      residualPlatformMotionMrad: 0.13,
      targetMotionMrad: 0.5,
      opticalTargetAngleMrad: 0.63,
      measuredErrorMrad: 0.41,
      mirrorAngleMrad: 0.18,
      mirrorCommandMrad: 0.22,
      pointingErrorMrad: 0.45
    };
    const subtle = computeAimingDiagramState(sample, { mirrorVisualExaggeration: 50 });
    const exaggerated = computeAimingDiagramState(sample, { mirrorVisualExaggeration: 500 });

    expect(Math.abs(exaggerated.mirrorVisualTiltRad)).toBeGreaterThan(
      Math.abs(subtle.mirrorVisualTiltRad)
    );
    expect(exaggerated.mirrorLineAngleRad).not.toBe(subtle.mirrorLineAngleRad);
  });

  it("builds staged playback cycles for target, measurement, and mirror updates", () => {
    const simulation = runAimingSimulation(defaultAimingLabParameters);
    const cycles = simulation.playbackCycles;

    expect(cycles.length).toBeGreaterThan(10);
    expect(cycles[0].exposureEndTimeS).toBeGreaterThan(cycles[0].exposureStartTimeS);
    expect(cycles[0].commandTimeS).toBeGreaterThan(cycles[0].measurementTimeS);
    expect(Number.isFinite(cycles[0].actualPointingCentroidMrad)).toBe(true);
    expect(Number.isFinite(cycles[0].measuredPointingErrorMrad)).toBe(true);
    expect(cycles[0].smearWidthMrad).toBeGreaterThanOrEqual(0);
  });

  it("produces more smear when exposure time increases", () => {
    const shortExposure = runAimingSimulation({
      ...defaultAimingLabParameters,
      exposureTimeMs: 0.2,
      targetSwayMrad: 0.2,
      targetSwayHz: 5
    });
    const longExposure = runAimingSimulation({
      ...defaultAimingLabParameters,
      exposureTimeMs: 2,
      targetSwayMrad: 0.2,
      targetSwayHz: 5
    });

    const shortMeanSmear =
      shortExposure.playbackCycles.reduce((sum, cycle) => sum + cycle.smearWidthMrad, 0) /
      shortExposure.playbackCycles.length;
    const longMeanSmear =
      longExposure.playbackCycles.reduce((sum, cycle) => sum + cycle.smearWidthMrad, 0) /
      longExposure.playbackCycles.length;

    expect(longMeanSmear).toBeGreaterThan(shortMeanSmear);
  });
});
