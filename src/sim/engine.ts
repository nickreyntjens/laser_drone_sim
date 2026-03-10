import {
  DEFAULT_SEED,
  PLAYBACK_SPEED,
  RENDER_SCALE_M_PER_UNIT,
  clamp,
  lerp
} from "./defaults";
import {
  NOMINAL_FIRING_STANDOFF_DISTANCE_M
} from "./rendering";
import {
  calculateNominalSafetyZoneRadiusM,
  safetyInputFromParameters
} from "./safety";
import {
  add,
  angleFromVector,
  clampLength,
  distance,
  dot,
  horizontalDistance,
  horizontalLength,
  horizontalNormalize,
  scale,
  shortestAngleDeltaRad,
  subtract,
  vec3,
  wrapAngleRad
} from "./math";
import { buildSweepPath, generateTargets } from "./generation";
import { planPreSurveyedTargetRoute } from "./planner";
import {
  InternalFarmerState,
  horizontalDistanceToPoint,
  initializeFarmers,
  stepFarmers
} from "./farmers";
import {
  MissionDebugState,
  MissionEngineOptions,
  MissionLogEvent,
  DroneMode,
  EnergyBreakdown,
  MissionMetrics,
  MissionSummary,
  SimulationParameters,
  SimulationSnapshot,
  TargetState,
  Vec3
} from "./types";

const AIR_DENSITY = 1.225;
const GRAVITY = 9.81;
const BRAKING_FACTOR = 0.42;
const DESCENT_FACTOR = 0.18;
const ATTITUDE_RESPONSE = 0.18;
const YAW_RESPONSE_S = 0.34;
const MAX_YAW_RATE_RAD_S = 1.9;
const RESUME_BUFFER_S = 18;
const APPROACH_HANDOFF_RADIUS_M = 0.48;
const FIRING_CONTROL_MARGIN_M = 0.08;
const FARMER_REVISIT_DELAY_S = 9;
const FARMER_AVOIDANCE_RADIUS_M = 1.4;
const FARMER_CLEARANCE_HEIGHT_M = 0.45;
const FARMER_AVOIDANCE_LOOKAHEAD_S = 1.2;
const FARMER_AVOIDANCE_INFLUENCE_M = 4.8;
const FARMER_AVOIDANCE_MARGIN_M = 0.55;
const FARMER_LATERAL_EVASION_MPS = 0.85;
const STUCK_WARNING_AFTER_S = 8;
const APPROACH_BRAKING_BUFFER_M = 0.24;
const MIN_RECAPTURE_SPEED_MPS = 0.9;
const MIN_APPROACH_SPEED_MPS = 0.28;
const MAX_VERTICAL_ACCEL_FACTOR = 0.9;

function cloneVec3(source: Vec3): Vec3 {
  return { x: source.x, y: source.y, z: source.z };
}

function cloneTarget(source: TargetState, id: number): TargetState {
  return {
    ...source,
    id,
    position: cloneVec3(source.position),
    blockedUntilS: source.blockedUntilS ?? 0
  };
}

function normalizeTargets(targets: TargetState[]): TargetState[] {
  return targets.map((target, index) => cloneTarget(target, index));
}

function zeroEnergyBreakdown(): EnergyBreakdown {
  return {
    flightWh: 0,
    hoverWh: 0,
    accelerationWh: 0,
    laserWh: 0,
    avionicsWh: 0
  };
}

function energyFractions(
  breakdown: EnergyBreakdown
): MissionMetrics["energyFractions"] {
  const total =
    breakdown.flightWh +
    breakdown.hoverWh +
    breakdown.accelerationWh +
    breakdown.laserWh +
    breakdown.avionicsWh;

  if (total <= 1e-6) {
    return {
      flight: 0,
      hover: 0,
      acceleration: 0,
      laser: 0,
      avionics: 0
    };
  }

  return {
    flight: breakdown.flightWh / total,
    hover: breakdown.hoverWh / total,
    acceleration: breakdown.accelerationWh / total,
    laser: breakdown.laserWh / total,
    avionics: breakdown.avionicsWh / total
  };
}

function calculateEquivalentFullCyclesUsed(
  totalEnergyWh: number,
  params: SimulationParameters
): number {
  return totalEnergyWh / Math.max(params.batteryCapacityWh, 1e-6);
}

function calculateBatteryDepreciationCostUsd(
  totalEnergyWh: number,
  params: SimulationParameters
): number {
  const equivalentCycles = calculateEquivalentFullCyclesUsed(totalEnergyWh, params);
  return (
    equivalentCycles *
    (params.batteryReplacementCostUsd / Math.max(params.batteryCycleLife, 1))
  );
}

function calculateCostPerHectareUsd(
  totalEnergyWh: number,
  params: SimulationParameters
): number {
  const fieldAreaHectares =
    (params.fieldLengthM * params.fieldWidthM) / 10_000;
  return calculateBatteryDepreciationCostUsd(totalEnergyWh, params) / Math.max(fieldAreaHectares, 1e-6);
}

function isFlightMode(mode: DroneMode): boolean {
  return mode !== "idle" && mode !== "charging" && mode !== "complete";
}

function calculateHoverPowerW(params: SimulationParameters): number {
  const thrust = params.droneMassKg * GRAVITY;
  const idealInduced =
    Math.pow(thrust, 1.5) /
    Math.sqrt(2 * AIR_DENSITY * Math.max(params.rotorDiskAreaM2, 0.1));
  const profileFactor = 1.28;
  return (idealInduced * profileFactor) / Math.max(params.propulsionEfficiency, 0.2);
}

function calculateCruiseDragPowerW(
  params: SimulationParameters,
  speedMps: number
): number {
  return (
    0.5 *
    AIR_DENSITY *
    params.effectiveDragAreaM2 *
    Math.pow(Math.max(speedMps, 0), 3)
  ) / Math.max(params.propulsionEfficiency, 0.2);
}

function clampBatteryWh(params: SimulationParameters, batteryWh: number): number {
  return clamp(batteryWh, 0, params.batteryCapacityWh);
}

interface PowerSample {
  instantaneousPowerW: number;
  flightW: number;
  hoverW: number;
  accelerationW: number;
  laserW: number;
  avionicsW: number;
}

interface InternalDroneState {
  position: Vec3;
  velocity: Vec3;
  acceleration: Vec3;
  headingRad: number;
  yawRateRadS: number;
  rollRad: number;
  pitchRad: number;
  instantaneousPowerW: number;
  batteryWh: number;
  mode: DroneMode;
  activeTargetId: number | null;
  activeWaypointIndex: number;
}

export class MissionEngine {
  public readonly params: SimulationParameters;

  public readonly seed: number;

  public playbackSpeed: number;

  public readonly renderScaleMPerUnit: number;

  public readonly dockPosition: Vec3;

  public readonly nominalSafetyZoneRadiusM: number;

  public readonly sweepPath: Vec3[];

  public readonly targets: TargetState[];

  public readonly farmers: InternalFarmerState[];

  public readonly pathHistory: Vec3[];

  public readonly drone: InternalDroneState;

  public readonly energy: EnergyBreakdown;

