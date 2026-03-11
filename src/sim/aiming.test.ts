import { describe, expect, it } from "vitest";
import {
  AimingLabEngine,
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
      processingLatencyMs: 12,
      driverLatencyMs: 3
    });

    expect(delayed.metrics.rmsPointingErrorMrad).toBeGreaterThan(baseline.metrics.rmsPointingErrorMrad);
  });

  it("integral predictor improves low-frequency disturbance rejection over PI hold", () => {
    const baseline = runAimingSimulation({
      ...defaultAimingLabParameters,
      commandGeneratorMode: "pi",
      gimbalSuppressionPct: 0,
      dampingSuppressionPct: 0,
      lowFrequencyDisturbanceMrad: 0.8,
      highFrequencyDisturbanceMrad: 0.08,
      imuFeedforwardGain: 0,
      imuRateLeadGain: 0
    });
    const predictive = runAimingSimulation({
      ...defaultAimingLabParameters,
      commandGeneratorMode: "integral",
      gimbalSuppressionPct: 0,
      dampingSuppressionPct: 0,
      lowFrequencyDisturbanceMrad: 0.8,
      highFrequencyDisturbanceMrad: 0.08
    });

    expect(predictive.metrics.rmsPointingErrorMrad).toBeLessThan(baseline.metrics.rmsPointingErrorMrad);
  });

  it("direct mode trails PI hold because it only reacts once per centroid", () => {
    const direct = runAimingSimulation({
      ...defaultAimingLabParameters,
      commandGeneratorMode: "direct",
      gimbalSuppressionPct: 0,
      dampingSuppressionPct: 0,
      lowFrequencyDisturbanceMrad: 0.6,
      highFrequencyDisturbanceMrad: 0.06
    });
    const held = runAimingSimulation({
      ...defaultAimingLabParameters,
      commandGeneratorMode: "pi",
      gimbalSuppressionPct: 0,
      dampingSuppressionPct: 0,
      lowFrequencyDisturbanceMrad: 0.6,
      highFrequencyDisturbanceMrad: 0.06
    });

    expect(direct.metrics.rmsPointingErrorMrad).toBeGreaterThan(held.metrics.rmsPointingErrorMrad);
  });

  it("frequency and phase predictor improves sinusoidal tracking over PI hold", () => {
    const baseline = runAimingSimulation({
      ...defaultAimingLabParameters,
      commandGeneratorMode: "pi",
      gimbalSuppressionPct: 0,
      dampingSuppressionPct: 0,
      lowFrequencyDisturbanceMrad: 0.7,
      lowFrequencyHz: 7,
      highFrequencyDisturbanceMrad: 0,
      targetSwayMrad: 0,
      imuFeedforwardGain: 0,
      imuRateLeadGain: 0
    });
    const oscillationAware = runAimingSimulation({
      ...defaultAimingLabParameters,
      commandGeneratorMode: "frequency_phase",
      gimbalSuppressionPct: 0,
      dampingSuppressionPct: 0,
      lowFrequencyDisturbanceMrad: 0.7,
      lowFrequencyHz: 7,
      highFrequencyDisturbanceMrad: 0,
      targetSwayMrad: 0,
      phasePredictorBaseFrequencyHz: 7
    });

    expect(oscillationAware.metrics.rmsPointingErrorMrad).toBeLessThan(baseline.metrics.rmsPointingErrorMrad);
  });

  it("DMD sliding window predictor improves oscillatory tracking over direct mode", () => {
    const direct = runAimingSimulation({
      ...defaultAimingLabParameters,
      commandGeneratorMode: "direct",
      gimbalSuppressionPct: 0,
      dampingSuppressionPct: 0,
      lowFrequencyDisturbanceMrad: 0.7,
      lowFrequencyHz: 7,
      highFrequencyDisturbanceMrad: 0,
      targetSwayMrad: 0,
      imuFeedforwardGain: 0,
      imuRateLeadGain: 0
    });
    const dmd = runAimingSimulation({
      ...defaultAimingLabParameters,
      commandGeneratorMode: "dmd_sliding_window",
      gimbalSuppressionPct: 0,
      dampingSuppressionPct: 0,
      lowFrequencyDisturbanceMrad: 0.7,
      lowFrequencyHz: 7,
      highFrequencyDisturbanceMrad: 0,
      targetSwayMrad: 0,
      dmdWindowSize: 8,
      dmdCommandPeriodMs: 1
    });

    expect(dmd.metrics.rmsPointingErrorMrad).toBeLessThan(direct.metrics.rmsPointingErrorMrad);
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
      opticalTargetAngleYMrad: 0,
      measuredErrorMrad: 0,
      measuredErrorYMrad: 0,
      mirrorAngleMrad: 0,
      mirrorRollMrad: 0,
      mirrorCommandMrad: 0,
      mirrorCommandRollMrad: 0,
      commandGeneratorPitchMrad: 0,
      commandGeneratorRollMrad: 0,
      pointingErrorMrad: 0,
      pointingErrorYMrad: 0,
      filteredImuPitchMrad: 0,
      filteredImuRollMrad: 0,
      sensorXMm: 0,
      sensorYMm: 0,
      laserOn: false,
      targetInSpot: false,
      spotCoveragePct: 0,
      absorbedPowerW: 0,
      heatLossW: 0,
      targetTemperatureC: 22,
      shotsPerSecond: 0
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
      opticalTargetAngleYMrad: 0.12,
      measuredErrorMrad: 0.41,
      measuredErrorYMrad: 0.08,
      mirrorAngleMrad: 0.18,
      mirrorRollMrad: 0.02,
      mirrorCommandMrad: 0.22,
      mirrorCommandRollMrad: 0.03,
      commandGeneratorPitchMrad: 0.24,
      commandGeneratorRollMrad: 0.04,
      pointingErrorMrad: 0.45,
      pointingErrorYMrad: 0.1,
      filteredImuPitchMrad: 0.11,
      filteredImuRollMrad: 0.04,
      sensorXMm: 0.82,
      sensorYMm: 0.12,
      laserOn: true,
      targetInSpot: false,
      spotCoveragePct: 56,
      absorbedPowerW: 1.4,
      heatLossW: 0.2,
      targetTemperatureC: 33,
      shotsPerSecond: 0.5
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
      opticalTargetAngleYMrad: 0.12,
      measuredErrorMrad: 0.41,
      measuredErrorYMrad: 0.08,
      mirrorAngleMrad: 0.18,
      mirrorRollMrad: 0.02,
      mirrorCommandMrad: 0.22,
      mirrorCommandRollMrad: 0.03,
      commandGeneratorPitchMrad: 0.24,
      commandGeneratorRollMrad: 0.04,
      pointingErrorMrad: 0.45,
      pointingErrorYMrad: 0.1,
      filteredImuPitchMrad: 0.11,
      filteredImuRollMrad: 0.04,
      sensorXMm: 0.82,
      sensorYMm: 0.12,
      laserOn: true,
      targetInSpot: false,
      spotCoveragePct: 56,
      absorbedPowerW: 1.4,
      heatLossW: 0.2,
      targetTemperatureC: 33,
      shotsPerSecond: 0.5
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
      commandGeneratorMode: "pi",
      pidKp: 0,
      pidKi: 0,
      pidKd: 0,
      lowFrequencyDisturbanceMrad: 0,
      highFrequencyDisturbanceMrad: 0,
      exposureTimeMs: 0.2,
      targetSwayMrad: 0.2,
      targetSwayHz: 5
    });
    const longExposure = runAimingSimulation({
      ...defaultAimingLabParameters,
      commandGeneratorMode: "pi",
      pidKp: 0,
      pidKi: 0,
      pidKd: 0,
      lowFrequencyDisturbanceMrad: 0,
      highFrequencyDisturbanceMrad: 0,
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

  it("heats the target faster and raises shot rate with higher laser power", () => {
    const lowPower = runAimingSimulation({
      ...defaultAimingLabParameters,
      durationS: 2,
      targetStepMrad: 0,
      targetSwayMrad: 0,
      lowFrequencyDisturbanceMrad: 0,
      highFrequencyDisturbanceMrad: 0,
      laserSpotDiameterMm: 0.8,
      laserPowerW: 2
    });
    const highPower = runAimingSimulation({
      ...defaultAimingLabParameters,
      durationS: 2,
      targetStepMrad: 0,
      targetSwayMrad: 0,
      lowFrequencyDisturbanceMrad: 0,
      highFrequencyDisturbanceMrad: 0,
      laserSpotDiameterMm: 0.8,
      laserPowerW: 12
    });

    const lowPowerPeakTemperature = Math.max(...lowPower.samples.map((sample) => sample.targetTemperatureC));
    const highPowerPeakTemperature = Math.max(...highPower.samples.map((sample) => sample.targetTemperatureC));

    expect(highPowerPeakTemperature).toBeGreaterThan(lowPowerPeakTemperature);
  });

  it("produces visible shots with the default laser settings", () => {
    const simulation = runAimingSimulation(defaultAimingLabParameters);
    const peakShotRate = Math.max(...simulation.samples.map((sample) => sample.shotsPerSecond));

    expect(peakShotRate).toBeGreaterThan(0);
  });

  it("fully removes platform disturbance at 100% suppression in an ideal tracking case", () => {
    const ideal = runAimingSimulation({
      ...defaultAimingLabParameters,
      durationS: 1,
      cameraFps: 1000,
      exposureTimeMs: 0.2,
      processingLatencyMs: 0.2,
      driverLatencyMs: 0.05,
      gimbalSuppressionPct: 100,
      dampingSuppressionPct: 100,
      lowFrequencyDisturbanceMrad: 0.55,
      highFrequencyDisturbanceMrad: 0.16,
      targetStepMrad: 0,
      targetSwayMrad: 0,
      targetBiasXMrad: 0,
      targetBiasYMrad: 0,
      mirrorPitchBiasMrad: 0,
      mirrorRollBiasMrad: 0,
      pixelNoisePx: 0
    });

    expect(Math.max(...ideal.samples.map((sample) => Math.abs(sample.residualPlatformMotionMrad)))).toBeLessThan(1e-9);
    expect(Math.max(...ideal.samples.map((sample) => Math.abs(sample.opticalTargetAngleMrad)))).toBeLessThan(1e-9);
    expect(ideal.metrics.rmsPointingErrorMrad).toBeLessThan(1e-6);
    expect(ideal.metrics.lockFractionPct).toBe(100);
  });

});


