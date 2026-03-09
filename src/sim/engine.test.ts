import { describe, expect, it } from "vitest";
import { defaultParameters } from "./defaults";
import { MissionEngine } from "./engine";
import { DroneMode, SimulationParameters, TargetState } from "./types";

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

function createVisibleTarget(id: number, x: number, z: number): TargetState {
  return {
    ...createTarget(id, x, z),
    discovered: true,
    queued: true,
    detectedAtS: 0
  };
}

function createTestParams(overrides: Partial<SimulationParameters> = {}): SimulationParameters {
  return {
    ...defaultParameters,
    fieldLengthM: 28,
    fieldWidthM: 12,
    edgeDensityPerHectare: 0,
    gradientStrength: 1.2,
    batteryCapacityWh: 320,
    droneMassKg: 6.4,
    cruiseSpeedMps: 4.2,
    effectiveDragAreaM2: 0.08,
    laserPowerW: 180,
    engagementDwellS: 0.14,
    reserveBatteryPct: 14,
    rechargeTimeMin: 0.25,
    rowSpacingM: 0.9,
    searchAltitudeM: 2.8,
    engageAltitudeM: 1.95,
    detectionRadiusM: 2.7,
    laneSpacingM: 3,
    aimDurationS: 0.18,
    confirmDurationS: 0.12,
    maxHorizontalAccelMps2: 2.6,
    maxVerticalSpeedMps: 1.6,
    rotorDiskAreaM2: 1.08,
    propulsionEfficiency: 0.72,
    avionicsPowerW: 82,
    ...overrides
  };
}

function formatRecentLogs(engine: MissionEngine): string {
  const recent = engine.getDebugLog().slice(-30);
  const lines = recent.map((entry) => {
    const data = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
    return `${entry.timeS.toFixed(2)}s [${entry.mode}] ${entry.event}: ${entry.message}${data}`;
  });
  const state = engine.getDebugState();
  return [
    `mode=${engine.drone.mode}`,
    `activeTarget=${engine.drone.activeTargetId}`,
    `batteryWh=${engine.drone.batteryWh.toFixed(2)}`,
    `charge=${state.chargeTimerS.toFixed(2)}/${state.chargeDurationS.toFixed(2)} s`,
    `aliveTargets=${engine.targets.filter((target) => target.alive).length}`,
    `queue=${state.queue.join(",") || "empty"}`,
    `headingDeg=${((engine.drone.headingRad * 180) / Math.PI).toFixed(1)}`,
    `yawRateDegS=${((engine.drone.yawRateRadS * 180) / Math.PI).toFixed(1)}`,
    `position=(${engine.drone.position.x.toFixed(2)}, ${engine.drone.position.y.toFixed(2)}, ${engine.drone.position.z.toFixed(2)})`,
    "logs:",
    ...lines
  ].join("\n");
}

function stepSeconds(engine: MissionEngine, seconds: number, stepS = 0.05): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += stepS) {
    engine.step(stepS);
  }
}

function runUntil(
  engine: MissionEngine,
  predicate: () => boolean,
  timeoutS: number,
  stepS = 0.05
): void {
  for (let elapsed = 0; elapsed <= timeoutS; elapsed += stepS) {
    if (predicate()) {
      return;
    }
    engine.step(stepS);
  }

  throw new Error(`Timed out after ${timeoutS.toFixed(1)} s\n${formatRecentLogs(engine)}`);
}

function buildEngine(
  targets: TargetState[],
  {
    params = createTestParams(),
    batteryWh,
    playbackSpeed = 1
  }: {
    params?: SimulationParameters;
    batteryWh?: number;
    playbackSpeed?: number;
  } = {}
): MissionEngine {
  return new MissionEngine(params, 11, playbackSpeed, {
    enableDebugLogging: true,
    initialTargets: targets,
    initialBatteryWh: batteryWh
  });
}

function assertNoStuckWarnings(engine: MissionEngine): void {
  const stuckEvents = engine.getDebugLog().filter((entry) => entry.event === "stuck-warning");
  if (stuckEvents.length > 0) {
    throw new Error(`Unexpected stuck-warning entries\n${formatRecentLogs(engine)}`);
  }
}