  public summary: MissionSummary | null;

  private missionElapsedS: number;

  private rechargeCycles: number;

  private neutralizedCount: number;

  private detectedCount: number;

  private sweepIndex: number;

  private modeTimerS: number;

  private chargeTimerS: number;

  private chargeStartBatteryWh: number;

  private chargeDurationS: number;

  private targetQueue: number[];

  private readonly enableDebugLogging: boolean;

  private readonly maxLogEntries: number;

  private readonly onLogEvent?: (entry: MissionLogEvent) => void;

  private readonly debugLog: MissionLogEvent[];

  private dockDirective: "recharge" | "resume" | "finish";

  private progressProbe: {
    mode: DroneMode;
    targetId: number | null;
    lastDistanceM: number;
    lastPosition: Vec3;
    staleForS: number;
    lastWarningAtS: number;
  };

  constructor(
    params: SimulationParameters,
    seed = DEFAULT_SEED,
    playbackSpeed = PLAYBACK_SPEED,
    options: MissionEngineOptions = {}
  ) {
    this.params = params;
    this.seed = seed;
    this.playbackSpeed = playbackSpeed;
    this.renderScaleMPerUnit = RENDER_SCALE_M_PER_UNIT;
    this.dockPosition = vec3(-10, 0.18, params.fieldWidthM * 0.5);
    this.nominalSafetyZoneRadiusM = calculateNominalSafetyZoneRadiusM(
      safetyInputFromParameters(params)
    );
    this.sweepPath = buildSweepPath(params);
    this.targets = normalizeTargets(options.initialTargets ?? generateTargets(params, seed));
    this.farmers = initializeFarmers(params, seed);
    this.pathHistory = [];
    this.energy = zeroEnergyBreakdown();
    this.summary = null;
    this.missionElapsedS = 0;
    this.rechargeCycles = 0;
    this.neutralizedCount = this.targets.filter((target) => !target.alive).length;
    this.detectedCount = this.targets.filter((target) => target.discovered).length;
    this.sweepIndex = 0;
    this.modeTimerS = 0;
    this.chargeTimerS = 0;
    this.chargeStartBatteryWh = clampBatteryWh(
      params,
      options.initialBatteryWh ?? params.batteryCapacityWh
    );
    this.chargeDurationS = 0;
    this.targetQueue = this.targets
      .filter((target) => target.alive && target.queued)
      .map((target) => target.id);
    this.enableDebugLogging = options.enableDebugLogging ?? false;
    this.maxLogEntries = options.maxLogEntries ?? 500;
    this.onLogEvent = options.onLogEvent;
    this.debugLog = [];
    this.dockDirective = "resume";

    this.drone = {
      position: cloneVec3(this.dockPosition),
      velocity: vec3(),
      acceleration: vec3(),
      headingRad: 0,
      yawRateRadS: 0,
      rollRad: 0,
      pitchRad: 0,
      instantaneousPowerW: 0,
      batteryWh: this.chargeStartBatteryWh,
      mode: "takeoff",
      activeTargetId: this.targetQueue[0] ?? null,
      activeWaypointIndex: 0
    };
    this.progressProbe = {
      mode: this.drone.mode,
      targetId: this.drone.activeTargetId,
      lastDistanceM: 0,
      lastPosition: cloneVec3(this.drone.position),
      staleForS: 0,
      lastWarningAtS: Number.NEGATIVE_INFINITY
    };

    if (this.params.targetingMode === "preSurveyed") {
      const route = planPreSurveyedTargetRoute(
        this.params,
        this.dockPosition,
        this.targets.filter((target) => target.alive)
      );
      for (let index = 0; index < this.targets.length; index += 1) {
        const target = this.targets[index];
        target.discovered = target.alive;
        target.queued = target.alive;
      }
      this.detectedCount = this.targets.filter((target) => target.alive).length;
      this.targetQueue = route;
      this.drone.activeTargetId = this.targetQueue[0] ?? null;
      this.logEvent("route-planned", "Pre-surveyed route planned", {
        targets: route.length,
        targetingMode: this.params.targetingMode
      });
    }

    this.pushHistory();
    this.pruneTargetQueue("constructor");
    const reserveWh = (this.params.reserveBatteryPct / 100) * this.params.batteryCapacityWh;
    if (this.drone.batteryWh <= reserveWh) {
      this.drone.activeTargetId = null;
      this.beginCharging("initial battery below reserve", "Initial battery below reserve; charging at dock", {
        reserveWh
      });
    }
    this.logEvent("mission-start", "Mission engine initialized", {
      targets: this.targets.length,
      batteryWh: this.drone.batteryWh,
      playbackSpeed: this.playbackSpeed
    });
  }

  public step(realDtS: number): void {
    if (this.drone.mode === "complete") {
      return;
    }

    const simDt = Math.min(Math.max(realDtS, 0), 0.05);
    if (simDt <= 0) {
      return;
    }

    this.missionElapsedS += simDt;
    this.modeTimerS += simDt;

    this.decayTargetEffects(simDt);
    stepFarmers(this.farmers, this.params, this.drone.position, this.missionElapsedS, simDt);

    if (this.drone.mode === "charging") {
      this.stepCharging(simDt);
      return;
    }

    this.detectTargets();
    this.checkReserveNeed();
    this.selectTargetIfNeeded();

    const beforeVelocity = cloneVec3(this.drone.velocity);
    this.stepMotion(simDt);

    const acceleration = scale(subtract(this.drone.velocity, beforeVelocity), 1 / simDt);
    this.drone.acceleration = acceleration;
    this.updateAttitude(simDt);
    this.checkFarmerSafetyInterference();
    this.processModeTransitions();
    this.updateStuckMonitor(simDt);

    const power = this.samplePower();
    this.applyPower(power, simDt);
    this.pushHistory();
  }

