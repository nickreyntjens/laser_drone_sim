// pidTuner.ts — automatic PID tuning for the Aiming Lab.
//
// The tuner treats the full aiming simulation (camera framerate + exposure smear,
// processing/driver latency, MEMS mirror inertia, disturbances, pixel noise) as a
// black-box plant and searches the (Kp, Ki, Kd) space for the gains that minimize a
// weighted tracking cost. Because the simulation is fully deterministic (noise is a
// hash of the cycle index), the search itself is deterministic and reproducible.
//
// Search strategy: multi-seed Nelder–Mead in log10 gain space.
//   - log space because useful gains span orders of magnitude (Kd ~1e-4, Ki ~1e2);
//   - seeds: the user's current gains, a latency-aware heuristic derived from the
//     loop's dead time (exposure/2 + processing + driver + half a camera period),
//     and a conservative fallback — Nelder–Mead then refines the best seed;
//   - the user's current gains are always evaluated first, and the tuner never
//     returns something worse than them.
import {
  runAimingSimulation,
  type AimingLabParameters,
  type AimingMetrics
} from "./aiming";
import { clamp } from "./defaults";

export interface PidGains {
  pidKp: number;
  pidKi: number;
  pidKd: number;
}

export interface PidCostWeights {
  /** Cost per mrad of RMS pointing error (the dominant term). */
  rmsErrorPerMrad: number;
  /** Cost per mrad of peak pointing error (penalizes overshoot/ringing). */
  peakErrorPerMrad: number;
  /** Cost per second of post-step settling time (null settling = full horizon). */
  settlingPerSecond: number;
  /** Cost for the fraction of time spent outside the lock threshold. */
  unlockedFraction: number;
}

export const defaultPidCostWeights: PidCostWeights = {
  rmsErrorPerMrad: 1,
  peakErrorPerMrad: 0.15,
  settlingPerSecond: 0.4,
  unlockedFraction: 0.25
};

export interface PidTuneProgress {
  evaluationsDone: number;
  maxEvaluations: number;
  bestCost: number;
  bestGains: PidGains;
  bestMetrics: AimingMetrics;
}

export interface PidTuneOptions {
  maxEvaluations?: number;
  weights?: Partial<PidCostWeights>;
  onProgress?: (progress: PidTuneProgress) => void;
  /** Abort mid-search: the tuner resolves with the best result found so far. */
  signal?: AbortSignal;
  /** Yield to the event loop every N evaluations (0 = never yield). */
  yieldEveryEvaluations?: number;
}

export interface PidTuneResult {
  gains: PidGains;
  cost: number;
  metrics: AimingMetrics;
  baselineGains: PidGains;
  baselineCost: number;
  baselineMetrics: AimingMetrics;
  evaluations: number;
  improved: boolean;
  aborted: boolean;
}

// Bounds match the panel's slider ranges (log space needs strictly positive floors).
const KP_BOUNDS: readonly [number, number] = [0.01, 8];
const KI_BOUNDS: readonly [number, number] = [0.01, 220];
const KD_BOUNDS: readonly [number, number] = [0.00001, 0.03];

const INITIAL_SIMPLEX_LOG_STEP = 0.35;
const CONVERGENCE_COST_SPREAD = 1e-6;
const CONVERGENCE_LOG_SPREAD = 1e-3;

export function computePidCost(
  metrics: AimingMetrics,
  params: AimingLabParameters,
  weights: PidCostWeights = defaultPidCostWeights
): number {
  const settlingHorizonS = Math.max(params.durationS - params.targetStepTimeS, 0.25);
  const settlingS =
    metrics.settlingTimeMs === null ? settlingHorizonS : metrics.settlingTimeMs / 1000;

  return (
    weights.rmsErrorPerMrad * metrics.rmsPointingErrorMrad +
    weights.peakErrorPerMrad * metrics.peakPointingErrorMrad +
    weights.settlingPerSecond * settlingS +
    weights.unlockedFraction * (1 - clamp(metrics.lockFractionPct / 100, 0, 1))
  );
}