describe("AimingLabEngine", () => {
  it("keeps historical captures frozen when parameters change", () => {
    const engine = new AimingLabEngine(defaultAimingLabParameters);

    engine.step(0.06);
    const before = engine.getSnapshot();
    expect(before.captures.length).toBeGreaterThan(0);

    const frozenCapture = before.captures[0];
    const frozenCycle = JSON.parse(JSON.stringify(frozenCapture.cycle));

    engine.updateParams({
      ...defaultAimingLabParameters,
      memsDampingRatio: defaultAimingLabParameters.memsDampingRatio * 0.5,
      pidKd: defaultAimingLabParameters.pidKd * 3
    });
    engine.step(0.006);

    const after = engine.getSnapshot();
    const sameCapture = after.captures.find((capture) => capture.id === frozenCapture.id);

    expect(sameCapture).toBeDefined();
    expect(sameCapture?.cycle).toEqual(frozenCycle);
  });

  it("advances chart time monotonically without halting between shutter phases", () => {
    const engine = new AimingLabEngine(defaultAimingLabParameters);
    let previousTime = -Infinity;

    for (let index = 0; index < 40; index += 1) {
      engine.step(0.0025);
      const snapshot = engine.getSnapshot();
      expect(snapshot.simTimeS).toBeGreaterThan(previousTime);
      previousTime = snapshot.simTimeS;
    }

    const history = engine.getSnapshot().recentHistory;
    for (let index = 1; index < history.length; index += 1) {
      expect(history[index].timeS).toBeGreaterThanOrEqual(history[index - 1].timeS);
    }
  });

  it("stays centered in the stateful engine under ideal full-suppression conditions", () => {
    const engine = new AimingLabEngine({
      ...defaultAimingLabParameters,
      durationS: 1,
      cameraFps: 1000,
      exposureTimeMs: 0.2,
      processingLatencyMs: 0.2,
      driverLatencyMs: 0.05,
      gimbalSuppressionPct: 100,
      dampingSuppressionPct: 100,
      lowFrequencyDisturbanceMrad: 0.55,
      highFrequencyDisturbanceMrad: 0.16,
      targetStepMrad: 0,
      targetSwayMrad: 0,
      targetBiasXMrad: 0,
      targetBiasYMrad: 0,
      mirrorPitchBiasMrad: 0,
      mirrorRollBiasMrad: 0,
      pixelNoisePx: 0
    });

    engine.step(0.5);
    const snapshot = engine.getSnapshot();

    expect(snapshot.metrics.rmsPointingErrorMrad).toBeLessThan(1e-6);
    expect(Math.abs(snapshot.currentSample.pointingErrorMrad)).toBeLessThan(1e-6);
    expect(Math.abs(snapshot.currentSample.opticalTargetAngleMrad)).toBeLessThan(1e-9);
  });
});
