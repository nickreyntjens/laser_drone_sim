import { useEffect, useMemo, useState } from "react";
import { AimingLabScene } from "./AimingLabScene";
import {
  AimingLabParameters,
  AimingPlaybackCycle,
  AimingSample,
  defaultAimingLabParameters,
  downsampleAimingSamples,
  runAimingSimulation
} from "../sim/aiming";

interface AimingLabPanelProps {
  params: AimingLabParameters;
  onChange: (patch: Partial<AimingLabParameters>) => void;
  onReset: () => void;
}

type ShutterPlaybackStage = "open" | "close" | "centroid" | "command" | "delay";

const PLAYBACK_SPEED_OPTIONS = [1, 2, 5, 10, 20, 40];

function sampleAtTime(samples: AimingSample[], timeS: number): AimingSample {
  if (samples.length === 0) {
    throw new Error("Aiming lab requires samples to render playback.");
  }
  const index = Math.round(timeS / Math.max(samples[1]?.timeS ?? 0.001, 1e-6));
  return samples[Math.min(samples.length - 1, Math.max(0, index))];
}

function formatMrad(value: number): string {
  return `${value.toFixed(3)} mrad`;
}

function buildPath(
  samples: AimingSample[],
  width: number,
  height: number,
  selector: (sample: AimingSample) => number,
  maxAbsValue: number
): string {
  if (samples.length === 0) {
    return "";
  }

  const safeMax = Math.max(maxAbsValue, 1e-6);
  return samples
    .map((sample, index) => {
      const x = (index / Math.max(samples.length - 1, 1)) * width;
      const normalized = selector(sample) / safeMax;
      const y = height * 0.5 - normalized * height * 0.42;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function AimingSlider({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (next: number) => void;
}): JSX.Element {
  return (
    <label className="aiming-control">
      <span>{label}</span>
      <strong>
        {value.toFixed(step >= 1 ? 0 : step >= 0.1 ? 1 : 2)}
        {suffix}
      </strong>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function AimingLabPanel({
  params,
  onChange,
  onReset
}: AimingLabPanelProps): JSX.Element {
  const result = useMemo(() => runAimingSimulation(params), [params]);
  const chartSamples = useMemo(() => downsampleAimingSamples(result.samples, 480), [result.samples]);
  const playbackCycles = result.playbackCycles;
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [mirrorVisualExaggeration, setMirrorVisualExaggeration] = useState(220);
  const [playbackElapsedMs, setPlaybackElapsedMs] = useState(0);

  useEffect(() => {
    setPlaybackElapsedMs(0);
  }, [params]);

  useEffect(() => {
    if (playbackCycles.length === 0) {
      return undefined;
    }

    let frameHandle = 0;
    let previousTime = performance.now();

    const tick = (now: number): void => {
      const elapsedMs = now - previousTime;
      previousTime = now;
      setPlaybackElapsedMs((current) => current + elapsedMs);
      frameHandle = window.requestAnimationFrame(tick);
    };

    frameHandle = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameHandle);
  }, [playbackCycles.length]);

  const playbackStages = useMemo(() => {
    const cameraPeriodS = 1 / Math.max(params.cameraFps, 1);
    const nextExposureDelayS = Math.max(
      0,
      cameraPeriodS - (params.exposureTimeMs + params.processingLatencyMs + params.driverLatencyMs) / 1000
    );
    return [
      { key: "open" as const, durationMs: Math.max(450, (params.exposureTimeMs * 1000) / playbackSpeed) },
      { key: "close" as const, durationMs: 500 / playbackSpeed },
      { key: "centroid" as const, durationMs: Math.max(450, (params.processingLatencyMs * 1000) / playbackSpeed) },
      { key: "command" as const, durationMs: Math.max(350, (params.driverLatencyMs * 1000) / playbackSpeed) },
      { key: "delay" as const, durationMs: Math.max(350, (nextExposureDelayS * 1_000_000) / playbackSpeed) }
    ];
  }, [params.cameraFps, params.driverLatencyMs, params.exposureTimeMs, params.processingLatencyMs, playbackCycles, playbackSpeed]);
  const totalCycleDurationMs = playbackStages.reduce((sum, stage) => sum + stage.durationMs, 0);
  const cycleElapsedMs = playbackElapsedMs % Math.max(totalCycleDurationMs, 1);
  const playbackCycleIndex =
    playbackCycles.length > 0
      ? Math.floor(playbackElapsedMs / Math.max(totalCycleDurationMs, 1)) % playbackCycles.length
      : 0;
  let playbackStage: ShutterPlaybackStage = "open";
  let playbackStageProgress = 0;
  let stageStartOffsetMs = 0;
  for (const stage of playbackStages) {
    if (cycleElapsedMs <= stageStartOffsetMs + stage.durationMs) {
      playbackStage = stage.key;
      playbackStageProgress = (cycleElapsedMs - stageStartOffsetMs) / Math.max(stage.durationMs, 1);
      break;
    }
    stageStartOffsetMs += stage.durationMs;
  }

  const activeCycle = playbackCycles[Math.min(playbackCycleIndex, Math.max(playbackCycles.length - 1, 0))];
  const nextCycle = playbackCycles[(playbackCycleIndex + 1) % Math.max(playbackCycles.length, 1)];
  const nextExposureStartS =
    nextCycle && playbackCycles.length > 1
      ? nextCycle.exposureStartTimeS + (playbackCycleIndex === playbackCycles.length - 1 ? params.durationS : 0)
      : (activeCycle?.exposureStartTimeS ?? 0) + 1 / Math.max(params.cameraFps, 1);
  const stageSampleTimeS = (() => {
    if (!activeCycle) {
      return 0;
    }
    switch (playbackStage) {
      case "open":
        return activeCycle.exposureStartTimeS +
          (activeCycle.exposureEndTimeS - activeCycle.exposureStartTimeS) * playbackStageProgress;
      case "close":
        return activeCycle.exposureEndTimeS;
      case "centroid":
        return activeCycle.exposureEndTimeS +
          (activeCycle.measurementTimeS - activeCycle.exposureEndTimeS) * playbackStageProgress;
      case "command":
        return activeCycle.measurementTimeS +
          (activeCycle.commandTimeS - activeCycle.measurementTimeS) * playbackStageProgress;
      case "delay":
        return activeCycle.commandTimeS +
          (nextExposureStartS - activeCycle.commandTimeS) * playbackStageProgress;
      default:
        return activeCycle.exposureStartTimeS;
    }
  })();
  const currentSample = activeCycle ? sampleAtTime(result.samples, stageSampleTimeS) : result.samples[0];
  const viewHalfRangeMrad = Math.max(params.cameraFovMrad * 0.5, 0.1);
  const targetXPercent = 50 + (currentSample.pointingErrorMrad / viewHalfRangeMrad) * 50;
  const measuredXPercent = 50 + ((activeCycle?.measuredPointingErrorMrad ?? 0) / viewHalfRangeMrad) * 50;
  const smearWidthPercent =
    ((activeCycle?.smearWidthMrad ?? 0) / Math.max(viewHalfRangeMrad * 2, 1e-6)) * 100;
  const smearLeftPercent = 50 + ((((activeCycle?.actualPointingCentroidMrad ?? 0) - (activeCycle?.smearWidthMrad ?? 0) * 0.5) / viewHalfRangeMrad) * 50);
  const maxChartValue = Math.max(
    0.2,
    ...chartSamples.map((sample) =>
      Math.max(
        Math.abs(sample.pointingErrorMrad),
        Math.abs(sample.opticalTargetAngleMrad),
        Math.abs(sample.mirrorAngleMrad),
        Math.abs(sample.mirrorCommandMrad)
      )
    )
  );

  const stageAnnotations = [
    `Gimbal removes about ${params.gimbalSuppressionPct.toFixed(0)}% of low-frequency platform motion.`,
    `Pads remove about ${params.dampingSuppressionPct.toFixed(0)}% of high-frequency vibration before the camera sees it.`,
    `Camera + processing + driver add about ${result.metrics.measuredLatencyMs.toFixed(1)} ms total loop latency.`
  ];
  const stageDescriptions: Record<ShutterPlaybackStage, string> = {
    open: "1. Shutter opens. The live target keeps moving on the sensor and the open exposure accumulates that path into a smear.",
    close: "2. Shutter closes. That exposure is now frozen as a frame and inserted at the top of the captured-frame stack.",
    centroid: "3. The frozen smear is reduced to a centroid. That centroid becomes the last known location of the target.",
    command: "4. The controller computes a correction and sends a command toward the MEMS mirror.",
    delay: "5. Before the next shutter opens, the mirror keeps moving and settling while the live target keeps drifting."
  };
  const visibleFrames = useMemo(() => {
    if (!activeCycle) {
      return [];
    }
    const includeActive = playbackStage !== "open";
    const frames: Array<{
      index: number;
      cycle: AimingPlaybackCycle;
      isActive: boolean;
      status: string;
    }> = [];
    if (includeActive) {
      frames.push({
        index: 1,
        cycle: activeCycle,
        isActive: true,
        status:
          playbackStage === "close"
            ? "new frame created"
            : playbackStage === "centroid"
              ? "calculating centroid"
              : playbackStage === "command"
                ? "command sent"
                : "stored frame"
      });
    }
    for (let offset = 1; frames.length < 5 && offset < playbackCycles.length; offset += 1) {
      const cycleIndex = (playbackCycleIndex - offset + playbackCycles.length) % playbackCycles.length;
      frames.push({
        index: frames.length + 1,
        cycle: playbackCycles[cycleIndex],
        isActive: false,
        status: "stored frame"
      });
    }
    return frames;
  }, [activeCycle, playbackCycleIndex, playbackCycles, playbackStage]);

  return (
    <div className="panel-shell aiming-lab">
      <div className="panel-header-row">
        <div>
          <span className="eyebrow">Aiming lab</span>
          <h2>MEMS mirror and camera loop</h2>
          <p>
            This section isolates the fine aiming loop at shutter level: exposure while the target is
            projected on the sensor, smear and centroid extraction after shutter close, processing delay,
            driver delay, PID control, and MEMS mirror settling.
          </p>
        </div>
        <button className="secondary-button" onClick={onReset}>
          Reset defaults
        </button>
      </div>

      <div className="aiming-metrics">
        <div className="metric-card">
          <span>RMS pointing error</span>
          <strong>{formatMrad(result.metrics.rmsPointingErrorMrad)}</strong>
        </div>
        <div className="metric-card">
          <span>Peak error</span>
          <strong>{formatMrad(result.metrics.peakPointingErrorMrad)}</strong>
        </div>
        <div className="metric-card">
          <span>Within lock window</span>
          <strong>{result.metrics.lockFractionPct.toFixed(1)}%</strong>
        </div>
        <div className="metric-card">
          <span>Step settling</span>
          <strong>
            {result.metrics.settlingTimeMs === null ? "No settle" : `${result.metrics.settlingTimeMs.toFixed(0)} ms`}
          </strong>
        </div>
      </div>

      <div className="aiming-stage-strip">
        {stageAnnotations.map((annotation) => (
          <div key={annotation} className="aiming-stage-chip">
            {annotation}
          </div>
        ))}
      </div>

      <div className="aiming-playback-bar">
        <div className="aiming-playback-steps">
          {(["open", "close", "centroid", "command", "delay"] as ShutterPlaybackStage[]).map((stage, index) => (
            <div
              key={stage}
              className={`aiming-playback-step${playbackStage === stage ? " active" : ""}`}
            >
              {index + 1}. {stage === "open"
                ? "Open shutter"
                : stage === "close"
                  ? "Close shutter"
                  : stage === "centroid"
                    ? "Calc centroid"
                    : stage === "command"
                      ? "Send command"
                      : "Wait"}
            </div>
          ))}
        </div>
        <label className="aiming-playback-speed">
          <span>Speed</span>
          <select
            value={playbackSpeed}
            onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
          >
            {PLAYBACK_SPEED_OPTIONS.map((speed) => (
              <option key={speed} value={speed}>
                {speed}x
              </option>
            ))}
          </select>
          <small>1x = 1 ms shown as 1 s</small>
        </label>
      </div>

      <div className="aiming-layout">
        <div className="aiming-visuals">
          <div className="aiming-live-grid">
            <div className="aiming-viewport-card">
              <div className="aiming-viewport-header">
                <span>Living beam-steering diagram</span>
                <strong>{currentSample.timeS.toFixed(2)} s</strong>
              </div>
              <AimingLabScene
                sample={currentSample}
                showMeasuredPoint={playbackStage !== "open" && playbackStage !== "close"}
                mirrorVisualExaggeration={mirrorVisualExaggeration}
              />
              <div className="aiming-viewport-readout">
                <span>Mirror angle: {formatMrad(currentSample.mirrorAngleMrad)}</span>
                <span>Command: {formatMrad(currentSample.mirrorCommandMrad)}</span>
                <span>Centroid: {formatMrad(activeCycle?.measuredPointingErrorMrad ?? 0)}</span>
                <span>Smear width: {formatMrad(activeCycle?.smearWidthMrad ?? 0)}</span>
                <span>Visual exaggeration: {mirrorVisualExaggeration.toFixed(0)}x</span>
              </div>
              <p className="aiming-inline-note">
                {stageDescriptions[playbackStage]} Yellow is the chief ray through the lens center. Green is
                the focal ray that exits the lens parallel before the fold mirror. This side view shows the
                single mirror tilt axis that steers the beam up and down on the sensor.
              </p>
            </div>

            <div className="aiming-viewport-card">
              <div className="aiming-viewport-header">
                <span>Live sensor and captured frames</span>
                <strong>frame stack</strong>
              </div>
              <div className="aiming-viewport">
                <div className="aiming-crosshair aiming-crosshair-horizontal" />
                <div className="aiming-crosshair aiming-crosshair-vertical" />
                {currentSample.shutterOpen ? (
                  <div
                    className="aiming-smear-bar"
                    style={{
                      left: `${Math.min(96, Math.max(4, smearLeftPercent))}%`,
                      width: `${Math.min(92, Math.max(2, smearWidthPercent * playbackStageProgress))}%`
                    }}
                  />
                ) : null}
                <div
                  className="aiming-target-dot"
                  style={{ left: `${Math.min(96, Math.max(4, targetXPercent))}%` }}
                />
                <div
                  className="aiming-measurement-dot"
                  hidden={playbackStage === "open" || playbackStage === "close"}
                  style={{ left: `${Math.min(96, Math.max(4, measuredXPercent))}%` }}
                />
                <div className="aiming-viewport-label aiming-viewport-label-target">
                  frame 0 live sensor
                </div>
                <div className="aiming-viewport-label aiming-viewport-label-measured">
                  {currentSample.shutterOpen ? "shutter open: smear is accumulating" : "shutter closed: live target still moves"}
                </div>
              </div>
              <div className="aiming-viewport-legend">
                <span className="aiming-legend-item aiming-legend-item-target">True target on sensor</span>
                <span className="aiming-legend-item aiming-legend-item-smear">Exposure smear while shutter is open</span>
                <span className="aiming-legend-item aiming-legend-item-measured">Centroid sent into the controller</span>
              </div>
              <div className="aiming-viewport-readout">
                <span>Shutter: {currentSample.shutterOpen ? "open" : "closed"}</span>
                <span>Exposure centroid: {formatMrad(currentSample.exposureCentroidMrad)}</span>
                <span>Last known location: {formatMrad(currentSample.lastKnownTargetMrad)}</span>
              </div>
              <div className="aiming-frame-stack">
                {visibleFrames.map((frame) => {
                  const frameLeftPercent =
                    50 +
                    (((frame.cycle.actualPointingCentroidMrad - frame.cycle.smearWidthMrad * 0.5) /
                      viewHalfRangeMrad) *
                      50);
                  const frameWidthPercent =
                    (frame.cycle.smearWidthMrad / Math.max(viewHalfRangeMrad * 2, 1e-6)) * 100;
                  const frameCentroidPercent =
                    50 + (frame.cycle.measuredPointingErrorMrad / viewHalfRangeMrad) * 50;
                  return (
                    <div key={`${frame.index}-${frame.cycle.exposureStartTimeS}`} className={`aiming-frame-row${frame.isActive ? " active" : ""}`}>
                      <div className="aiming-frame-label">
                        <strong>frame {frame.index}</strong>
                        <span>{frame.status}</span>
                      </div>
                      <div className="aiming-frame-strip">
                        <div
                          className="aiming-frame-smear"
                          style={{
                            left: `${Math.min(96, Math.max(4, frameLeftPercent))}%`,
                            width: `${Math.min(92, Math.max(2, frameWidthPercent))}%`
                          }}
                        />
                        <div
                          className="aiming-frame-centroid"
                          style={{ left: `${Math.min(96, Math.max(4, frameCentroidPercent))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="aiming-chart-grid">
            <div className="aiming-chart-card">
              <div className="aiming-chart-title">Angles vs time</div>
              <svg viewBox="0 0 480 180" className="aiming-chart-svg" aria-label="Angles vs time">
                <path d={buildPath(chartSamples, 480, 180, (sample) => sample.opticalTargetAngleMrad, maxChartValue)} className="aiming-chart-path-target" />
                <path d={buildPath(chartSamples, 480, 180, (sample) => sample.mirrorAngleMrad, maxChartValue)} className="aiming-chart-path-mirror" />
                <path d={buildPath(chartSamples, 480, 180, (sample) => sample.pointingErrorMrad, maxChartValue)} className="aiming-chart-path-error" />
              </svg>
              <div className="aiming-chart-legend">
                <span className="legend-target">Optical target angle</span>
                <span className="legend-mirror">Mirror angle</span>
                <span className="legend-error">Residual error</span>
              </div>
            </div>

            <div className="aiming-chart-card">
              <div className="aiming-chart-title">Disturbance and control effort</div>
              <svg viewBox="0 0 480 180" className="aiming-chart-svg" aria-label="Disturbance and control effort">
                <path d={buildPath(chartSamples, 480, 180, (sample) => sample.residualPlatformMotionMrad, maxChartValue)} className="aiming-chart-path-platform" />
                <path d={buildPath(chartSamples, 480, 180, (sample) => sample.mirrorCommandMrad, maxChartValue)} className="aiming-chart-path-command" />
                <path d={buildPath(chartSamples, 480, 180, (sample) => sample.measuredErrorMrad, maxChartValue)} className="aiming-chart-path-measurement" />
              </svg>
              <div className="aiming-chart-legend">
                <span className="legend-platform">Residual platform motion</span>
                <span className="legend-command">Command after delay</span>
                <span className="legend-measurement">Measured error</span>
              </div>
            </div>
          </div>
        </div>

        <div className="aiming-controls">
          <div className="aiming-control-group">
            <div className="aiming-control-group-label">Upstream stabilization</div>
            <AimingSlider label="Gimbal suppression" value={params.gimbalSuppressionPct} min={0} max={99} step={1} suffix="%" onChange={(value) => onChange({ gimbalSuppressionPct: value })} />
            <AimingSlider label="Pad damping" value={params.dampingSuppressionPct} min={0} max={99} step={1} suffix="%" onChange={(value) => onChange({ dampingSuppressionPct: value })} />
          </div>

          <div className="aiming-control-group">
            <div className="aiming-control-group-label">Camera and latency</div>
            <AimingSlider label="Camera frame rate" value={params.cameraFps} min={60} max={1000} step={10} suffix=" fps" onChange={(value) => onChange({ cameraFps: value })} />
            <AimingSlider label="Exposure time" value={params.exposureTimeMs} min={0.1} max={8} step={0.05} suffix=" ms" onChange={(value) => onChange({ exposureTimeMs: value })} />
            <AimingSlider label="Camera field of view" value={params.cameraFovMrad} min={0.8} max={8} step={0.1} suffix=" mrad" onChange={(value) => onChange({ cameraFovMrad: value })} />
            <AimingSlider label="Processing latency" value={params.processingLatencyMs} min={0.2} max={12} step={0.1} suffix=" ms" onChange={(value) => onChange({ processingLatencyMs: value })} />
            <AimingSlider label="Driver latency" value={params.driverLatencyMs} min={0.05} max={3} step={0.05} suffix=" ms" onChange={(value) => onChange({ driverLatencyMs: value })} />
            <AimingSlider label="Image noise" value={params.pixelNoisePx} min={0} max={2} step={0.05} suffix=" px" onChange={(value) => onChange({ pixelNoisePx: value })} />
          </div>

          <div className="aiming-control-group">
            <div className="aiming-control-group-label">MEMS mirror and PID</div>
            <AimingSlider label="Mirror natural frequency" value={params.memsNaturalFrequencyHz} min={120} max={2500} step={10} suffix=" Hz" onChange={(value) => onChange({ memsNaturalFrequencyHz: value })} />
            <AimingSlider label="Mirror damping ratio" value={params.memsDampingRatio} min={0.1} max={1.2} step={0.01} onChange={(value) => onChange({ memsDampingRatio: value })} />
            <AimingSlider label="Mirror max angle" value={params.memsMaxAngleMrad} min={0.4} max={6} step={0.05} suffix=" mrad" onChange={(value) => onChange({ memsMaxAngleMrad: value })} />
            <AimingSlider label="Mirror visual exaggeration" value={mirrorVisualExaggeration} min={20} max={1000} step={10} suffix="x" onChange={setMirrorVisualExaggeration} />
            <AimingSlider label="PID Kp" value={params.pidKp} min={0} max={8} step={0.05} onChange={(value) => onChange({ pidKp: value })} />
            <AimingSlider label="PID Ki" value={params.pidKi} min={0} max={220} step={1} onChange={(value) => onChange({ pidKi: value })} />
            <AimingSlider label="PID Kd" value={params.pidKd} min={0} max={0.03} step={0.0005} onChange={(value) => onChange({ pidKd: value })} />
          </div>

          <div className="aiming-control-group">
            <div className="aiming-control-group-label">Target and disturbance</div>
            <AimingSlider label="Low-frequency drift" value={params.lowFrequencyDisturbanceMrad} min={0} max={2} step={0.02} suffix=" mrad" onChange={(value) => onChange({ lowFrequencyDisturbanceMrad: value })} />
            <AimingSlider label="Low-frequency Hz" value={params.lowFrequencyHz} min={0.5} max={20} step={0.5} suffix=" Hz" onChange={(value) => onChange({ lowFrequencyHz: value })} />
            <AimingSlider label="High-frequency vibration" value={params.highFrequencyDisturbanceMrad} min={0} max={1} step={0.01} suffix=" mrad" onChange={(value) => onChange({ highFrequencyDisturbanceMrad: value })} />
            <AimingSlider label="High-frequency Hz" value={params.highFrequencyHz} min={20} max={300} step={5} suffix=" Hz" onChange={(value) => onChange({ highFrequencyHz: value })} />
            <AimingSlider label="Target step" value={params.targetStepMrad} min={0.1} max={2} step={0.02} suffix=" mrad" onChange={(value) => onChange({ targetStepMrad: value })} />
            <AimingSlider label="Target sway" value={params.targetSwayMrad} min={0} max={0.5} step={0.01} suffix=" mrad" onChange={(value) => onChange({ targetSwayMrad: value })} />
            <AimingSlider label="Lock threshold" value={params.lockThresholdMrad} min={0.02} max={0.3} step={0.005} suffix=" mrad" onChange={(value) => onChange({ lockThresholdMrad: value })} />
          </div>

          <div className="aiming-note-block">
            <strong>Interpretation</strong>
            <p>
              Start with gimbal and damping at zero to isolate the camera + MEMS loop. Then turn them back on
              to see how much easier the fine steering problem becomes. Higher latency and lower mirror bandwidth
              reduce lock fraction first.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function createDefaultAimingLabParameters(): AimingLabParameters {
  return { ...defaultAimingLabParameters };
}
