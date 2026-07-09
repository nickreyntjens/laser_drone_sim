import { describe, expect, it } from "vitest";
import { defaultAimingLabParameters, type AimingLabParameters } from "./aiming";
import { autoTunePid, computePidCost, evaluatePidGains, heuristicPidSeed } from "./pidTuner";

// A shortened, coarser scenario so each simulation evaluation stays fast; the
// tuner's behavior (search + guarantees) is independent of these numbers.
const fastParams: AimingLabParameters = {
  ...defaultAimingLabParameters,
  durationS: 1.6,
  timeStepS: 0.001,
  targetStepTimeS: 0.4
};

describe("autoTunePid", () => {
  it("rejects the direct command generator (it bypasses the PID)", async () => {
    await expect(
      autoTunePid({ ...fastParams, commandGeneratorMode: "direct" })
    ).rejects.toThrow(/direct/);
  });

  it("improves clearly detuned gains", async () => {
    const detuned: AimingLabParameters = {
      ...fastParams,
      pidKp: 0.05,
      pidKi: 1,
      pidKd: 0.0001
    };
    const result = await autoTunePid(detuned, {
      maxEvaluations: 60,
      yieldEveryEvaluations: 0
    });

    expect(result.improved).toBe(true);
    expect(result.cost).toBeLessThan(result.baselineCost);
    expect(result.metrics.rmsPointingErrorMrad).toBeLessThan(
      result.baselineMetrics.rmsPointingErrorMrad
    );
  });

  it("never returns gains worse than the starting point", async () => {
    const result = await autoTunePid(fastParams, {
      maxEvaluations: 30,
      yieldEveryEvaluations: 0
    });

    expect(result.cost).toBeLessThanOrEqual(result.baselineCost + 1e-12);
    const check = evaluatePidGains(fastParams, result.gains);
    expect(check.cost).toBeCloseTo(result.cost, 10);
  });

  it("respects the evaluation budget and reports progress", async () => {
    let progressCalls = 0;
    let lastDone = 0;
    const result = await autoTunePid(fastParams, {
      maxEvaluations: 12,
      yieldEveryEvaluations: 0,
      onProgress: (progress) => {
        progressCalls += 1;
        lastDone = progress.evaluationsDone;
        expect(progress.maxEvaluations).toBe(12);
      }
    });

    expect(result.evaluations).toBeLessThanOrEqual(12);
    expect(progressCalls).toBeGreaterThan(0);
    expect(lastDone).toBe(result.evaluations);
  });

  it("resolves with the baseline when aborted before the search starts", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await autoTunePid(fastParams, {
      maxEvaluations: 40,
      yieldEveryEvaluations: 0,
      signal: controller.signal
    });

    expect(result.aborted).toBe(true);
    expect(result.gains).toEqual(result.baselineGains);
    expect(result.evaluations).toBe(1);
  });

  it("is deterministic for identical inputs", async () => {
    const run = () =>
      autoTunePid(fastParams, { maxEvaluations: 25, yieldEveryEvaluations: 0 });
    const [first, second] = [await run(), await run()];

    expect(first.gains).toEqual(second.gains);
    expect(first.cost).toBe(second.cost);
    expect(first.evaluations).toBe(second.evaluations);
  });
});

describe("computePidCost", () => {
  it("penalizes a never-settling response with the full post-step horizon", () => {
    const metrics = {
      rmsPointingErrorMrad: 0.1,
      peakPointingErrorMrad: 0.5,
      lockFractionPct: 50,
      settlingTimeMs: null,
      measuredLatencyMs: 3
    };
    const settled = { ...metrics, settlingTimeMs: 100 };

    expect(computePidCost(metrics, fastParams)).toBeGreaterThan(
      computePidCost(settled, fastParams)
    );
  });
});

describe("heuristicPidSeed", () => {
  it("scales the integral gain down as loop latency grows", () => {
    const fast = heuristicPidSeed(fastParams);
    const slow = heuristicPidSeed({
      ...fastParams,
      processingLatencyMs: 12,
      driverLatencyMs: 3,
      cameraFps: 120
    });

    expect(slow.pidKi).toBeLessThan(fast.pidKi);
    expect(slow.pidKd).toBeGreaterThan(fast.pidKd);
  });
});