export function evaluatePidGains(
  params: AimingLabParameters,
  gains: PidGains,
  weights: PidCostWeights = defaultPidCostWeights
): { cost: number; metrics: AimingMetrics } {
  const { metrics } = runAimingSimulation({ ...params, ...gains });
  return { cost: computePidCost(metrics, params, weights), metrics };
}

function clampGains(gains: PidGains): PidGains {
  return {
    pidKp: clamp(gains.pidKp, KP_BOUNDS[0], KP_BOUNDS[1]),
    pidKi: clamp(gains.pidKi, KI_BOUNDS[0], KI_BOUNDS[1]),
    pidKd: clamp(gains.pidKd, KD_BOUNDS[0], KD_BOUNDS[1])
  };
}

function encodeGains(gains: PidGains): number[] {
  const safe = clampGains(gains);
  return [Math.log10(safe.pidKp), Math.log10(safe.pidKi), Math.log10(safe.pidKd)];
}

function decodeGains(vector: number[]): PidGains {
  return clampGains({
    pidKp: 10 ** vector[0],
    pidKi: 10 ** vector[1],
    pidKd: 10 ** vector[2]
  });
}

/**
 * Latency-aware seed: the loop's effective dead time bounds how aggressive the
 * controller can be. Classic dead-time rules (SIMC-style) put the integral rate
 * inversely proportional to the delay and the derivative proportional to it.
 */
export function heuristicPidSeed(params: AimingLabParameters): PidGains {
  const cameraPeriodMs = 1000 / Math.max(params.cameraFps, 1);
  const loopDeadTimeS =
    (params.exposureTimeMs * 0.5 +
      params.processingLatencyMs +
      params.driverLatencyMs +
      cameraPeriodMs * 0.5) /
    1000;
  const safeDeadTimeS = Math.max(loopDeadTimeS, 0.0005);

  return clampGains({
    pidKp: 0.6,
    pidKi: 0.25 / safeDeadTimeS,
    pidKd: 0.08 * safeDeadTimeS
  });
}

