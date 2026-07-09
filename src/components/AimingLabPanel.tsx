import { useEffect, useRef, useState } from "react";
import {
  AIMING_SENSOR_HEIGHT_MM,
  AIMING_SENSOR_WIDTH_MM,
  AimingCommandGeneratorMode,
  AimingHistoryPoint,
  AimingLabEngine,
  AimingLabParameters,
  AimingLiveSnapshot,
  AimingPlaybackPhase,
  defaultAimingLabParameters,
} from "../sim/aiming";
import { autoTunePid, type PidTuneProgress } from "../sim/pidTuner";

interface AimingLabPanelProps {
  params: AimingLabParameters;
  onChange: (patch: Partial<AimingLabParameters>) => void;
  onReset: () => void;
  resetVersion: number;
}

type ShutterPlaybackStage = AimingPlaybackPhase;

const PLAYBACK_SPEED_OPTIONS = [1, 2, 5, 10, 20, 40];
const COMMAND_GENERATOR_OPTIONS: Array<{
  value: AimingCommandGeneratorMode;
  label: string;
  detail: string;
}> = [
  {
    value: "direct",
    label: "Direct",
    detail: "One mirror command is issued for each centroid, then held until the next frame."
  },
  {
    value: "pi",
    label: "PI hold",
    detail: "Uses the last centroid directly and holds it with PI / PID."
  },
  {
    value: "integral",
    label: "Integral predictor",
    detail: "Extends the last centroid with velocity and filtered IMU feed-forward."
  },
  {
    value: "frequency_phase",
    label: "Frequency + phase",
    detail: "Assumes a base oscillation and predicts the next phase of the motion."
  },
  {
    value: "dmd_sliding_window",
    label: "DMD sliding window",
    detail: "Fits a local linear model over recent centroids and emits fresh commands on a fixed millisecond cadence."
  }
];

function formatMrad(value: number): string {
  return `${value.toFixed(3)} mrad`;
}