  public getSnapshot(): SimulationSnapshot {
    const totalEnergyWh =
      this.energy.flightWh +
      this.energy.hoverWh +
      this.energy.accelerationWh +
      this.energy.laserWh +
      this.energy.avionicsWh;
    const remaining = this.targets.filter((target) => target.alive).length;
    return {
      params: this.params,
      nominalSafetyZoneRadiusM: this.nominalSafetyZoneRadiusM,
      drone: {
        position: cloneVec3(this.drone.position),
        velocity: cloneVec3(this.drone.velocity),
        acceleration: cloneVec3(this.drone.acceleration),
        headingRad: this.drone.headingRad,
        yawRateRadS: this.drone.yawRateRadS,
        rollRad: this.drone.rollRad,
        pitchRad: this.drone.pitchRad,
        instantaneousPowerW: this.drone.instantaneousPowerW,
        batteryWh: this.drone.batteryWh,
        batteryPct: this.drone.batteryWh / this.params.batteryCapacityWh,
        mode: this.drone.mode,
        activeTargetId: this.drone.activeTargetId,
        activeWaypointIndex: this.drone.activeWaypointIndex
      },
      targets: this.targets.map((target) => ({ ...target, position: cloneVec3(target.position) })),
      farmers: this.farmers.map((farmer) => ({
        ...farmer,
        position: cloneVec3(farmer.position)
      })),
      metrics: {
        missionElapsedS: this.missionElapsedS,
        totalEnergyWh,
        rechargeCycles: this.rechargeCycles,
        beetlesNeutralized: this.neutralizedCount,
        beetlesRemaining: remaining,
        averageTimePerTargetS:
          this.neutralizedCount > 0 ? this.missionElapsedS / this.neutralizedCount : 0,
        energyPerBeetleWh: this.neutralizedCount > 0 ? totalEnergyWh / this.neutralizedCount : 0,
        batteryDepreciationCostUsd: calculateBatteryDepreciationCostUsd(totalEnergyWh, this.params),
        costPerHectareUsd: calculateCostPerHectareUsd(totalEnergyWh, this.params),
        equivalentFullCyclesUsed: calculateEquivalentFullCyclesUsed(totalEnergyWh, this.params),
        energyFractions: energyFractions(this.energy)
      },
      chargeStatus:
        this.drone.mode === "charging"
          ? {
              remainingS: Math.max(this.chargeDurationS - this.chargeTimerS, 0),
              totalS: this.chargeDurationS
            }
          : null,
      summary: this.summary,
      seed: this.seed,
      playbackSpeed: this.playbackSpeed,
      renderScaleMPerUnit: this.renderScaleMPerUnit,
      dockPosition: cloneVec3(this.dockPosition),
      pathHistory: this.pathHistory.map((point) => cloneVec3(point)),
      sweepPath: this.sweepPath.map((point) => cloneVec3(point))
    };
  }

  public getDebugLog(): MissionLogEvent[] {
    return this.debugLog.map((entry) => ({
      ...entry,
      data: entry.data ? { ...entry.data } : undefined
    }));
  }

  public getDebugState(): MissionDebugState {
    return {
      queue: [...this.targetQueue],
      modeTimerS: this.modeTimerS,
      chargeTimerS: this.chargeTimerS,
      chargeDurationS: this.chargeDurationS,
      neutralizedCount: this.neutralizedCount,
      detectedCount: this.detectedCount
    };
  }

  public skipCharging(): void {
    if (this.drone.mode !== "charging") {
      return;
    }

    this.completeCharging(true);
  }

  private stepCharging(simDt: number): void {
    this.chargeTimerS = Math.min(this.chargeTimerS + simDt, this.chargeDurationS);
    const fraction =
      this.chargeDurationS <= 1e-6
        ? 1
        : clamp(this.chargeTimerS / this.chargeDurationS, 0, 1);

    this.drone.batteryWh = lerp(
      this.chargeStartBatteryWh,
      this.params.batteryCapacityWh,
      fraction
    );
    this.drone.instantaneousPowerW = 0;
    this.drone.velocity = vec3();
    this.drone.acceleration = vec3();
    this.drone.yawRateRadS = 0;
    this.drone.mode = "charging";

    if (fraction >= 1) {
      this.completeCharging();
    }
  }

  private decayTargetEffects(simDt: number): void {
    for (let index = 0; index < this.targets.length; index += 1) {
      const target = this.targets[index];
      target.detectionPulse = Math.max(0, target.detectionPulse - simDt * 1.4);
      target.neutralizationPulse = Math.max(0, target.neutralizationPulse - simDt * 0.8);
      if (this.drone.activeTargetId !== target.id) {
        target.engagementProgress = Math.max(0, target.engagementProgress - simDt * 2.2);
      }
    }
  }

  private detectTargets(): void {
    if (this.drone.mode !== "searching" || this.params.targetingMode === "preSurveyed") {
      return;
    }

    const searchPosition = this.drone.position;
    for (let index = 0; index < this.targets.length; index += 1) {
      const target = this.targets[index];
      if (!target.alive || target.discovered) {
        continue;
      }

      if (horizontalDistance(searchPosition, target.position) <= this.params.detectionRadiusM) {
        target.discovered = true;
        target.queued = true;
        target.detectionPulse = 1;
        target.detectedAtS = this.missionElapsedS;
        this.targetQueue.push(target.id);
        this.detectedCount += 1;
        this.logEvent("target-detected", `Detected beetle ${target.id}`, {
          targetId: target.id,
          x: target.position.x,
          z: target.position.z,
          queueLength: this.targetQueue.length
        });
      }
    }
  }

  private isTargetTemporarilyBlocked(targetId: number): boolean {
    const target = this.targets[targetId];
    return !!target && target.blockedUntilS > this.missionElapsedS;
  }

  private deferActiveTargetForFarmer(
    reason: string,
    blockingFarmerId: number | null,
    blockingDistanceM: number | null
  ): void {
    if (this.drone.activeTargetId === null) {
      return;
    }

    const target = this.targets[this.drone.activeTargetId];
    if (!target || !target.alive) {
      return;
    }

    target.blockedUntilS = this.missionElapsedS + FARMER_REVISIT_DELAY_S;
    target.engagementProgress = 0;
    target.queued = true;

    this.targetQueue = this.targetQueue.filter((targetId) => targetId !== target.id);
    this.targetQueue.push(target.id);

    this.logEvent("safety-hold", "Farmer entered the nominal laser safety zone; deferring shot", {
      targetId: target.id,
      farmerId: blockingFarmerId,
      blockingDistanceM,
      nominalSafetyZoneRadiusM: this.nominalSafetyZoneRadiusM,
      blockedUntilS: target.blockedUntilS,
      queueLength: this.targetQueue.length
    });

    this.setActiveTarget(null, reason);
    this.transitionTo("searching", "farmer inside safety zone");
  }

  private checkFarmerSafetyInterference(): void {
    if (
      this.drone.mode !== "approach" &&
      this.drone.mode !== "aiming" &&
      this.drone.mode !== "firing"
    ) {
      return;
    }

    const activeTarget =
      this.drone.activeTargetId !== null ? this.targets[this.drone.activeTargetId] : null;
    let blockingFarmerId: number | null = null;
    let blockingDistanceM: number | null = null;

    for (let index = 0; index < this.farmers.length; index += 1) {
      const farmer = this.farmers[index];
      const droneDistanceM = horizontalDistanceToPoint(this.drone.position, farmer.position);
      const targetDistanceM = activeTarget
        ? horizontalDistanceToPoint(activeTarget.position, farmer.position)
        : Number.POSITIVE_INFINITY;
      const targetSafetyHold =
        activeTarget !== null && targetDistanceM <= this.nominalSafetyZoneRadiusM;
      const droneAvoidanceHold =
        droneDistanceM <= FARMER_AVOIDANCE_RADIUS_M &&
        this.drone.position.y <= farmer.heightM + FARMER_CLEARANCE_HEIGHT_M;

      if (targetSafetyHold || droneAvoidanceHold) {
        blockingFarmerId = farmer.id;
        blockingDistanceM = targetSafetyHold ? targetDistanceM : droneDistanceM;
        break;
      }
    }

    if (blockingFarmerId !== null) {
      this.deferActiveTargetForFarmer(
        `farmer ${blockingFarmerId} safety hold`,
        blockingFarmerId,
        blockingDistanceM
      );
    }
  }