// These tests deliberately extend the original list with queue integrity, recharge-resume,
// and summary-consistency cases so engine regressions are catchable without opening the UI.
describe("MissionEngine", () => {
  it("keeps changing position during an active mission", () => {
    const engine = buildEngine([
      createTarget(0, 2.2, 4.5),
      createTarget(1, 6.2, 4.65),
      createTarget(2, 12.8, 7.5)
    ]);
    const uniquePositions: string[] = [];

    for (let elapsed = 0; elapsed < 18; elapsed += 1) {
      stepSeconds(engine, 1);
      uniquePositions.push(
        `${engine.drone.position.x.toFixed(1)}:${engine.drone.position.y.toFixed(1)}:${engine.drone.position.z.toFixed(1)}`
      );
      if (engine.summary) {
        break;
      }
    }

    expect(new Set(uniquePositions).size).toBeGreaterThan(8);
    expect(engine.pathHistory.length).toBeGreaterThan(6);
    assertNoStuckWarnings(engine);
  });

  it("while beetles remain, it engages the next beetle within bounded time", () => {
    const engine = buildEngine([
      createTarget(0, 2.2, 4.5),
      createTarget(1, 6.2, 4.58),
      createTarget(2, 6.8, 4.32),
      createTarget(3, 13.6, 7.5)
    ]);

    runUntil(
      engine,
      () => engine.targets.filter((target) => !target.alive).length >= 1,
      25
    );
    const firstKillTime = engine.targets
      .filter((target) => !target.alive)
      .map((target) => target.neutralizedAtS ?? 0)[0];

    runUntil(
      engine,
      () => engine.targets.filter((target) => !target.alive).length >= 2,
      20
    );

    const killTimes = engine.targets
      .filter((target) => !target.alive)
      .map((target) => target.neutralizedAtS ?? 0)
      .sort((a, b) => a - b);

    expect(killTimes[1] - firstKillTime).toBeLessThan(18);
    expect(engine.targets.filter((target) => target.alive).length).toBeGreaterThan(0);
    assertNoStuckWarnings(engine);
  });

  it("slews yaw over time instead of snapping instantly to a new flight direction", () => {
    const params = createTestParams({
      fieldLengthM: 40,
      fieldWidthM: 20,
      cruiseSpeedMps: 5.4,
      maxHorizontalAccelMps2: 3.2
    });
    const engine = buildEngine([createVisibleTarget(0, 0, 10)], { params });

    engine.drone.mode = "approach";
    engine.drone.position = { x: 0, y: params.engageAltitudeM, z: 0 };
    engine.drone.velocity = { x: params.cruiseSpeedMps, y: 0, z: 0 };
    engine.drone.headingRad = 0;
    engine.drone.yawRateRadS = 0;
    engine.drone.activeTargetId = 0;
    engine.targets[0].position = { x: 0, y: 0.22, z: 10 };

    engine.step(0.05);

    expect(engine.drone.headingRad).toBeGreaterThan(0);
    expect(engine.drone.headingRad).toBeLessThan(0.12);
    expect(Math.abs(engine.drone.yawRateRadS)).toBeLessThanOrEqual(1.95);

    stepSeconds(engine, 0.8);

    expect(engine.drone.headingRad).toBeGreaterThan(0.8);
    assertNoStuckWarnings(engine);
  });

  it("when two beetles are visible at once, it picks a concrete target and shoots the nearer one first", () => {
    const engine = buildEngine(
      [
        createVisibleTarget(0, 2.8, 4.5),
        createVisibleTarget(1, 1.2, 4.58),
        createTarget(2, 12.8, 7.5)
      ]
    );

    runUntil(
      engine,
      () => engine.drone.mode === "approach" && engine.drone.activeTargetId !== null,
      12
    );

    expect(engine.drone.activeTargetId).toBe(1);

    runUntil(engine, () => engine.targets[1].alive === false, 14);

    expect(engine.targets[0].alive).toBe(true);
    assertNoStuckWarnings(engine);
  });

  it("uses the pre-surveyed route without relying on live detections", () => {
    const params = createTestParams({
      targetingMode: "preSurveyed",
      fieldLengthM: 36,
      fieldWidthM: 14
    });
    const engine = buildEngine(
      [
        createTarget(0, 4.2, 4.5),
        createTarget(1, 8.6, 4.6),
        createTarget(2, 13.4, 7.4),
        createTarget(3, 18.2, 7.2)
      ],
      { params }
    );

    expect(engine.targets.every((target) => target.discovered)).toBe(true);
    expect(engine.getDebugLog().some((entry) => entry.event === "route-planned")).toBe(true);

    runUntil(
      engine,
      () => engine.drone.mode === "approach" && engine.drone.activeTargetId !== null,
      12
    );

    expect(engine.getDebugLog().some((entry) => entry.event === "target-detected")).toBe(false);
    expect(engine.drone.activeTargetId).not.toBeNull();
    assertNoStuckWarnings(engine);
  });

  it("keeps mission physics invariant across playback-speed labels", () => {
    const targets = [
      createTarget(0, 2.2, 4.5),
      createTarget(1, 6.2, 4.58),
      createTarget(2, 13.6, 7.5)
    ];
    const engineNominal = buildEngine(targets, { playbackSpeed: 5.25 });
    const engineFast = buildEngine(targets, { playbackSpeed: 40 });

    stepSeconds(engineNominal, 18);
    stepSeconds(engineFast, 18);

    expect(engineFast.drone.position.x).toBeCloseTo(engineNominal.drone.position.x, 6);
    expect(engineFast.drone.position.z).toBeCloseTo(engineNominal.drone.position.z, 6);
    expect(engineFast.drone.batteryWh).toBeCloseTo(engineNominal.drone.batteryWh, 6);
    expect(engineFast.targets.filter((target) => !target.alive).length).toBe(
      engineNominal.targets.filter((target) => !target.alive).length
    );
    expect(engineFast.targets.map((target) => target.alive)).toEqual(
      engineNominal.targets.map((target) => target.alive)
    );
    assertNoStuckWarnings(engineNominal);
    assertNoStuckWarnings(engineFast);
  });

  it("does not keep hunting when battery is below the reserve threshold", () => {
    const params = createTestParams({
      batteryCapacityWh: 180,
      reserveBatteryPct: 22,
      rechargeTimeMin: 2
    });
    const engine = buildEngine([createTarget(0, 2.2, 4.5)], {
      params,
      batteryWh: 28
    });
    const observedModes = new Set<DroneMode>();

    stepSeconds(engine, 8);

    engine.getDebugLog().forEach((entry) => {
      if (entry.event === "mode-change" && typeof entry.data?.to === "string") {
        observedModes.add(entry.data.to as DroneMode);
      }
    });
    observedModes.add(engine.drone.mode);

    expect(engine.targets[0].alive).toBe(true);
    expect(observedModes.has("aiming")).toBe(false);
    expect(observedModes.has("firing")).toBe(false);
    expect(engine.getDebugLog().some((entry) => entry.event === "charging-start")).toBe(true);
    expect(engine.drone.mode).toBe("charging");
  });

  it("successfully hunts all beetles within the mission time bound", () => {
    const engine = buildEngine([
      createTarget(0, 2.2, 4.5),
      createTarget(1, 6.2, 4.6),
      createTarget(2, 6.9, 4.3),
      createTarget(3, 13.5, 7.5),
      createTarget(4, 18.5, 1.5)
    ]);

    runUntil(engine, () => engine.summary !== null, 95);

    expect(engine.targets.every((target) => !target.alive)).toBe(true);
    expect(engine.summary?.beetlesNeutralized).toBe(5);
    expect(engine.drone.mode).toBe("complete");
    assertNoStuckWarnings(engine);
  });

  it("can recharge, resume, and still complete the hunt", () => {
    const params = createTestParams({
      fieldLengthM: 28,
      fieldWidthM: 12,
      batteryCapacityWh: 7.2,
      reserveBatteryPct: 15,
      rechargeTimeMin: 0.08
    });
    const engine = buildEngine(
      [
        createTarget(0, 2.2, 4.5),
        createTarget(1, 3.4, 4.62),
        createTarget(2, 4.6, 4.28),
        createTarget(3, 5.8, 4.55),
        createTarget(4, 7.0, 4.18),
        createTarget(5, 8.2, 7.5),
        createTarget(6, 9.4, 7.62),
        createTarget(7, 10.6, 7.34)
      ],
      { params }
    );

    runUntil(
      engine,
      () => engine.getDebugLog().some((entry) => entry.event === "charging-start"),
      120
    );
    runUntil(engine, () => engine.summary !== null, 240);

    expect(engine.summary?.rechargeCycles).toBeGreaterThan(0);
    expect(engine.targets.every((target) => !target.alive)).toBe(true);
    assertNoStuckWarnings(engine);
  });

  it("fully charges before resuming the mission and does not bounce straight back into charging", () => {
    const params = createTestParams({
      fieldLengthM: 46,
      fieldWidthM: 16,
      batteryCapacityWh: 10.5,
      reserveBatteryPct: 18,
      rechargeTimeMin: 0.12
    });
    const engine = buildEngine(
      [
        createTarget(0, 2.2, 4.5),
        createTarget(1, 8.4, 4.65),
        createTarget(2, 13.8, 4.42),
        createTarget(3, 19.2, 4.58),
        createTarget(4, 24.6, 7.4),
        createTarget(5, 30.2, 7.55),
        createTarget(6, 35.6, 7.38)
      ],
      { params }
    );

    runUntil(
      engine,
      () => engine.getDebugLog().some((entry) => entry.event === "charging-start"),
      180
    );

    const chargeSamples: number[] = [];
    runUntil(
      engine,
      () => {
        if (engine.drone.mode === "charging") {
          chargeSamples.push(engine.drone.batteryWh);
        }
        return engine.getDebugLog().some((entry) => entry.event === "charging-complete");
      },
      120
    );

    expect(chargeSamples.length).toBeGreaterThan(2);
    expect(
      chargeSamples.every((sample, index) => index === 0 || sample >= chargeSamples[index - 1] - 1e-6)
    ).toBe(true);
    expect(engine.drone.batteryWh).toBeCloseTo(params.batteryCapacityWh, 6);

    const batteryAtDeparture = engine.drone.batteryWh;
    stepSeconds(engine, 12);

    expect(engine.drone.mode).not.toBe("charging");
    expect(engine.drone.batteryWh).toBeLessThan(batteryAtDeparture);
    expect(engine.pathHistory.length).toBeGreaterThan(10);
    expect(
      engine.getDebugLog().filter((entry) => entry.event === "charging-complete").length
    ).toBeGreaterThanOrEqual(1);
    assertNoStuckWarnings(engine);
  });

  it("resets an exhausted search sweep after charging so it does not bounce back to dock", () => {
    const params = createTestParams({
      fieldLengthM: 60,
      fieldWidthM: 18,
      targetingMode: "search",
      batteryCapacityWh: 14,
      reserveBatteryPct: 16,
      rechargeTimeMin: 0.2
    });
    const engine = buildEngine([createTarget(0, 21, 2.2)], {
      params,
      batteryWh: 3.5
    });
    const lastSweepIndex = engine.sweepPath.length - 1;

    (engine as unknown as { sweepIndex: number }).sweepIndex = lastSweepIndex;
    engine.drone.activeWaypointIndex = lastSweepIndex;
    (engine as unknown as { beginCharging: (reason: string, message: string) => void }).beginCharging(
      "test recharge",
      "Test recharge"
    );
    engine.skipCharging();

    expect((engine as unknown as { sweepIndex: number }).sweepIndex).toBe(0);
    expect(engine.drone.activeWaypointIndex).toBe(0);
    expect(engine.getDebugLog().some((entry) => entry.event === "search-reset")).toBe(true);

    stepSeconds(engine, 14);

    const postChargeEvents = engine.getDebugLog().slice(
      engine.getDebugLog().findIndex((entry) => entry.event === "charging-complete") + 1
    );
    expect(
      postChargeEvents.some(
        (entry) =>
          (entry.event === "reserve-return" ||
            (entry.event === "mode-change" && entry.data?.to === "returning")) &&
          (entry.data?.batteryWh as number | undefined ?? engine.drone.batteryWh) >
            params.batteryCapacityWh * 0.95
      )
    ).toBe(false);
    assertNoStuckWarnings(engine);
  });

  it("does not start a new charging cycle after a non-battery dock return", () => {
    const engine = buildEngine([createTarget(0, 9, 4.5)]);

    engine.drone.mode = "landing";
    engine.drone.position = { ...engine.dockPosition };
    engine.drone.velocity = { x: 0, y: 0, z: 0 };
    engine.drone.acceleration = { x: 0, y: 0, z: 0 };
    engine.drone.batteryWh = engine.params.batteryCapacityWh;
    (engine as unknown as { dockDirective: "recharge" | "resume" | "finish" }).dockDirective = "resume";

    engine.step(0.05);

    expect(engine.drone.mode).toBe("takeoff");
    expect(engine.getDebugLog().some((entry) => entry.event === "charging-start")).toBe(false);
  });

  it("slows below the configured firing speed before entering the firing state", () => {
    const params = createTestParams({
      maxFiringSpeedMps: 0.12,
      cruiseSpeedMps: 6.5
    });
    const engine = buildEngine(
      [
        createTarget(0, 2.2, 4.5),
        createTarget(1, 8.4, 4.65)
      ],
      { params }
    );

    let observedMaxFiringSpeed = 0;
    runUntil(
      engine,
      () => {
        if (engine.drone.mode === "firing") {
          const horizontalSpeed = Math.hypot(engine.drone.velocity.x, engine.drone.velocity.z);
          observedMaxFiringSpeed = Math.max(observedMaxFiringSpeed, horizontalSpeed);
        }

        return engine.targets[0].alive === false;
      },
      40
    );

    expect(
      engine.getDebugLog().some(
        (entry) => entry.event === "mode-change" && entry.data?.to === "firing"
      )
    ).toBe(true);
    expect(observedMaxFiringSpeed).toBeLessThanOrEqual(params.maxFiringSpeedMps + 0.02);

    runUntil(engine, () => engine.summary !== null, 60);
    expect(engine.summary?.beetlesNeutralized).toBe(2);
    assertNoStuckWarnings(engine);
  });

  it("exposes remaining charge time and can skip charging to full", () => {
    const params = createTestParams({
      fieldLengthM: 46,
      fieldWidthM: 16,
      batteryCapacityWh: 10.5,
      reserveBatteryPct: 18,
      rechargeTimeMin: 0.5
    });
    const engine = buildEngine(
      [
        createTarget(0, 2.2, 4.5),
        createTarget(1, 8.4, 4.65),
        createTarget(2, 13.8, 4.42),
        createTarget(3, 19.2, 4.58),
        createTarget(4, 24.6, 7.4),
        createTarget(5, 30.2, 7.55),
        createTarget(6, 35.6, 7.38)
      ],
      { params }
    );

    runUntil(
      engine,
      () => engine.getDebugLog().some((entry) => entry.event === "charging-start"),
      180
    );

    const chargingSnapshot = engine.getSnapshot();
    expect(chargingSnapshot.chargeStatus).not.toBeNull();
    expect((chargingSnapshot.chargeStatus?.remainingS ?? 0) > 0).toBe(true);

    engine.skipCharging();

    const postSkipSnapshot = engine.getSnapshot();
    expect(postSkipSnapshot.chargeStatus).toBeNull();
    expect(engine.drone.batteryWh).toBeCloseTo(params.batteryCapacityWh, 6);
    expect(engine.drone.mode).toBe("takeoff");
    expect(
      engine.getDebugLog().some(
        (entry) => entry.event === "charging-complete" && entry.data?.skipped === true
      )
    ).toBe(true);
  });

  it("keeps the queue clean and summary metrics internally consistent", () => {
    const engine = buildEngine([
      createTarget(0, 2.2, 4.5),
      createTarget(1, 6.2, 4.6),
      createTarget(2, 6.9, 4.3),
      createTarget(3, 13.5, 7.5)
    ]);

    runUntil(engine, () => engine.summary !== null, 90);

    const debugState = engine.getDebugState();
    const aliveQueuedTargets = debugState.queue.map((targetId) => engine.targets[targetId]?.alive ?? false);
    expect(new Set(debugState.queue).size).toBe(debugState.queue.length);
    expect(aliveQueuedTargets.every(Boolean)).toBe(true);
    expect(engine.summary?.beetlesNeutralized).toBe(4);
    expect(engine.summary?.energyPerBeetleWh).toBeCloseTo(
      (engine.summary?.totalEnergyWh ?? 0) / 4,
      6
    );
    expect(engine.summary?.batteryDepreciationCostUsd).toBeGreaterThan(0);
    expect(engine.summary?.costPerHectareUsd).toBeGreaterThan(0);
    assertNoStuckWarnings(engine);
  });

  it("advances through a dense 10 hectare infestation without blowing up mission state", () => {
    const params = createTestParams({
      fieldLengthM: 400,
      fieldWidthM: 250,
      targetingMode: "search",
      edgeDensityPerHectare: 1600,
      gradientStrength: 9,
      batteryCapacityWh: 320,
      reserveBatteryPct: 16,
      droneMassKg: 1.2,
      cruiseSpeedMps: 8,
      effectiveDragAreaM2: 0.028,
      laserPowerW: 50,
      engagementDwellS: 0.2,
      detectionRadiusM: 3.2,
      laneSpacingM: 5.4,
      rowSpacingM: 0.9,
      maxHorizontalAccelMps2: 3.4,
      avionicsPowerW: 24
    });
    const engine = new MissionEngine(params, 17, 1, {
      enableDebugLogging: true
    });

    expect(engine.targets.length).toBeGreaterThan(12_000);
    expect(engine.targets.length).toBeLessThan(20_000);

    stepSeconds(engine, 4, 0.05);

    expect(engine.pathHistory.length).toBeGreaterThan(2);
    expect(["takeoff", "searching", "approach", "aiming", "firing", "confirming"]).toContain(
      engine.drone.mode
    );
    expect(Number.isFinite(engine.drone.position.x)).toBe(true);
    expect(Number.isFinite(engine.drone.position.z)).toBe(true);
    assertNoStuckWarnings(engine);
  });
});