function buildTimePath(
  samples: AimingHistoryPoint[],
  width: number,
  height: number,
  selector: (sample: AimingHistoryPoint) => number,
  maxAbsValue: number,
  currentTimeS: number,
  windowDurationS: number
): string {
  if (samples.length === 0) {
    return "";
  }
  const safeMax = Math.max(maxAbsValue, 1e-6);
  const windowStartS = currentTimeS - windowDurationS;
  return samples
    .map((sample, index) => {
      const x = ((sample.timeS - windowStartS) / Math.max(windowDurationS, 1e-6)) * width;
      const normalized = selector(sample) / safeMax;
      const y = height * 0.5 - normalized * height * 0.42;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function chartYForValue(value: number, maxAbsValue: number, height: number): number {
  const safeMax = Math.max(maxAbsValue, 1e-6);
  const normalized = value / safeMax;
  return height * 0.5 - normalized * height * 0.42;
}

function sensorXPercent(valueMrad: number, halfRangeMrad: number): number {
  return Math.min(96, Math.max(4, 50 + (valueMrad / Math.max(halfRangeMrad, 1e-6)) * 50));
}

function sensorYPercent(valueMrad: number, halfRangeMrad: number): number {
  return Math.min(96, Math.max(4, 50 - (valueMrad / Math.max(halfRangeMrad, 1e-6)) * 50));
}

function renderSensorAxisLabels(): JSX.Element {
  return (
    <>
      <span className="aiming-axis-label aiming-axis-label-top">{`${(AIMING_SENSOR_HEIGHT_MM * 0.5).toFixed(1)} mm`}</span>
      <span className="aiming-axis-label aiming-axis-label-bottom">{`${(-AIMING_SENSOR_HEIGHT_MM * 0.5).toFixed(1)} mm`}</span>
      <span className="aiming-axis-label aiming-axis-label-left">{`${(-AIMING_SENSOR_WIDTH_MM * 0.5).toFixed(1)} mm`}</span>
      <span className="aiming-axis-label aiming-axis-label-right">{`${(AIMING_SENSOR_WIDTH_MM * 0.5).toFixed(1)} mm`}</span>
    </>
  );
}

function buildFramePath(
  points: Array<{ xMrad: number; yMrad: number }>,
  halfRangeMrad: number,
  width: number,
  height: number
): string {
  if (points.length === 0) {
    return "";
  }
  return points
    .map((point, index) => {
      const x = (sensorXPercent(point.xMrad, halfRangeMrad) / 100) * width;
      const y = (sensorYPercent(point.yMrad, halfRangeMrad) / 100) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function roundToSignificantDigits(value: number, digits = 3): number {
  if (!Number.isFinite(value) || value === 0) {
    return value;
  }
  const scale = 10 ** (digits - Math.ceil(Math.log10(Math.abs(value))));
  return Math.round(value * scale) / scale;
}

interface AutoTuneState {
  running: boolean;
  progress: PidTuneProgress | null;
  summary: string | null;
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
  onReset,
  resetVersion
}: AimingLabPanelProps): JSX.Element {
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const engineRef = useRef<AimingLabEngine>(new AimingLabEngine(params));
  const [snapshot, setSnapshot] = useState<AimingLiveSnapshot>(engineRef.current.getSnapshot());
  const [autoTune, setAutoTune] = useState<AutoTuneState>({
    running: false,
    progress: null,
    summary: null
  });
  const autoTuneAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => autoTuneAbortRef.current?.abort(), []);

  const startAutoTune = async (): Promise<void> => {
    if (autoTune.running || params.commandGeneratorMode === "direct") {
      return;
    }
    const controller = new AbortController();
    autoTuneAbortRef.current = controller;
    setAutoTune({ running: true, progress: null, summary: null });
    try {
      const result = await autoTunePid(params, {
        signal: controller.signal,
        onProgress: (progress) => setAutoTune((state) => ({ ...state, progress }))
      });
      if (result.improved) {
        onChange({
          pidKp: roundToSignificantDigits(result.gains.pidKp),
          pidKi: roundToSignificantDigits(result.gains.pidKi),
          pidKd: roundToSignificantDigits(result.gains.pidKd)
        });
      }
      const summary = result.improved
        ? `Tuned: RMS ${result.baselineMetrics.rmsPointingErrorMrad.toFixed(3)} → ${result.metrics.rmsPointingErrorMrad.toFixed(3)} mrad` +
          (result.aborted ? " (cancelled early — best found applied)" : "")
        : result.aborted
          ? "Tuning cancelled — gains unchanged."
          : "No better gains found — current values kept.";
      setAutoTune({ running: false, progress: null, summary });
    } catch (error) {
      setAutoTune({
        running: false,
        progress: null,
        summary: error instanceof Error ? error.message : "Auto-tune failed."
      });
    }
  };

  useEffect(() => {
    engineRef.current.updateParams(params);
    setSnapshot(engineRef.current.getSnapshot());
  }, [params]);

  useEffect(() => {
    engineRef.current = new AimingLabEngine(params);
    setSnapshot(engineRef.current.getSnapshot());
  }, [resetVersion]);

  useEffect(() => {
    let frameHandle = 0;
    let previousTime = performance.now();

    const tick = (now: number): void => {
      const elapsedMs = now - previousTime;
      previousTime = now;
      const simAdvanceS = (elapsedMs / 1000) * 0.001 * playbackSpeed;
      engineRef.current.step(simAdvanceS);
      setSnapshot(engineRef.current.getSnapshot());
      frameHandle = window.requestAnimationFrame(tick);
    };

    frameHandle = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameHandle);
  }, [playbackSpeed]);

  const currentSample = snapshot.currentSample;
  const recentChartHistory = snapshot.recentHistory;
  const playbackStage = snapshot.phase;
  const visibleFrames = snapshot.captures;
  const chartWindowDurationS = 0.18;
  const viewHalfRangeMrad = Math.max(params.cameraFovMrad * 0.5, 0.1);
  const targetXPercent = sensorXPercent(currentSample.pointingErrorMrad, viewHalfRangeMrad);
  const targetYPercent = sensorYPercent(currentSample.pointingErrorYMrad, viewHalfRangeMrad);
  const targetChartMaxValue = Math.max(
    0.2,
    ...recentChartHistory.map((sample) =>
      Math.max(Math.abs(sample.targetX), Math.abs(sample.targetY))
    )
  );
  const commandChartMaxValue = Math.max(
    0.2,
    ...recentChartHistory.map((sample) =>
      Math.max(Math.abs(sample.commandPitch), Math.abs(sample.commandRoll))
    )
  );
  const mirrorChartMaxValue = Math.max(
    0.2,
    ...recentChartHistory.map((sample) =>
      Math.max(Math.abs(sample.mirrorPitch), Math.abs(sample.mirrorRoll))
    )
  );
  const temperatureChartMaxValue = Math.max(
    80,
    ...recentChartHistory.map((sample) => sample.targetTemperatureC)
  );
  const shotsChartMaxValue = Math.max(
    1,
    ...recentChartHistory.map((sample) => sample.shotsPerSecond)
  );
  const selectedCommandGenerator =
    COMMAND_GENERATOR_OPTIONS.find((option) => option.value === params.commandGeneratorMode) ??
    COMMAND_GENERATOR_OPTIONS[0];
  const laserSpotWidthPercent = (params.laserSpotDiameterMm / AIMING_SENSOR_WIDTH_MM) * 100;
  const laserSpotHeightPercent = (params.laserSpotDiameterMm / AIMING_SENSOR_HEIGHT_MM) * 100;
  const occupancyThresholdY = chartYForValue(params.laserEngageCoveragePct, 100, 220);
  const lethalThresholdY = chartYForValue(params.targetLethalTemperatureC, temperatureChartMaxValue, 220);

  const stageAnnotations = [
    `Gimbal removes about ${params.gimbalSuppressionPct.toFixed(0)}% of low-frequency platform motion.`,
    `Pads remove about ${params.dampingSuppressionPct.toFixed(0)}% of high-frequency vibration before the camera sees it.`,
    `Camera + processing + driver add about ${snapshot.metrics.measuredLatencyMs.toFixed(1)} ms total loop latency.`
  ];

  return (
    <div className="panel-shell aiming-lab">
      <div className="panel-header-row">
        <div>
          <span className="eyebrow">Aiming lab</span>
          <h2>MEMS mirror and camera loop</h2>
          <p>
            This section runs a stateful shutter-level loop: exposure while the target is projected on the sensor,
            smear and centroid extraction after shutter close, processing delay, driver delay, PID control, and MEMS
            mirror settling.
          </p>
        </div>
        <button className="secondary-button" onClick={onReset}>
          Reset defaults
        </button>
      </div>

      <div className="aiming-metrics">
        <div className="metric-card">
          <span>RMS pointing error</span>
          <strong>{formatMrad(snapshot.metrics.rmsPointingErrorMrad)}</strong>
        </div>
        <div className="metric-card">
          <span>Peak error</span>
          <strong>{formatMrad(snapshot.metrics.peakPointingErrorMrad)}</strong>
        </div>
        <div className="metric-card">
          <span>Within lock window</span>
          <strong>{snapshot.metrics.lockFractionPct.toFixed(1)}%</strong>
        </div>
        <div className="metric-card">
          <span>Step settling</span>
          <strong>
            {snapshot.metrics.settlingTimeMs === null
              ? "No settle"
              : `${snapshot.metrics.settlingTimeMs.toFixed(0)} ms`}
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
          <div className="aiming-top-charts">
            <div className="aiming-viewport-card">
              <div className="aiming-viewport-header">
                <span>Target XY motion over time</span>
                <strong>{snapshot.simTimeS.toFixed(2)} s</strong>
              </div>
              <svg viewBox="0 0 420 220" className="aiming-chart-svg" aria-label="Target XY motion over time">
                <line x1="20" y1="20" x2="20" y2="200" className="aiming-chart-axis" />
                <line x1="20" y1="110" x2="400" y2="110" className="aiming-chart-axis" />
                <path
                  d={buildTimePath(
                    recentChartHistory,
                    420,
                    220,
                    (sample) => sample.targetX,
                    targetChartMaxValue,
                    snapshot.simTimeS,
                    chartWindowDurationS
                  )}
                  className="aiming-chart-path-target"
                />
                <path
                  d={buildTimePath(
                    recentChartHistory,
                    420,
                    220,
                    (sample) => sample.targetY,
                    targetChartMaxValue,
                    snapshot.simTimeS,
                    chartWindowDurationS
                  )}
                  className="aiming-chart-path-platform"
                />
              </svg>
              <div className="aiming-chart-legend">
                <span className="legend-target">Target X</span>
                <span className="legend-platform">Target Y</span>
              </div>
            </div>

            <div className="aiming-chart-card aiming-chart-card-command">
              <div className="aiming-chart-title">MEMS mirror commanded values</div>
              <div className={`aiming-command-feed${snapshot.commandFeedActive ? " active" : ""}`} aria-hidden="true" />
              <svg viewBox="0 0 420 220" className="aiming-chart-svg" aria-label="MEMS mirror commanded values over time">
                <line x1="20" y1="20" x2="20" y2="200" className="aiming-chart-axis" />
                <line x1="20" y1="110" x2="400" y2="110" className="aiming-chart-axis" />
                <path
                  d={buildTimePath(
                    recentChartHistory,
                    420,
                    220,
                    (sample) => sample.commandPitch,
                    commandChartMaxValue,
                    snapshot.simTimeS,
                    chartWindowDurationS
                  )}
                  className="aiming-chart-path-command"
                />
                <path
                  d={buildTimePath(
                    recentChartHistory,
                    420,
                    220,
                    (sample) => sample.commandRoll,
                    commandChartMaxValue,
                    snapshot.simTimeS,
                    chartWindowDurationS
                  )}
                  className="aiming-chart-path-measurement"
                />
              </svg>
              <div className="aiming-chart-legend">
                <span className="legend-command">Pitch command</span>
                <span className="legend-measurement">Roll command</span>
              </div>
            </div>

            <div className="aiming-chart-card">
              <div className="aiming-chart-title">MEMS mirror pitch / roll over time</div>
              <svg viewBox="0 0 420 220" className="aiming-chart-svg" aria-label="MEMS mirror pitch and roll over time">
                <line x1="20" y1="20" x2="20" y2="200" className="aiming-chart-axis" />
                <line x1="20" y1="110" x2="400" y2="110" className="aiming-chart-axis" />
                <path
                  d={buildTimePath(
                    recentChartHistory,
                    420,
                    220,
                    (sample) => sample.mirrorPitch,
                    mirrorChartMaxValue,
                    snapshot.simTimeS,
                    chartWindowDurationS
                  )}
                  className="aiming-chart-path-mirror"
                />
                <path
                  d={buildTimePath(
                    recentChartHistory,
                    420,
                    220,
                    (sample) => sample.mirrorRoll,
                    mirrorChartMaxValue,
                    snapshot.simTimeS,
                    chartWindowDurationS
                  )}
                  className="aiming-chart-path-platform"
                />
              </svg>
              <div className="aiming-chart-legend">
                <span className="legend-mirror">Pitch</span>
                <span className="legend-platform">Roll</span>
              </div>
            </div>

            <div className="aiming-chart-card">
              <div className="aiming-chart-title">Target inside laser spot</div>
              <svg viewBox="0 0 420 220" className="aiming-chart-svg" aria-label="Target inside laser spot over time">
                <text x="8" y="24" className="aiming-chart-scale-text">100%</text>
                <text x="8" y="212" className="aiming-chart-scale-text">0%</text>
                <line x1="20" y1="20" x2="20" y2="200" className="aiming-chart-axis" />
                <line x1="20" y1="200" x2="400" y2="200" className="aiming-chart-axis" />
                <line x1="20" y1={occupancyThresholdY} x2="400" y2={occupancyThresholdY} className="aiming-chart-threshold" />
                <path
                  d={buildTimePath(
                    recentChartHistory,
                    420,
                    220,
                    (sample) => sample.spotCoveragePct,
                    100,
                    snapshot.simTimeS,
                    chartWindowDurationS
                  )}
                  className="aiming-chart-path-target"
                />
                <path
                  d={buildTimePath(
                    recentChartHistory,
                    420,
                    220,
                    (sample) => sample.laserOn,
                    100,
                    snapshot.simTimeS,
                    chartWindowDurationS
                  )}
                  className="aiming-chart-path-laser"
                />
              </svg>
              <div className="aiming-chart-legend">
                <span className="legend-target">Coverage</span>
                <span className="legend-threshold">Laser threshold</span>
                <span className="legend-laser">Laser on</span>
              </div>
            </div>

            <div className="aiming-chart-card">
              <div className="aiming-chart-title">
                <span>Target temperature (°C)</span>
                <strong>{currentSample.targetTemperatureC.toFixed(1)} °C</strong>
              </div>
              <svg viewBox="0 0 420 220" className="aiming-chart-svg" aria-label="Target temperature over time">
                <text x="8" y="24" className="aiming-chart-scale-text">{`${temperatureChartMaxValue.toFixed(0)} °C`}</text>
                <text x="8" y="212" className="aiming-chart-scale-text">22 °C</text>
                <line x1="20" y1="20" x2="20" y2="200" className="aiming-chart-axis" />
                <line x1="20" y1="200" x2="400" y2="200" className="aiming-chart-axis" />
                <line x1="20" y1={lethalThresholdY} x2="400" y2={lethalThresholdY} className="aiming-chart-threshold" />
                <path
                  d={buildTimePath(
                    recentChartHistory,
                    420,
                    220,
                    (sample) => sample.targetTemperatureC,
                    temperatureChartMaxValue,
                    snapshot.simTimeS,
                    chartWindowDurationS
                  )}
                  className="aiming-chart-path-temperature"
                />
              </svg>
              <div className="aiming-chart-legend">
                <span className="legend-temperature">Temperature</span>
                <span className="legend-threshold">Kill threshold</span>
              </div>
            </div>

            <div className="aiming-chart-card">
              <div className="aiming-chart-title">
                <span>Shots per second</span>
                <strong>{currentSample.shotsPerSecond.toFixed(2)} shots/s</strong>
              </div>
              <svg viewBox="0 0 420 220" className="aiming-chart-svg" aria-label="Shots per second over time">
                <text x="8" y="24" className="aiming-chart-scale-text">{`${shotsChartMaxValue.toFixed(1)} shots/s`}</text>
                <text x="8" y="212" className="aiming-chart-scale-text">0 shots/s</text>
                <line x1="20" y1="20" x2="20" y2="200" className="aiming-chart-axis" />
                <line x1="20" y1="200" x2="400" y2="200" className="aiming-chart-axis" />
                <path
                  d={buildTimePath(
                    recentChartHistory,
                    420,
                    220,
                    (sample) => sample.shotsPerSecond,
                    shotsChartMaxValue,
                    snapshot.simTimeS,
                    chartWindowDurationS
                  )}
                  className="aiming-chart-path-shot-rate"
                />
              </svg>
              <div className="aiming-chart-legend">
                <span className="legend-shot-rate">Recent shot rate</span>
              </div>
            </div>
          </div>

          <div className="aiming-viewport-card aiming-sensor-card">
            <div className="aiming-viewport">
              <div className="aiming-crosshair aiming-crosshair-horizontal" />
              <div className="aiming-crosshair aiming-crosshair-vertical" />
              {renderSensorAxisLabels()}
              <div className={`aiming-viewport-indicator${playbackStage === "open" ? " active" : ""}`}>
                <div className={`aiming-viewport-indicator-reel${playbackStage === "open" ? " active" : ""}`} />
              </div>
              <div className={`aiming-viewport-flash${snapshot.flashActive ? " active" : ""}`} />
              <div
                className={`aiming-laser-spot${currentSample.laserOn ? " active" : ""}`}
                style={{
                  width: `${laserSpotWidthPercent}%`,
                  height: `${laserSpotHeightPercent}%`
                }}
              />
              <div className={`aiming-laser-dot${snapshot.shotFlashActive ? " shot" : ""}`} />
              <div
                className="aiming-target-dot"
                style={{
                  left: `${targetXPercent}%`,
                  top: `${targetYPercent}%`
                }}
              />
            </div>
            <div className="aiming-frame-stack">
              {visibleFrames.map((frame, index) => {
                const centroidX = sensorXPercent(frame.cycle.measuredPointingErrorMrad, viewHalfRangeMrad);
                const centroidY = sensorYPercent(frame.cycle.measuredPointingErrorYMrad, viewHalfRangeMrad);
                return (
                  <div
                    key={frame.id}
                    className={`aiming-frame-row${index === 0 ? " active" : ""}${frame.isIncoming ? " incoming" : ""}`}
                  >
                    <div className="aiming-frame-strip">
                      <div className="aiming-crosshair aiming-crosshair-horizontal" />
                      <div className="aiming-crosshair aiming-crosshair-vertical" />
                      {renderSensorAxisLabels()}
                      <svg viewBox="0 0 100 100" className="aiming-frame-svg" aria-hidden="true">
                        <path
                          d={buildFramePath(frame.cycle.exposurePathPoints, viewHalfRangeMrad, 100, 100)}
                          className="aiming-frame-path"
                        />
                        {frame.showCentroid ? (
                          <circle
                            cx={centroidX}
                            cy={centroidY}
                            r="1.6"
                            className="aiming-frame-centroid-dot"
                          />
                        ) : null}
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="aiming-controls">
          <div className="aiming-control-group">
            <div className="aiming-control-group-label">Upstream stabilization</div>
            <AimingSlider
              label="Gimbal suppression"
              value={params.gimbalSuppressionPct}
              min={0}
              max={99}
              step={1}
              suffix="%"
              onChange={(value) => onChange({ gimbalSuppressionPct: value })}
            />
            <AimingSlider
              label="Pad damping"
              value={params.dampingSuppressionPct}
              min={0}
              max={99}
              step={1}
              suffix="%"
              onChange={(value) => onChange({ dampingSuppressionPct: value })}
            />
          </div>

          <div className="aiming-control-group">
            <div className="aiming-control-group-label">Camera and latency</div>
            <AimingSlider
              label="Camera frame rate"
              value={params.cameraFps}
              min={60}
              max={1000}
              step={10}
              suffix=" fps"
              onChange={(value) => onChange({ cameraFps: value })}
            />
            <AimingSlider
              label="Exposure time"
              value={params.exposureTimeMs}
              min={0.1}
              max={8}
              step={0.05}
              suffix=" ms"
              onChange={(value) => onChange({ exposureTimeMs: value })}
            />
            <AimingSlider
              label="Camera field of view"
              value={params.cameraFovMrad}
              min={0.8}
              max={8}
              step={0.1}
              suffix=" mrad"
              onChange={(value) => onChange({ cameraFovMrad: value })}
            />
            <AimingSlider
              label="Processing latency"
              value={params.processingLatencyMs}
              min={0.2}
              max={12}
              step={0.1}
              suffix=" ms"
              onChange={(value) => onChange({ processingLatencyMs: value })}
            />
            <AimingSlider
              label="Driver latency"
              value={params.driverLatencyMs}
              min={0.05}
              max={3}
              step={0.05}
              suffix=" ms"
              onChange={(value) => onChange({ driverLatencyMs: value })}
            />
            <AimingSlider
              label="Image noise"
              value={params.pixelNoisePx}
              min={0}
              max={2}
              step={0.05}
              suffix=" px"
              onChange={(value) => onChange({ pixelNoisePx: value })}
            />
          </div>

          <div className="aiming-control-group">
            <div className="aiming-control-group-label">Smart MEMS command generator</div>
            <label className="aiming-control">
              <span>Generator type</span>
              <strong>{selectedCommandGenerator.label}</strong>
              <select
                value={params.commandGeneratorMode}
                onChange={(event) =>
                  onChange({ commandGeneratorMode: event.target.value as AimingCommandGeneratorMode })
                }
              >
                {COMMAND_GENERATOR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small>{selectedCommandGenerator.detail}</small>
            </label>
            <AimingSlider
              label="PI / PID Kp"
              value={params.pidKp}
              min={0}
              max={8}
              step={0.05}
              onChange={(value) => onChange({ pidKp: value })}
            />
            <AimingSlider
              label="Integral drift hold"
              value={params.pidKi}
              min={0}
              max={220}
              step={1}
              onChange={(value) => onChange({ pidKi: value })}
            />
            <AimingSlider
              label="Derivative damping"
              value={params.pidKd}
              min={0}
              max={0.03}
              step={0.0005}
              onChange={(value) => onChange({ pidKd: value })}
            />
            <AimingSlider
              label="Integral clamp"
              value={params.integralLimitMrad}
              min={0.1}
              max={4}
              step={0.05}
              suffix=" mrad"
              onChange={(value) => onChange({ integralLimitMrad: value })}
            />
            <AimingSlider
              label="Derivative filter"
              value={params.derivativeFilterHz}
              min={5}
              max={400}
              step={5}
              suffix=" Hz"
              onChange={(value) => onChange({ derivativeFilterHz: value })}
            />
            <div className="aiming-autotune" style={{ display: "grid", gap: "0.35rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className="secondary-button"
                  onClick={() => void startAutoTune()}
                  disabled={autoTune.running || params.commandGeneratorMode === "direct"}
                >
                  {autoTune.running ? "Tuning…" : "Auto-tune PID"}
                </button>
                {autoTune.running ? (
                  <button
                    className="secondary-button"
                    onClick={() => autoTuneAbortRef.current?.abort()}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
              <small>
                {params.commandGeneratorMode === "direct"
                  ? "Not available for the direct command generator (it bypasses the PID)."
                  : autoTune.running
                    ? autoTune.progress
                      ? `Searching ${autoTune.progress.evaluationsDone}/${autoTune.progress.maxEvaluations} · best RMS ${autoTune.progress.bestMetrics.rmsPointingErrorMrad.toFixed(3)} mrad`
                      : "Starting search…"
                    : autoTune.summary ??
                      "Searches Kp / Ki / Kd for the lowest tracking error on the current scenario."}
              </small>
            </div>
            {params.commandGeneratorMode === "integral" ||
            params.commandGeneratorMode === "frequency_phase" ||
            params.commandGeneratorMode === "dmd_sliding_window" ? (
              <AimingSlider
                label="Predictor lead"
                value={params.predictorLeadMs}
                min={0}
                max={12}
                step={0.1}
                suffix=" ms"
                onChange={(value) => onChange({ predictorLeadMs: value })}
              />
            ) : null}
            {params.commandGeneratorMode === "integral" ? (
              <AimingSlider
                label="Centroid velocity gain"
                value={params.centroidVelocityGain}
                min={0}
                max={2}
                step={0.02}
                onChange={(value) => onChange({ centroidVelocityGain: value })}
              />
            ) : null}
            {params.commandGeneratorMode === "frequency_phase" ? (
              <AimingSlider
                label="Base oscillation"
                value={params.phasePredictorBaseFrequencyHz}
                min={0.5}
                max={30}
                step={0.1}
                suffix=" Hz"
                onChange={(value) => onChange({ phasePredictorBaseFrequencyHz: value })}
              />
            ) : null}
            {params.commandGeneratorMode === "dmd_sliding_window" ? (
              <>
                <AimingSlider
                  label="DMD window"
                  value={params.dmdWindowSize}
                  min={3}
                  max={20}
                  step={1}
                  suffix=" frames"
                  onChange={(value) => onChange({ dmdWindowSize: value })}
                />
                <AimingSlider
                  label="DMD command period"
                  value={params.dmdCommandPeriodMs}
                  min={0.25}
                  max={5}
                  step={0.05}
                  suffix=" ms"
                  onChange={(value) => onChange({ dmdCommandPeriodMs: value })}
                />
              </>
            ) : null}
            {params.commandGeneratorMode === "integral" ||
            params.commandGeneratorMode === "frequency_phase" ||
            params.commandGeneratorMode === "dmd_sliding_window" ? (
              <>
                <AimingSlider
                  label="IMU feed-forward"
                  value={params.imuFeedforwardGain}
                  min={0}
                  max={2}
                  step={0.02}
                  onChange={(value) => onChange({ imuFeedforwardGain: value })}
                />
                <AimingSlider
                  label="IMU low-pass cutoff"
                  value={params.imuLowPassHz}
                  min={1}
                  max={120}
                  step={1}
                  suffix=" Hz"
                  onChange={(value) => onChange({ imuLowPassHz: value })}
                />
                <AimingSlider
                  label="IMU rate lead"
                  value={params.imuRateLeadGain}
                  min={0}
                  max={2}
                  step={0.02}
                  onChange={(value) => onChange({ imuRateLeadGain: value })}
                />
              </>
            ) : null}
          </div>

          <div className="aiming-control-group">
            <div className="aiming-control-group-label">MEMS mirror plant</div>
            <AimingSlider
              label="Mirror natural frequency"
              value={params.memsNaturalFrequencyHz}
              min={120}
              max={2500}
              step={10}
              suffix=" Hz"
              onChange={(value) => onChange({ memsNaturalFrequencyHz: value })}
            />
            <AimingSlider
              label="Mirror damping ratio"
              value={params.memsDampingRatio}
              min={0.1}
              max={1.2}
              step={0.01}
              onChange={(value) => onChange({ memsDampingRatio: value })}
            />
            <AimingSlider
              label="Mirror max angle"
              value={params.memsMaxAngleMrad}
              min={0.4}
              max={6}
              step={0.05}
              suffix=" mrad"
              onChange={(value) => onChange({ memsMaxAngleMrad: value })}
            />
          </div>

          <div className="aiming-control-group">
            <div className="aiming-control-group-label">Laser and thermal model</div>
            <AimingSlider
              label="Laser power"
              value={params.laserPowerW}
              min={0.5}
              max={25}
              step={0.1}
              suffix=" W"
              onChange={(value) => onChange({ laserPowerW: value })}
            />
            <AimingSlider
              label="Laser spot diameter"
              value={params.laserSpotDiameterMm}
              min={0.05}
              max={1.5}
              step={0.01}
              suffix=" mm"
              onChange={(value) => onChange({ laserSpotDiameterMm: value })}
            />
            <AimingSlider
              label="Laser on threshold"
              value={params.laserEngageCoveragePct}
              min={5}
              max={95}
              step={1}
              suffix="%"
              onChange={(value) => onChange({ laserEngageCoveragePct: value })}
            />
            <AimingSlider
              label="Target mass"
              value={params.targetMassMg}
              min={1}
              max={80}
              step={0.5}
              suffix=" mg"
              onChange={(value) => onChange({ targetMassMg: value })}
            />
            <AimingSlider
              label="Target specific heat"
              value={params.targetSpecificHeatJPerKgC}
              min={800}
              max={5000}
              step={50}
              suffix=" J/kg/C"
              onChange={(value) => onChange({ targetSpecificHeatJPerKgC: value })}
            />
            <AimingSlider
              label="Heat loss rate"
              value={params.targetHeatLossWPerC}
              min={0.005}
              max={0.3}
              step={0.005}
              suffix=" W/C"
              onChange={(value) => onChange({ targetHeatLossWPerC: value })}
            />
            <AimingSlider
              label="Lethal temperature"
              value={params.targetLethalTemperatureC}
              min={28}
              max={120}
              step={1}
              suffix=" C"
              onChange={(value) => onChange({ targetLethalTemperatureC: value })}
            />
            <AimingSlider
              label="Laser absorption"
              value={params.targetAbsorptivityPct}
              min={1}
              max={100}
              step={1}
              suffix="%"
              onChange={(value) => onChange({ targetAbsorptivityPct: value })}
            />
          </div>

          <div className="aiming-control-group">
            <div className="aiming-control-group-label">Target and disturbance</div>
            <AimingSlider
              label="Low-frequency drift"
              value={params.lowFrequencyDisturbanceMrad}
              min={0}
              max={2}
              step={0.02}
              suffix=" mrad"
              onChange={(value) => onChange({ lowFrequencyDisturbanceMrad: value })}
            />
            <AimingSlider
              label="Low-frequency Hz"
              value={params.lowFrequencyHz}
              min={0.5}
              max={20}
              step={0.5}
              suffix=" Hz"
              onChange={(value) => onChange({ lowFrequencyHz: value })}
            />
            <AimingSlider
              label="High-frequency vibration"
              value={params.highFrequencyDisturbanceMrad}
              min={0}
              max={1}
              step={0.01}
              suffix=" mrad"
              onChange={(value) => onChange({ highFrequencyDisturbanceMrad: value })}
            />
            <AimingSlider
              label="High-frequency Hz"
              value={params.highFrequencyHz}
              min={20}
              max={300}
              step={5}
              suffix=" Hz"
              onChange={(value) => onChange({ highFrequencyHz: value })}
            />
            <AimingSlider
              label="Target step"
              value={params.targetStepMrad}
              min={0.1}
              max={2}
              step={0.02}
              suffix=" mrad"
              onChange={(value) => onChange({ targetStepMrad: value })}
            />
            <AimingSlider
              label="Target sway"
              value={params.targetSwayMrad}
              min={0}
              max={0.5}
              step={0.01}
              suffix=" mrad"
              onChange={(value) => onChange({ targetSwayMrad: value })}
            />
            <AimingSlider
              label="Target X nudge"
              value={params.targetBiasXMrad}
              min={-1}
              max={1}
              step={0.02}
              suffix=" mrad"
              onChange={(value) => onChange({ targetBiasXMrad: value })}
            />
            <AimingSlider
              label="Target Y nudge"
              value={params.targetBiasYMrad}
              min={-1}
              max={1}
              step={0.02}
              suffix=" mrad"
              onChange={(value) => onChange({ targetBiasYMrad: value })}
            />
            <AimingSlider
              label="Mirror pitch nudge"
              value={params.mirrorPitchBiasMrad}
              min={-1}
              max={1}
              step={0.02}
              suffix=" mrad"
              onChange={(value) => onChange({ mirrorPitchBiasMrad: value })}
            />
            <AimingSlider
              label="Mirror roll nudge"
              value={params.mirrorRollBiasMrad}
              min={-1}
              max={1}
              step={0.02}
              suffix=" mrad"
              onChange={(value) => onChange({ mirrorRollBiasMrad: value })}
            />
            <AimingSlider
              label="Lock threshold"
              value={params.lockThresholdMrad}
              min={0.02}
              max={0.3}
              step={0.005}
              suffix=" mrad"
              onChange={(value) => onChange({ lockThresholdMrad: value })}
            />
          </div>

          <div className="aiming-note-block">
            <strong>Interpretation</strong>
            <p>
              `Direct` fires one command per centroid. `PI hold` keeps correcting from the last centroid. `Integral`
              adds between-frame extrapolation from centroid drift and IMU. `Frequency + phase` assumes periodic
              motion. `DMD sliding window` fits a local linear model over recent centroids and refreshes commands on
              its own millisecond cadence.
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