  private selectTargetIfNeeded(): void {
    this.pruneTargetQueue("selectTargetIfNeeded");

    if (this.drone.mode === "approach" || this.drone.mode === "aiming" || this.drone.mode === "firing") {
      return;
    }

    if (this.drone.mode === "returning" || this.drone.mode === "landing" || this.drone.mode === "charging") {
      return;
    }

    if (this.drone.mode === "searching" && this.targetQueue.length > 0) {
      const nextTargetId = this.pickNextQueuedTarget();
      if (nextTargetId !== null) {
        this.setActiveTarget(
          nextTargetId,
          this.params.targetingMode === "preSurveyed" ? "next planned target" : "nearest queued target"
        );
        this.transitionTo("approach", "queued target available", {
          targetId: nextTargetId,
          queueLength: this.targetQueue.length
        });
      }
    }
  }

  private pickNextQueuedTarget(): number | null {
    if (this.params.targetingMode === "preSurveyed") {
      for (let index = 0; index < this.targetQueue.length; index += 1) {
        const targetId = this.targetQueue[index];
        const target = this.targets[targetId];
        if (!target || !target.alive || this.isTargetTemporarilyBlocked(targetId)) {
          continue;
        }
        return targetId;
      }
      return null;
    }

    let bestId: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < this.targetQueue.length; index += 1) {
      const targetId = this.targetQueue[index];
      const target = this.targets[targetId];
      if (!target || !target.alive || this.isTargetTemporarilyBlocked(targetId)) {
        continue;
      }

      const candidateDistance = horizontalDistance(this.drone.position, target.position);
      if (candidateDistance < bestDistance) {
        bestDistance = candidateDistance;
        bestId = targetId;
      }
    }