export async function autoTunePid(
  params: AimingLabParameters,
  options: PidTuneOptions = {}
): Promise<PidTuneResult> {
  if (params.commandGeneratorMode === "direct") {
    throw new Error(
      "Auto-tune requires a command generator that uses the PID; the 'direct' mode bypasses it."
    );
  }

  const weights: PidCostWeights = { ...defaultPidCostWeights, ...(options.weights ?? {}) };
  const maxEvaluations = Math.max(options.maxEvaluations ?? 140, 1);
  const yieldEvery = options.yieldEveryEvaluations ?? 5;

  const baselineGains: PidGains = {
    pidKp: params.pidKp,
    pidKi: params.pidKi,
    pidKd: params.pidKd
  };
  const baseline = evaluatePidGains(params, baselineGains, weights);

  let evaluations = 1;
  let bestGains = baselineGains;
  let bestCost = baseline.cost;
  let bestMetrics = baseline.metrics;
  let aborted = options.signal?.aborted ?? false;

  const reportProgress = (): void => {
    options.onProgress?.({
      evaluationsDone: evaluations,
      maxEvaluations,
      bestCost,
      bestGains,
      bestMetrics
    });
  };
  reportProgress();

  const evaluateVector = async (vector: number[]): Promise<number> => {
    if (aborted || evaluations >= maxEvaluations) {
      return Number.POSITIVE_INFINITY;
    }
    const gains = decodeGains(vector);
    const { cost, metrics } = evaluatePidGains(params, gains, weights);
    evaluations += 1;
    if (cost < bestCost) {
      bestCost = cost;
      bestGains = gains;
      bestMetrics = metrics;
    }
    reportProgress();
    if (options.signal?.aborted) {
      aborted = true;
    } else if (yieldEvery > 0 && evaluations % yieldEvery === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (options.signal?.aborted) {
        aborted = true;
      }
    }
    return cost;
  };

  // ── Seed phase ─────────────────────────────────────────────────────────────
  const seedVectors: number[][] = [
    encodeGains(baselineGains),
    encodeGains(heuristicPidSeed(params)),
    encodeGains({ pidKp: 0.3, pidKi: 8, pidKd: 0.0001 })
  ];
  const seedCosts: number[] = [];
  for (const seed of seedVectors) {
    seedCosts.push(await evaluateVector(seed));
  }

  let bestSeedIndex = 0;
  for (let index = 1; index < seedVectors.length; index += 1) {
    if (seedCosts[index] < seedCosts[bestSeedIndex]) {
      bestSeedIndex = index;
    }
  }

  // ── Nelder–Mead refinement from the best seed ─────────────────────────────
  const dimension = 3;
  const simplex: Array<{ vector: number[]; cost: number }> = [
    { vector: [...seedVectors[bestSeedIndex]], cost: seedCosts[bestSeedIndex] }
  ];
  for (let axis = 0; axis < dimension; axis += 1) {
    const vector = [...seedVectors[bestSeedIndex]];
    vector[axis] += INITIAL_SIMPLEX_LOG_STEP;
    simplex.push({ vector, cost: await evaluateVector(vector) });
  }

  while (!aborted && evaluations < maxEvaluations) {
    simplex.sort((a, b) => a.cost - b.cost);

    const costSpread = simplex[simplex.length - 1].cost - simplex[0].cost;
    const logSpread = Math.max(
      ...simplex.slice(1).map((point) =>
        Math.max(...point.vector.map((value, axis) => Math.abs(value - simplex[0].vector[axis])))
      )
    );
    if (costSpread < CONVERGENCE_COST_SPREAD && logSpread < CONVERGENCE_LOG_SPREAD) {
      break;
    }

    const worst = simplex[simplex.length - 1];
    const secondWorstCost = simplex[simplex.length - 2].cost;
    const centroid = new Array(dimension).fill(0);
    for (let index = 0; index < simplex.length - 1; index += 1) {
      for (let axis = 0; axis < dimension; axis += 1) {
        centroid[axis] += simplex[index].vector[axis] / (simplex.length - 1);
      }
    }

    const reflected = centroid.map((value, axis) => value + (value - worst.vector[axis]));
    const reflectedCost = await evaluateVector(reflected);

    if (reflectedCost < simplex[0].cost) {
      const expanded = centroid.map((value, axis) => value + 2 * (value - worst.vector[axis]));
      const expandedCost = await evaluateVector(expanded);
      if (expandedCost < reflectedCost) {
        simplex[simplex.length - 1] = { vector: expanded, cost: expandedCost };
      } else {
        simplex[simplex.length - 1] = { vector: reflected, cost: reflectedCost };
      }
    } else if (reflectedCost < secondWorstCost) {
      simplex[simplex.length - 1] = { vector: reflected, cost: reflectedCost };
    } else {
      const contracted = centroid.map((value, axis) => value + 0.5 * (worst.vector[axis] - value));
      const contractedCost = await evaluateVector(contracted);
      if (contractedCost < worst.cost) {
        simplex[simplex.length - 1] = { vector: contracted, cost: contractedCost };
      } else {
        // Shrink toward the best point.
        for (let index = 1; index < simplex.length; index += 1) {
          const shrunk = simplex[index].vector.map(
            (value, axis) => simplex[0].vector[axis] + 0.5 * (value - simplex[0].vector[axis])
          );
          simplex[index] = { vector: shrunk, cost: await evaluateVector(shrunk) };
        }
      }
    }
  }

  const improved = bestCost < baseline.cost - 1e-12;
  return {
    gains: improved ? bestGains : baselineGains,
    cost: improved ? bestCost : baseline.cost,
    metrics: improved ? bestMetrics : baseline.metrics,
    baselineGains,
    baselineCost: baseline.cost,
    baselineMetrics: baseline.metrics,
    evaluations,
    improved,
    aborted
  };
}