    return bestId;
  }

  private hasEligibleQueuedTarget(): boolean {
    return this.pickNextQueuedTarget() !== null;
  }

  private checkReserveNeed(): void {
    this.pruneTargetQueue("checkReserveNeed");

    if (
      this.drone.mode === "returning" ||
      this.drone.mode === "landing" ||
      this.drone.mode === "charging" ||
      this.drone.mode === "complete"
    ) {
      return;
    }

    const reserveWh = (this.params.reserveBatteryPct / 100) * this.params.batteryCapacityWh;
    const returnNeedWh = this.estimateReturnEnergyWh();
    const shouldReturn =
      this.drone.batteryWh <= reserveWh + returnNeedWh ||
      this.drone.batteryWh / this.params.batteryCapacityWh <=
        this.params.reserveBatteryPct / 100;

    if (shouldReturn && this.drone.mode !== "takeoff") {
      this.dockDirective = "recharge";
      this.setActiveTarget(null, "battery reserve triggered return");
      this.logEvent("reserve-return", "Reserve threshold triggered dock return", {
        batteryWh: this.drone.batteryWh,
        reserveWh,
        returnNeedWh
      });
      this.transitionTo("returning", "battery reserve threshold reached");
      for (let index = 0; index < this.targetQueue.length; index += 1) {
        const target = this.targets[this.targetQueue[index]];
        if (target) {
          target.engagementProgress = 0;
        }
      }
    }
  }

  private estimateReturnEnergyWh(): number {
    const cruisePower =
      calculateHoverPowerW(this.params) * 0.94 +
      calculateCruiseDragPowerW(this.params, this.params.cruiseSpeedMps) +
      this.params.avionicsPowerW;
    const horizontalTrip =
      horizontalDistance(this.drone.position, vec3(this.dockPosition.x, this.drone.position.y, this.dockPosition.z)) /
      Math.max(this.params.cruiseSpeedMps, 0.5);
    const verticalTrip =
      Math.abs(this.drone.position.y - this.dockPosition.y) /
      Math.max(this.params.maxVerticalSpeedMps, 0.4);
    const totalTime = horizontalTrip + verticalTrip + RESUME_BUFFER_S;
    return (cruisePower * totalTime) / 3600;
  }

  private currentMotionTarget(): Vec3 {
    if (this.drone.mode === "takeoff") {
      return vec3(this.dockPosition.x, this.params.searchAltitudeM, this.dockPosition.z);
    }

    if (this.drone.mode === "searching") {
      return this.sweepPath[Math.min(this.sweepIndex, this.sweepPath.length - 1)];
    }

    if (this.drone.mode === "approach" || this.drone.mode === "aiming" || this.drone.mode === "firing" || this.drone.mode === "confirming") {
      const target = this.drone.activeTargetId !== null ? this.targets[this.drone.activeTargetId] : null;
      if (target) {
        // Keep a small control margin below the max firing range so the aiming state can settle
        // without repeatedly falling just outside the nominal 1 m envelope.
        return vec3(
          target.position.x,
          target.position.y + Math.max(0.2, NOMINAL_FIRING_STANDOFF_DISTANCE_M - FIRING_CONTROL_MARGIN_M),
          target.position.z
        );
      }
    }

    if (this.drone.mode === "returning") {
      return vec3(this.dockPosition.x, this.params.searchAltitudeM, this.dockPosition.z);
    }

    if (this.drone.mode === "landing") {
      return cloneVec3(this.dockPosition);
    }

    return cloneVec3(this.drone.position);
  }

  private restoreKnownTargetsToQueue(reason: string): number {
    if (this.params.targetingMode === "preSurveyed") {
      const route = planPreSurveyedTargetRoute(
        this.params,
        this.drone.position,
        this.targets.filter((target) => target.alive)
      );
      const changed =
        route.length !== this.targetQueue.length ||
        route.some((targetId, index) => this.targetQueue[index] !== targetId);

      this.targetQueue = route;
      if (changed) {
        this.logEvent("route-planned", "Replanned remaining pre-surveyed targets", {
          targets: route.length,
          reason
        });
      }
      return changed ? route.length : 0;
    }

    const queuedTargets = new Set(this.targetQueue);
    let restoredCount = 0;
    for (let index = 0; index < this.targets.length; index += 1) {
      const target = this.targets[index];
      if (
        !target.alive ||
        !target.discovered ||
        queuedTargets.has(target.id) ||
        target.id === this.drone.activeTargetId
      ) {
        continue;
      }

      this.targetQueue.push(target.id);
      target.queued = true;
      queuedTargets.add(target.id);
      restoredCount += 1;
    }

    return restoredCount;
  }

  private restartSearchSweep(reason: string, origin: "dock" | "field" = "field"): void {
    if (this.sweepPath.length === 0) {
      return;
    }

    this.sweepIndex = 0;
    this.drone.activeWaypointIndex = 0;
    this.logEvent("search-reset", "Restarting sweep to continue searching for remaining beetles", {
      origin,
      aliveTargets: this.targets.filter((target) => target.alive).length,
      reason
    });
  }

  private prepareResumeFromDock(reason: string): void {
    const restoredTargets = this.restoreKnownTargetsToQueue(reason);
    if (
      restoredTargets === 0 &&
      this.params.targetingMode === "search" &&
      this.targets.some((target) => target.alive) &&
      this.sweepPath.length > 0 &&
      this.sweepIndex >= this.sweepPath.length - 1
    ) {
      this.restartSearchSweep(reason, "dock");
    }
  }

  private updateYaw(simDt: number, desiredHeadingRad: number | null): void {
    if (desiredHeadingRad === null) {
      const damping = 1 - Math.exp(-simDt * 8);
      this.drone.yawRateRadS = lerp(this.drone.yawRateRadS, 0, damping);
      return;
    }

    const headingError = shortestAngleDeltaRad(this.drone.headingRad, desiredHeadingRad);
    const commandedYawRate = clamp(
      headingError / Math.max(YAW_RESPONSE_S, 1e-3),
      -MAX_YAW_RATE_RAD_S,
      MAX_YAW_RATE_RAD_S
    );

    this.drone.headingRad = wrapAngleRad(this.drone.headingRad + commandedYawRate * simDt);
    this.drone.yawRateRadS = commandedYawRate;
  }

  private computeApproachSpeedMps(
    horizontalDistanceM: number,
    targetDirection: Vec3
  ): number {
    const maxHorizontalAccelMps2 = Math.max(this.params.maxHorizontalAccelMps2, 0.1);
    const remainingDistanceM = Math.max(
      horizontalDistanceM - APPROACH_HANDOFF_RADIUS_M,
      0
    );

    if (remainingDistanceM <= 1e-3) {
      return 0;
    }

    const horizontalVelocity = vec3(this.drone.velocity.x, 0, this.drone.velocity.z);
    const closingSpeedMps = dot(horizontalVelocity, targetDirection);
    const brakingDistanceM =
      Math.max(closingSpeedMps, 0) * Math.max(closingSpeedMps, 0) /
      (2 * maxHorizontalAccelMps2);

    if (closingSpeedMps <= 0.05) {
      return Math.min(
        this.params.cruiseSpeedMps,
        Math.max(
          MIN_RECAPTURE_SPEED_MPS,
          Math.sqrt(2 * maxHorizontalAccelMps2 * remainingDistanceM)
        )
      );
    }

    if (remainingDistanceM > brakingDistanceM + APPROACH_BRAKING_BUFFER_M) {
      return this.params.cruiseSpeedMps;
    }

    return clamp(
      Math.sqrt(2 * maxHorizontalAccelMps2 * remainingDistanceM),
      MIN_APPROACH_SPEED_MPS,
      this.params.cruiseSpeedMps
    );
  }

  private computeFarmerAvoidanceVelocity(
    desiredHorizontalVelocity: Vec3
  ): Vec3 {
    if (horizontalLength(desiredHorizontalVelocity) <= 1e-6) {
      return desiredHorizontalVelocity;
    }

    let adjustedVelocity = desiredHorizontalVelocity;
    const maxHorizontalAccelMps2 = Math.max(this.params.maxHorizontalAccelMps2, 0.1);

    for (let index = 0; index < this.farmers.length; index += 1) {
      const farmer = this.farmers[index];
      if (this.drone.position.y > farmer.heightM + FARMER_CLEARANCE_HEIGHT_M) {
        continue;
      }

      const relPosition = vec3(
        farmer.position.x - this.drone.position.x,
        0,
        farmer.position.z - this.drone.position.z
      );
      const distanceToFarmerM = horizontalLength(relPosition);
      if (distanceToFarmerM <= 1e-6 || distanceToFarmerM > FARMER_AVOIDANCE_INFLUENCE_M) {
        continue;
      }

      const farmerDirection = horizontalNormalize(relPosition);
      const awayDirection = scale(farmerDirection, -1);
      const tangentDirection = vec3(-farmerDirection.z, 0, farmerDirection.x);
      const farmerVelocity = vec3(
        Math.cos(farmer.headingRad) * farmer.speedMps,
        0,
        Math.sin(farmer.headingRad) * farmer.speedMps
      );
      const relativeVelocity = subtract(adjustedVelocity, farmerVelocity);
      const relativeSpeedSq = Math.max(dot(relativeVelocity, relativeVelocity), 1e-6);
      const timeToClosestApproachS = clamp(
        dot(relPosition, relativeVelocity) / relativeSpeedSq,
        0,
        FARMER_AVOIDANCE_LOOKAHEAD_S
      );
      const closestApproachVector = subtract(
        relPosition,
        scale(relativeVelocity, timeToClosestApproachS)
      );
      const closestApproachDistanceM = horizontalLength(closestApproachVector);
      const clearanceRadiusM =
        FARMER_AVOIDANCE_RADIUS_M +
        farmer.shoulderWidthM * 0.5 +
        FARMER_AVOIDANCE_MARGIN_M;
      const collisionRisk =
        distanceToFarmerM <= clearanceRadiusM + 0.25 ||
        closestApproachDistanceM <= clearanceRadiusM;

      if (!collisionRisk) {
        continue;
      }

      const alongFarmerMps = dot(adjustedVelocity, farmerDirection);
      const tangentialMps = dot(adjustedVelocity, tangentDirection);
      const farmerAlongMps = dot(farmerVelocity, farmerDirection);
      const distanceMarginM = Math.max(distanceToFarmerM - clearanceRadiusM, 0);
      const maxClosingSpeedMps = Math.sqrt(2 * maxHorizontalAccelMps2 * distanceMarginM);
      const limitedAlongFarmerMps = Math.min(
        alongFarmerMps,
        farmerAlongMps + maxClosingSpeedMps
      );
      const evasionStrength =
        clamp(
          (clearanceRadiusM + 0.9 - Math.min(distanceToFarmerM, closestApproachDistanceM)) /
            0.9,
          0,
          1
        ) * FARMER_LATERAL_EVASION_MPS;
      const tangentSign =
        dot(tangentDirection, adjustedVelocity) >= 0 ? 1 : -1;

      adjustedVelocity = add(
        add(
          scale(farmerDirection, limitedAlongFarmerMps),
          scale(tangentDirection, tangentialMps + tangentSign * evasionStrength)
        ),
        scale(awayDirection, evasionStrength * 0.65)
      );
    }

    return adjustedVelocity;
  }

  private stepMotion(simDt: number): void {
    if (!isFlightMode(this.drone.mode)) {
      this.drone.velocity = vec3();
      this.drone.yawRateRadS = 0;
      return;
    }

    const target = this.currentMotionTarget();
    const toTarget = subtract(target, this.drone.position);
    const horizontalTarget = vec3(toTarget.x, 0, toTarget.z);
    const horizontalDistanceM = horizontalLength(horizontalTarget);
    const verticalError = toTarget.y;

    const slowRadius = 5;
    let desiredHorizontalSpeed: number;
    if (this.drone.mode === "approach") {
      desiredHorizontalSpeed = this.computeApproachSpeedMps(
        horizontalDistanceM,
        horizontalNormalize(horizontalTarget)
      );
    } else if (
      this.drone.mode === "aiming" ||
      this.drone.mode === "firing" ||
      this.drone.mode === "confirming"
    ) {
      desiredHorizontalSpeed = Math.min(
        this.params.maxFiringSpeedMps,
        horizontalDistanceM * 1.4
      );
    } else {
      const cruiseFactor = clamp(horizontalDistanceM / slowRadius, 0.35, 1);
      desiredHorizontalSpeed = this.params.cruiseSpeedMps * cruiseFactor;
    }
    let desiredHorizontalVelocity = scale(
      horizontalNormalize(horizontalTarget),
      desiredHorizontalSpeed
    );
    desiredHorizontalVelocity = this.computeFarmerAvoidanceVelocity(
      desiredHorizontalVelocity
    );
    const desiredVerticalVelocity = clamp(
      verticalError / Math.max(simDt * 2.4, 0.2),
      -this.params.maxVerticalSpeedMps,
      this.params.maxVerticalSpeedMps
    );

    const targetVelocity = vec3(
      desiredHorizontalVelocity.x,
      desiredVerticalVelocity,
      desiredHorizontalVelocity.z
    );
    const currentHorizontalVelocity = vec3(this.drone.velocity.x, 0, this.drone.velocity.z);
    const horizontalDeltaVelocity = subtract(
      vec3(targetVelocity.x, 0, targetVelocity.z),
      currentHorizontalVelocity
    );
    const maxHorizontalDeltaVelocity = this.params.maxHorizontalAccelMps2 * simDt;
    const appliedHorizontalDeltaVelocity = clampLength(
      horizontalDeltaVelocity,
      maxHorizontalDeltaVelocity
    );
    const maxVerticalDeltaVelocity =
      this.params.maxHorizontalAccelMps2 * MAX_VERTICAL_ACCEL_FACTOR * simDt;
    const appliedVerticalDeltaVelocity = clamp(
      targetVelocity.y - this.drone.velocity.y,
      -maxVerticalDeltaVelocity,
      maxVerticalDeltaVelocity
    );

    this.drone.velocity = vec3(
      this.drone.velocity.x + appliedHorizontalDeltaVelocity.x,
      this.drone.velocity.y + appliedVerticalDeltaVelocity,
      this.drone.velocity.z + appliedHorizontalDeltaVelocity.z
    );
    this.drone.position = add(this.drone.position, scale(this.drone.velocity, simDt));

    const headingVelocity =
      horizontalLength(desiredHorizontalVelocity) > 0.1 ? desiredHorizontalVelocity : this.drone.velocity;

    if (horizontalLength(headingVelocity) > 0.1) {
      this.updateYaw(simDt, angleFromVector(headingVelocity));
    } else {
      this.updateYaw(simDt, null);
    }
  }

  private updateAttitude(simDt: number): void {
    const heading = this.drone.headingRad;
    const forward = vec3(Math.cos(heading), 0, Math.sin(heading));
    const lateral = vec3(-forward.z, 0, forward.x);
    const forwardAccel = dot(this.drone.acceleration, forward);
    const lateralAccel = dot(this.drone.acceleration, lateral);
    const desiredPitch = clamp(-forwardAccel * 0.07, -0.32, 0.32);
    const desiredRoll = clamp(-lateralAccel * 0.085, -0.36, 0.36);
    const damping = 1 - Math.exp(-simDt * (1 / ATTITUDE_RESPONSE));

    this.drone.pitchRad = lerp(this.drone.pitchRad, desiredPitch, damping);
    this.drone.rollRad = lerp(this.drone.rollRad, desiredRoll, damping);
  }

  private processModeTransitions(): void {
    const target = this.currentMotionTarget();
    const horizontalError = horizontalDistance(this.drone.position, target);
    const verticalError = Math.abs(this.drone.position.y - target.y);
    const horizontalSpeed = horizontalLength(this.drone.velocity);

    switch (this.drone.mode) {
      case "takeoff": {
        if (verticalError < 0.18) {
          this.transitionTo("searching", "search altitude reached");
        }
        break;
      }
      case "searching": {
        if (this.sweepPath.length === 0) {
          this.dockDirective = "finish";
          this.transitionTo("returning", "no sweep path available");
          break;
        }

        if (horizontalError < 0.9 && verticalError < 0.25) {
          if (this.sweepIndex < this.sweepPath.length - 1) {
            this.sweepIndex += 1;
            this.drone.activeWaypointIndex = this.sweepIndex;
          } else if (this.targets.some((entry) => entry.alive)) {
            const hasEligibleQueuedTarget = this.hasEligibleQueuedTarget();
            if (this.targetQueue.length === 0 || !hasEligibleQueuedTarget) {
              const restoredTargets = this.restoreKnownTargetsToQueue("completed final sweep lane");
              const nextTargetId = this.pickNextQueuedTarget();
              if (nextTargetId !== null) {
                this.setActiveTarget(nextTargetId, "recovered target queue after sweep");
                this.transitionTo("approach", "queued target recovered after sweep", {
                  targetId: nextTargetId,
                  queueLength: this.targetQueue.length
                });
              } else if (
                restoredTargets > 0 ||
                this.targetQueue.length === 0 ||
                !hasEligibleQueuedTarget
              ) {
                this.restartSearchSweep(
                  this.targetQueue.length === 0
                    ? "completed final sweep lane with no queued targets"
                    : "completed final sweep lane while queued targets were temporarily blocked"
                );
              }
            }
          } else {
            this.dockDirective = "finish";
            this.transitionTo("returning", "all targets neutralized");
          }
        }
        break;
      }
      case "approach": {
        const activeTarget =
          this.drone.activeTargetId !== null ? this.targets[this.drone.activeTargetId] : null;
        if (!activeTarget) {
          this.pruneTargetQueue("approach without active target");
          const replacementTargetId = this.pickNextQueuedTarget();
          if (replacementTargetId !== null) {
            this.setActiveTarget(replacementTargetId, "recovered missing active target");
          } else {
            this.transitionTo("searching", "approach aborted without active target");
            break;
          }
        }

        if (activeTarget) {
          activeTarget.engagementProgress = 0.35;
        }

        if (horizontalError < APPROACH_HANDOFF_RADIUS_M && verticalError < 0.18) {
          this.transitionTo("aiming", "target engagement point reached", {
            targetId: this.drone.activeTargetId,
            horizontalError
          });
        }
        break;
      }
      case "aiming": {
        const activeTarget =
          this.drone.activeTargetId !== null ? this.targets[this.drone.activeTargetId] : null;
        const targetDistanceM = activeTarget ? distance(this.drone.position, activeTarget.position) : Number.POSITIVE_INFINITY;
        if (activeTarget) {
          activeTarget.engagementProgress = clamp(
            this.modeTimerS / Math.max(this.params.aimDurationS, 0.01),
            0.35,
            0.82
          );
        }

        if (
          this.modeTimerS >= this.params.aimDurationS &&
          targetDistanceM <= NOMINAL_FIRING_STANDOFF_DISTANCE_M + 1e-3 &&
          horizontalSpeed <= this.params.maxFiringSpeedMps + 1e-3
        ) {
          this.transitionTo("firing", "aim solution stable", {
            targetId: this.drone.activeTargetId,
            horizontalSpeed,
            targetDistanceM
          });
        }
        break;
      }
      case "firing": {
        const activeTarget =
          this.drone.activeTargetId !== null ? this.targets[this.drone.activeTargetId] : null;
        if (activeTarget) {
          activeTarget.engagementProgress = 1;
        }

        if (this.modeTimerS >= this.params.engagementDwellS) {
          this.neutralizeActiveTarget();
          this.transitionTo("confirming", "laser dwell complete");
        }
        break;
      }
      case "confirming": {
        if (this.modeTimerS >= this.params.confirmDurationS) {
          if (this.targets.some((entry) => entry.alive)) {
            if (
              this.drone.batteryWh >
              this.estimateReturnEnergyWh() +
                (this.params.reserveBatteryPct / 100) * this.params.batteryCapacityWh
            ) {
              this.pruneTargetQueue("confirming");
              if (this.drone.activeTargetId === null) {
                this.setActiveTarget(
                  this.pickNextQueuedTarget(),
                  "post-confirm selection"
                );
              }
              if (this.drone.activeTargetId !== null) {
                this.transitionTo("approach", "resume engagement from queue");
              } else {
                this.transitionTo("searching", "resume field sweep");
              }
            } else {
              this.dockDirective = "recharge";
              this.setActiveTarget(null, "post-confirm reserve return");
              this.transitionTo("returning", "battery below reserve after engagement");
            }
          } else {
            this.dockDirective = "finish";
            this.setActiveTarget(null, "all targets cleared");
            this.transitionTo("returning", "field cleared");
          }
        }
        break;
      }
      case "returning": {
        if (horizontalError < 0.9 && verticalError < 0.25) {
          this.transitionTo("landing", "dock reached");
        }
        break;
      }
      case "landing": {
        if (horizontalError < 0.2 && verticalError < 0.12) {
          this.drone.position = cloneVec3(this.dockPosition);
          this.drone.velocity = vec3();
          this.drone.acceleration = vec3();
          if (this.targets.some((entry) => entry.alive)) {
            if (this.dockDirective === "recharge") {
              this.rechargeCycles += 1;
              this.beginCharging("recharge required before mission resume", "Charging cycle started", {
                rechargeCycles: this.rechargeCycles
              });
            } else {
              this.prepareResumeFromDock("dock landing resume");
              this.dockDirective = "resume";
              this.transitionTo("takeoff", "resume mission from dock without recharge");
            }
          } else {
            this.dockDirective = "finish";
            this.finishMission();
          }
        }
        break;
      }
      default: {
        break;
      }
    }
  }

  private neutralizeActiveTarget(): void {
    if (this.drone.activeTargetId === null) {
      return;
    }

    const target = this.targets[this.drone.activeTargetId];
    if (!target || !target.alive) {
      return;
    }

    target.alive = false;
    target.queued = false;
    target.neutralizationPulse = 1;
    target.engagementProgress = 0;
    target.neutralizedAtS = this.missionElapsedS;
    this.neutralizedCount += 1;
    this.targetQueue = this.targetQueue.filter((targetId) => targetId !== this.drone.activeTargetId);
    this.logEvent("target-neutralized", `Neutralized beetle ${target.id}`, {
      targetId: target.id,
      remainingTargets: this.targets.filter((entry) => entry.alive).length
    });
    this.pruneTargetQueue("neutralizeActiveTarget");
    this.setActiveTarget(this.pickNextQueuedTarget(), "post-neutralization selection");
  }

  private samplePower(): PowerSample {
    const hoverPowerW = calculateHoverPowerW(this.params);
    const horizontalSpeed = horizontalLength(this.drone.velocity);
    const verticalSpeed = this.drone.velocity.y;
    const translationalRelief = 1 - 0.08 * clamp(horizontalSpeed / 7, 0, 1);
    const supportPowerW = hoverPowerW * translationalRelief;
    const dragPowerW = calculateCruiseDragPowerW(this.params, horizontalSpeed);
    const kineticPower =
      (this.params.droneMassKg *
        Math.max(
          dot(this.drone.acceleration, vec3(this.drone.velocity.x, 0, this.drone.velocity.z)),
          0
        )) /
      Math.max(this.params.propulsionEfficiency, 0.2);
    const brakingPower =
      (this.params.droneMassKg *
        Math.max(
          -dot(this.drone.acceleration, vec3(this.drone.velocity.x, 0, this.drone.velocity.z)),
          0
        ) *
        BRAKING_FACTOR) /
      Math.max(this.params.propulsionEfficiency, 0.2);
    const verticalPowerW =
      verticalSpeed >= 0
        ? (this.params.droneMassKg * GRAVITY * verticalSpeed) /
          Math.max(this.params.propulsionEfficiency, 0.2)
        : (this.params.droneMassKg * GRAVITY * Math.abs(verticalSpeed) * DESCENT_FACTOR) /
          Math.max(this.params.propulsionEfficiency, 0.2);
    const maneuverPowerW = kineticPower + brakingPower + Math.abs(verticalPowerW);
    const laserW = this.drone.mode === "firing" ? this.params.laserPowerW : 0;
    const avionicsW = isFlightMode(this.drone.mode) ? this.params.avionicsPowerW : 0;
    const flightW =
      this.drone.mode === "searching" ||
      this.drone.mode === "approach" ||
      this.drone.mode === "returning" ||
      this.drone.mode === "takeoff" ||
      this.drone.mode === "landing"
        ? supportPowerW + dragPowerW
        : 0;
    const hoverW =
      this.drone.mode === "aiming" ||
      this.drone.mode === "firing" ||
      this.drone.mode === "confirming"
        ? supportPowerW
        : 0;
    const instantaneousPowerW =
      flightW + hoverW + maneuverPowerW + laserW + avionicsW;

    return {
      instantaneousPowerW,
      flightW,
      hoverW,
      accelerationW: maneuverPowerW,
      laserW,
      avionicsW
    };
  }

  private applyPower(power: PowerSample, simDt: number): void {
    this.drone.instantaneousPowerW = power.instantaneousPowerW;

    const dtHours = simDt / 3600;
    this.energy.flightWh += power.flightW * dtHours;
    this.energy.hoverWh += power.hoverW * dtHours;
    this.energy.accelerationWh += power.accelerationW * dtHours;
    this.energy.laserWh += power.laserW * dtHours;
    this.energy.avionicsWh += power.avionicsW * dtHours;

    const totalStepWh =
      power.flightW * dtHours +
      power.hoverW * dtHours +
      power.accelerationW * dtHours +
      power.laserW * dtHours +
      power.avionicsW * dtHours;
    this.drone.batteryWh = clampBatteryWh(this.params, this.drone.batteryWh - totalStepWh);
  }

  private pushHistory(): void {
    const point = cloneVec3(this.drone.position);
    const last = this.pathHistory[this.pathHistory.length - 1];
    if (!last || distance(last, point) > 0.9) {
      this.pathHistory.push(point);
      if (this.pathHistory.length > 320) {
        this.pathHistory.shift();
      }
    }
  }

  private beginCharging(
    reason: string,
    message: string,
    data?: MissionLogEvent["data"]
  ): void {
    const capacityWh = Math.max(this.params.batteryCapacityWh, 1e-6);
    const fullChargeDurationS = Math.max(this.params.rechargeTimeMin * 60, 0);
    const currentBatteryWh = clampBatteryWh(this.params, this.drone.batteryWh);
    const missingFraction = clamp(1 - currentBatteryWh / capacityWh, 0, 1);

    this.chargeStartBatteryWh = currentBatteryWh;
    this.chargeDurationS = fullChargeDurationS * missingFraction;
    this.chargeTimerS = 0;
    this.drone.position = cloneVec3(this.dockPosition);
    this.drone.velocity = vec3();
    this.drone.acceleration = vec3();
    this.drone.instantaneousPowerW = 0;
    this.transitionTo("charging", reason, {
      chargeDurationS: this.chargeDurationS,
      chargeStartBatteryWh: currentBatteryWh
    });
    this.logEvent("charging-start", message, {
      batteryWh: currentBatteryWh,
      chargeDurationS: this.chargeDurationS,
      rechargeTimeMin: this.params.rechargeTimeMin,
      ...data
    });

    if (this.chargeDurationS <= 1e-6) {
      this.completeCharging();
    }
  }

  private completeCharging(skipped = false): void {
    this.chargeTimerS = 0;
    this.chargeDurationS = 0;
    this.chargeStartBatteryWh = this.params.batteryCapacityWh;
    this.drone.batteryWh = this.params.batteryCapacityWh;
    this.drone.instantaneousPowerW = 0;
    this.logEvent("charging-complete", skipped ? "Battery recharge skipped to full" : "Battery recharge complete", {
      batteryWh: this.params.batteryCapacityWh,
      skipped
    });
    if (this.targets.some((target) => target.alive)) {
      this.prepareResumeFromDock("battery restored");
      this.dockDirective = "resume";
      this.transitionTo("takeoff", "battery restored");
    } else {
      this.dockDirective = "finish";
      this.finishMission();
    }
  }

  private updateStuckMonitor(simDt: number): void {
    if (
      this.drone.mode !== "takeoff" &&
      this.drone.mode !== "searching" &&
      this.drone.mode !== "approach" &&
      this.drone.mode !== "returning" &&
      this.drone.mode !== "landing"
    ) {
      this.progressProbe = {
        ...this.progressProbe,
        mode: this.drone.mode,
        targetId: this.drone.activeTargetId,
        lastDistanceM: 0,
        lastPosition: cloneVec3(this.drone.position),
        staleForS: 0
      };
      return;
    }

    const objective = this.currentMotionTarget();
    const objectiveDistanceM = distance(this.drone.position, objective);
    const movedM = distance(this.progressProbe.lastPosition, this.drone.position);
    const improvedM = this.progressProbe.lastDistanceM - objectiveDistanceM;
    const trackingSameObjective =
      this.progressProbe.mode === this.drone.mode &&
      this.progressProbe.targetId === this.drone.activeTargetId;

    if (
      !trackingSameObjective ||
      improvedM > 0.06 ||
      movedM > 0.18 ||
      objectiveDistanceM < 0.4
    ) {
      this.progressProbe.staleForS = 0;
    } else {
      this.progressProbe.staleForS += simDt;
      if (
        this.progressProbe.staleForS >= STUCK_WARNING_AFTER_S &&
        this.missionElapsedS - this.progressProbe.lastWarningAtS >= 3
      ) {
        this.logEvent("stuck-warning", "Drone objective is not progressing", {
          mode: this.drone.mode,
          objectiveDistanceM,
          activeTargetId: this.drone.activeTargetId,
          queueLength: this.targetQueue.length
        });
        this.progressProbe.lastWarningAtS = this.missionElapsedS;
      }
    }

    this.progressProbe.mode = this.drone.mode;
    this.progressProbe.targetId = this.drone.activeTargetId;
    this.progressProbe.lastDistanceM = objectiveDistanceM;
    this.progressProbe.lastPosition = cloneVec3(this.drone.position);
  }

  private logEvent(
    event: MissionLogEvent["event"],
    message: string,
    data?: MissionLogEvent["data"]
  ): void {
    if (!this.enableDebugLogging) {
      return;
    }

    const entry: MissionLogEvent = {
      timeS: this.missionElapsedS,
      mode: this.drone.mode,
      event,
      message,
      data
    };
    this.debugLog.push(entry);
    if (this.debugLog.length > this.maxLogEntries) {
      this.debugLog.shift();
    }
    this.onLogEvent?.(entry);
  }

  private transitionTo(
    mode: DroneMode,
    reason: string,
    data?: MissionLogEvent["data"]
  ): void {
    const previousMode = this.drone.mode;
    this.drone.mode = mode;
    this.modeTimerS = 0;
    if (previousMode !== mode) {
      this.logEvent("mode-change", `${previousMode} -> ${mode}: ${reason}`, {
        from: previousMode,
        to: mode,
        queueLength: this.targetQueue.length,
        activeTargetId: this.drone.activeTargetId,
        ...data
      });
    }
  }

  private setActiveTarget(targetId: number | null, reason: string): void {
    if (this.drone.activeTargetId === targetId) {
      return;
    }

    this.drone.activeTargetId = targetId;
    this.logEvent(
      "target-selected",
      targetId === null
        ? `Cleared active target (${reason})`
        : `Selected beetle ${targetId} (${reason})`,
      {
        activeTargetId: targetId,
        queueLength: this.targetQueue.length
      }
    );
  }

  private pruneTargetQueue(reason: string): void {
    const seen = new Set<number>();
    const beforeLength = this.targetQueue.length;
    this.targetQueue = this.targetQueue.filter((targetId) => {
      const target = this.targets[targetId];
      if (!target || !target.alive || seen.has(targetId)) {
        return false;
      }
      seen.add(targetId);
      return true;
    });

    if (this.targetQueue.length !== beforeLength) {
      this.logEvent("queue-pruned", `Pruned target queue (${reason})`, {
        beforeLength,
        afterLength: this.targetQueue.length
      });
    }
  }

  private finishMission(): void {
    const totalEnergyWh =
      this.energy.flightWh +
      this.energy.hoverWh +
      this.energy.accelerationWh +
      this.energy.laserWh +
      this.energy.avionicsWh;
    this.drone.mode = "complete";
    this.drone.instantaneousPowerW = 0;
    this.summary = {
      totalMissionTimeS: this.missionElapsedS,
      totalEnergyWh,
      rechargeCycles: this.rechargeCycles,
      beetlesNeutralized: this.neutralizedCount,
      averageTimePerTargetS:
        this.neutralizedCount > 0 ? this.missionElapsedS / this.neutralizedCount : 0,
      energyPerBeetleWh: this.neutralizedCount > 0 ? totalEnergyWh / this.neutralizedCount : 0,
      batteryDepreciationCostUsd: calculateBatteryDepreciationCostUsd(totalEnergyWh, this.params),
      costPerHectareUsd: calculateCostPerHectareUsd(totalEnergyWh, this.params),
      equivalentFullCyclesUsed: calculateEquivalentFullCyclesUsed(totalEnergyWh, this.params),
      energyBreakdown: { ...this.energy },
      energyFractions: energyFractions(this.energy)
    };
    this.logEvent("mission-complete", "Mission completed successfully", {
      totalEnergyWh,
      rechargeCycles: this.rechargeCycles,
      beetlesNeutralized: this.neutralizedCount
    });
  }
}
