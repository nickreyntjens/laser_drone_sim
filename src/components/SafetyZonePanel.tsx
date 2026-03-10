import { useEffect, useMemo, useState } from "react";
import { formatDecimal } from "../lib/format";
import {
  calculateBeamRadiusAtDistanceM,
  calculateCenterlineEnergyDensityJPerM2,
  calculateSafetyMetrics,
  NOMINAL_SAFETY_THRESHOLD_J_PER_M2
} from "../sim/safety";

export interface SafetyZoneEditorDraft {
  safetyFocalDistanceM: number;
  safetyStartingApertureMm: number;
  laserPowerW: number;
  requiredShotEnergyJ: number;
  previewFarmerDistanceM: number;
}

export interface SafetyZoneEditorView {
  metrics: ReturnType<typeof calculateSafetyMetrics>;
  previewDistanceMax: number;
  previewFarmerDistanceM: number;
  derivedDwellS: number;
  selectedInsectPresetIndex: number;
}

interface SafetyZonePanelProps {
  draft: SafetyZoneEditorDraft;
  onChange: (patch: Partial<SafetyZoneEditorDraft>) => void;
  onApply: () => void;
  onClose: () => void;
  onBeamDiagramOpen?: () => void;
}

const INSECT_PRESETS = [
  { label: "Egg", energyJ: 0.5 },
  { label: "Larva", energyJ: 1 },
  { label: "Caterpillar larva", energyJ: 3 },
  { label: "Adult", energyJ: 5 }
] as const;

function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

export function deriveSafetyZoneEditorView(
  draft: SafetyZoneEditorDraft
): SafetyZoneEditorView {
  const derivedDwellS = draft.requiredShotEnergyJ / Math.max(draft.laserPowerW, 1e-6);
  const selectedInsectPresetIndex = INSECT_PRESETS.reduce(
    (bestIndex, preset, index) =>
      Math.abs(preset.energyJ - draft.requiredShotEnergyJ) <
      Math.abs(INSECT_PRESETS[bestIndex].energyJ - draft.requiredShotEnergyJ)
        ? index
        : bestIndex,
    0
  );
  const metrics = calculateSafetyMetrics({
    laserPowerW: draft.laserPowerW,
    engagementDwellS: derivedDwellS,
    safetyFocalDistanceM: draft.safetyFocalDistanceM,
    safetyStartingApertureMm: draft.safetyStartingApertureMm
  });
  const previewDistanceMax = Math.max(
    8,
    roundUpToStep(metrics.nominalSafetyZoneRadiusM * 2, 0.5),
    roundUpToStep(draft.previewFarmerDistanceM, 0.5)
  );

  return {
    metrics,
    previewDistanceMax,
    previewFarmerDistanceM: Math.min(
      Math.max(draft.previewFarmerDistanceM, 0.5),
      previewDistanceMax
    ),
    derivedDwellS,
    selectedInsectPresetIndex
  };
}

function formatLength(valueM: number): string {
  if (valueM >= 1) {
    return `${formatDecimal(valueM, 2)} m`;
  }

  if (valueM >= 0.01) {
    return `${formatDecimal(valueM * 100, 1)} cm`;
  }

  return `${formatDecimal(valueM * 1000, 2)} mm`;
}

function formatEnergyDensity(value: number): string {
  if (value >= 1_000_000) {
    return `${value.toExponential(2)} J/m^2`;
  }

  return `${formatDecimal(value, 0)} J/m^2`;
}

function BeamConceptDiagram({
  focalDistanceM,
  startingApertureMm,
  previewFarmerDistanceM,
  metrics
}: {
  focalDistanceM: number;
  startingApertureMm: number;
  previewFarmerDistanceM: number;
  metrics: ReturnType<typeof calculateSafetyMetrics>;
}): JSX.Element {
  const viewDistanceM = Math.max(
    metrics.nominalSafetyZoneRadiusM * 1.15,
    previewFarmerDistanceM * 1.1,
    focalDistanceM * 1.7,
    2
  );
  const samples = Array.from({ length: 36 }, (_, index) => {
    const distanceM = (index / 35) * viewDistanceM;
    return {
      distanceM,
      radiusM: calculateBeamRadiusAtDistanceM(metrics, distanceM)
    };
  });
  const emitterRadiusM = Math.max((startingApertureMm * 0.5) / 1000, samples[0]?.radiusM ?? 0);
  const maxRadiusM = Math.max(emitterRadiusM, ...samples.map((sample) => sample.radiusM));
  const centerY = 60;
  const beamScaleY = 38 / Math.max(maxRadiusM, 1e-6);
  const beamTop = samples
    .map((sample) => {
      const x = 18 + (sample.distanceM / viewDistanceM) * 306;
      const y = centerY - sample.radiusM * beamScaleY;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const beamBottom = [...samples]
    .reverse()
    .map((sample) => {
      const x = 18 + (sample.distanceM / viewDistanceM) * 306;
      const y = centerY + sample.radiusM * beamScaleY;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const focusX = 18 + (focalDistanceM / viewDistanceM) * 306;
  const previewX = 18 + (previewFarmerDistanceM / viewDistanceM) * 306;
  const nszX = 18 + (metrics.nominalSafetyZoneRadiusM / viewDistanceM) * 306;
  const emitterHalfHeight = emitterRadiusM * beamScaleY;

  return (
    <div className="beam-diagram-card">
      <svg
        className="beam-diagram"
        viewBox="0 0 340 110"
        role="img"
        aria-label="Beam geometry showing aperture, focal point, and post-focus expansion"
      >
        <defs>
          <linearGradient id="beamFill" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#53d7ae" stopOpacity="0.18" />
            <stop offset="48%" stopColor="#dffff0" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#ff8a61" stopOpacity="0.26" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="340" height="110" rx="16" fill="rgba(6, 12, 11, 0.92)" />
        <line
          x1="18"
          y1={centerY}
          x2="324"
          y2={centerY}
          stroke="rgba(215, 239, 230, 0.25)"
          strokeDasharray="4 6"
        />
        <polygon
          points={`${beamTop} ${beamBottom}`}
          fill="url(#beamFill)"
          stroke="rgba(167, 230, 204, 0.35)"
          strokeWidth="1.2"
        />
        <line
          x1="18"
          y1={centerY - emitterHalfHeight}
          x2="18"
          y2={centerY + emitterHalfHeight}
          stroke="#72e8bf"
          strokeWidth="3"
        />
        <line
          x1={focusX}
          y1="20"
          x2={focusX}
          y2="92"
          stroke="#f8fff9"
          strokeDasharray="3 4"
          opacity="0.9"
        />
        <circle cx={focusX} cy={centerY} r="4.5" fill="#ffffff" />
        <line
          x1={previewX}
          y1="24"
          x2={previewX}
          y2="88"
          stroke="#7ad7b1"
          strokeDasharray="5 4"
          opacity="0.9"
        />
        <line
          x1={nszX}
          y1="16"
          x2={nszX}
          y2="94"
          stroke="#ff8a61"
          strokeDasharray="6 4"
          opacity="0.92"
        />
        <text x="4" y="16" className="beam-diagram-label" textAnchor="start">
          Aperture
        </text>
        <text x={Math.min(Math.max(focusX - 18, 24), 268)} y="16" className="beam-diagram-label">
          Focus
        </text>
        <text
          x={Math.min(Math.max(nszX - 32, 32), 254)}
          y="104"
          className="beam-diagram-label beam-diagram-label-warn"
        >
          Nominal SZ
        </text>
        <text
          x={Math.min(Math.max(previewX - 28, 28), 258)}
          y="92"
          className="beam-diagram-label beam-diagram-label-ok"
        >
          Farmer
        </text>
        <text x="4" y="92" className="beam-diagram-caption" textAnchor="start">
          Start diameter {formatDecimal(startingApertureMm, 1)} mm
        </text>
        <text x={Math.min(Math.max(focusX + 8, 62), 220)} y="30" className="beam-diagram-caption">
          Focal distance {formatDecimal(focalDistanceM, 2)} m
        </text>
        <text x="166" y="44" className="beam-diagram-caption">
          Beam expands again after focus
        </text>
      </svg>
    </div>
  );
}

function SafetySlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  digits = 2,
  displayValue,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  digits?: number;
  displayValue?: string;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <label className="slider-field">
      <span className="slider-header">
        <span>{label}</span>
        <strong>{displayValue ?? `${formatDecimal(value, digits)} ${unit}`}</strong>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function InsectIcon({
  type
}: {
  type: "Egg" | "Larva" | "Caterpillar larva" | "Adult";
}): JSX.Element {
  return (
    <span className={`insect-icon insect-icon-${type.toLowerCase().replaceAll(" ", "-")}`}>
      {type === "Egg" ? <span className="insect-egg-shape" /> : null}
      {type === "Larva" ? (
        <>
          <span className="insect-segment" />
          <span className="insect-segment" />
          <span className="insect-segment" />
        </>
      ) : null}
      {type === "Caterpillar larva" ? (
        <>
          <span className="insect-caterpillar-segment" />
          <span className="insect-caterpillar-segment" />
          <span className="insect-caterpillar-segment" />
          <span className="insect-caterpillar-segment" />
        </>
      ) : null}
      {type === "Adult" ? (
        <>
          <span className="insect-adult-head" />
          <span className="insect-adult-body" />
        </>
      ) : null}
    </span>
  );
}

export function SafetyZonePanel({
  draft,
  onChange,
  onApply,
  onClose,
  onBeamDiagramOpen
}: SafetyZonePanelProps): JSX.Element {
  const [showMath, setShowMath] = useState(false);
  const [showBeamDialog, setShowBeamDialog] = useState(false);
  const [compactLayout, setCompactLayout] = useState(false);
  const [helpText, setHelpText] = useState(
    "Hover or click an item to explain what it changes in the nominal safety model."
  );
  const {
    metrics,
    previewDistanceMax,
    previewFarmerDistanceM,
    derivedDwellS,
    selectedInsectPresetIndex
  } = useMemo(() => deriveSafetyZoneEditorView(draft), [draft]);
  const previewBeamRadiusM = calculateBeamRadiusAtDistanceM(metrics, previewFarmerDistanceM);
  const previewEnergyDensity = calculateCenterlineEnergyDensityJPerM2(
    metrics,
    previewFarmerDistanceM
  );
  const previewInsideNominalSafetyZone =
    previewFarmerDistanceM <= metrics.nominalSafetyZoneRadiusM;
  const equalEnergyShorterDwellS = 10 / Math.max(draft.laserPowerW, 1e-6);
  const detailWarnings: string[] = [];
  const tradeoffs: string[] = [];

  if (previewInsideNominalSafetyZone) {
    detailWarnings.push(
      `The farmer stands ${formatLength(previewFarmerDistanceM)} from the firing axis, which is inside the current ${formatLength(metrics.nominalSafetyZoneRadiusM)} nominal safety zone.`
    );
  } else {
    detailWarnings.push(
      `The farmer stands ${formatLength(previewFarmerDistanceM)} from the firing axis, outside the current ${formatLength(metrics.nominalSafetyZoneRadiusM)} nominal safety zone.`
    );
  }

  if (draft.safetyStartingApertureMm >= 18) {
    detailWarnings.push(
      "A large starting aperture shortens the hazard envelope, but it demands a larger MEMS mirror and heavier optics."
    );
  } else if (draft.safetyStartingApertureMm <= 7.5) {
    detailWarnings.push(
      "A small starting aperture keeps the optics compact, but it spreads faster and lengthens the nominal safety zone."
    );
  }

  if (draft.safetyFocalDistanceM >= 0.9) {
    detailWarnings.push(
      "A long focal distance pushes the tight waist farther out and makes close-range operation less forgiving."
    );
  }

  if (derivedDwellS >= 0.55) {
    detailWarnings.push(
      "Long dwell time means the drone must hold aim longer, which raises stabilization and interruption risk."
    );
  }

  if (draft.laserPowerW >= 120) {
    detailWarnings.push(
      "High laser power only helps if dwell falls with it; otherwise total delivered energy rises and the nominal safety zone grows."
    );
  }

  tradeoffs.push(
    `For the same 10 J shot energy, this power level would allow about ${formatDecimal(equalEnergyShorterDwellS, 2)} s dwell.`
  );
  tradeoffs.push(
    `Beam waist at focus is ${formatLength(metrics.beamWaistRadiusM)} and the Rayleigh range is ${formatLength(metrics.rayleighRangeM)}.`
  );
  tradeoffs.push(
    `Preview centerline dose is ${formatEnergyDensity(previewEnergyDensity)} against the nominal ${formatEnergyDensity(NOMINAL_SAFETY_THRESHOLD_J_PER_M2)} threshold.`
  );

  const defaultHelpText =
    "Hover or click an item to explain what it changes in the nominal safety model.";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 1180px)");
    const updateCompactLayout = (): void => setCompactLayout(mediaQuery.matches);

    updateCompactLayout();
    mediaQuery.addEventListener("change", updateCompactLayout);
    return () => mediaQuery.removeEventListener("change", updateCompactLayout);
  }, []);

  useEffect(() => {
    setHelpText(defaultHelpText);
  }, [defaultHelpText]);

  const bindHelp = (message: string) => ({
    onMouseEnter: () => setHelpText(message),
    onFocus: () => setHelpText(message),
    onClick: () => setHelpText(message),
    onMouseLeave: () => setHelpText(defaultHelpText),
    onBlur: () => setHelpText(defaultHelpText)
  });

  return (
    <section className={`safety-workbench${compactLayout ? " safety-workbench-compact" : ""}`}>
      <section className="safety-top-hero">
        <div
          className="safety-hero-block safety-hero-metric"
          {...bindHelp("Nominal safety zone is the current keep-out radius. Restarting the mission applies this exact value to firing decisions.")}
        >
          <div className="safety-hero-metric-row">
            <div className="safety-hero-metric-copy">
              <div className="safety-hero-metric-head">
                <span className="eyebrow">Nominal safety zone</span>
                <strong>{formatLength(metrics.nominalSafetyZoneRadiusM)}</strong>
                <div className="safety-kpi-row">
                  <span className="small-pill">
                    {previewInsideNominalSafetyZone ? "Farmer inside NSZ" : "Farmer outside NSZ"}
                  </span>
                  <span className="small-pill">Dwell {formatDecimal(derivedDwellS, 3)} s</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="beam-diagram-button"
              onClick={() => {
                setShowBeamDialog(true);
                onBeamDiagramOpen?.();
                setHelpText(
                  "Beam diagram opens a full-screen explanation of aperture, focus, farmer position, and nominal safety radius."
                );
              }}
              onMouseEnter={() =>
                setHelpText("Beam diagram thumbnail. Click to open the full-screen beam explanation.")
              }
              onFocus={() =>
                setHelpText("Beam diagram thumbnail. Click to open the full-screen beam explanation.")
              }
              onMouseLeave={() => setHelpText(defaultHelpText)}
              onBlur={() => setHelpText(defaultHelpText)}
            >
              <span className="beam-diagram-button-label">Beam diagram</span>
              <BeamConceptDiagram
                focalDistanceM={draft.safetyFocalDistanceM}
                startingApertureMm={draft.safetyStartingApertureMm}
                previewFarmerDistanceM={previewFarmerDistanceM}
                metrics={metrics}
              />
            </button>
          </div>
        </div>
        <div
          className="safety-hero-block safety-hero-actions"
          {...bindHelp("Mission actions either apply the edited safety model to the live simulation, show the compact math basis, or return to the paused mission unchanged.")}
        >
          <div className="safety-hero-actions-row">
            <span className="eyebrow">Mission actions</span>
            <span className="small-pill">Mission paused</span>
            <div className="button-row safety-button-row">
              <button className="primary-button" onClick={onApply}>
                Apply + restart
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setShowMath((value) => !value);
                  setHelpText(
                    "Mathematical explanation shows the simplified Gaussian-beam assumptions behind the nominal safety radius."
                  );
                }}
              >
                {showMath ? "Hide math" : "Show math"}
              </button>
              <button className="secondary-button" onClick={onClose}>
                Keep current mission
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="safety-rail safety-rail-settings">
        <div className="safety-rail-label">Alter settings</div>
        <div className="safety-rail-content">
          <div className="safety-compact-summary">
            <span
              className="small-pill"
              {...bindHelp(
                "Beam waist is the tightest beam radius at focus. Smaller waist gives higher on-target intensity, but it usually requires tighter optical control."
              )}
            >
              {formatLength(metrics.beamWaistRadiusM)} beam waist
            </span>
            <span
              className="small-pill"
              {...bindHelp(
                "Rayleigh range is the depth around focus where the beam stays relatively tight. A longer Rayleigh range means useful beam concentration persists over more distance."
              )}
            >
              {formatLength(metrics.rayleighRangeM)} Rayleigh range
            </span>
          </div>
          <div {...bindHelp("Focal distance sets where the beam narrows to its tightest waist. Longer focal distance generally pushes the hazard farther out.")}>
            <SafetySlider
            label="Focal distance"
            value={draft.safetyFocalDistanceM}
            min={0.25}
            max={3}
            step={0.01}
            unit="m"
            digits={2}
            onChange={(value) => onChange({ safetyFocalDistanceM: value })}
            />
          </div>
          <div {...bindHelp("Starting aperture is the beam diameter leaving the optics. Larger aperture shortens the hazard zone but needs larger, slower, more expensive steering optics.")}>
            <SafetySlider
            label="Starting aperture"
            value={draft.safetyStartingApertureMm}
            min={2}
            max={50}
            step={0.25}
            unit="mm"
            digits={2}
            onChange={(value) => onChange({ safetyStartingApertureMm: value })}
            />
          </div>
          <div {...bindHelp("Laser electrical draw raises available beam power. For a fixed required shot energy, more power reduces dwell time and makes aiming easier.")}>
            <SafetySlider
            label="Laser electrical draw"
            value={draft.laserPowerW}
            min={20}
            max={200}
            step={5}
            unit="W"
            digits={0}
            onChange={(value) => onChange({ laserPowerW: value })}
            />
          </div>
          <div
            className="insect-preset-selector"
            {...bindHelp("Target insect presets set the required shot energy. Higher-energy insects need longer dwell or more laser power to achieve the same effect.")}
          >
            {INSECT_PRESETS.map((preset) => {
              const selected = preset.energyJ === INSECT_PRESETS[selectedInsectPresetIndex].energyJ;
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`insect-preset-button${selected ? " active" : ""}`}
                  onClick={() => onChange({ requiredShotEnergyJ: preset.energyJ })}
                >
                  <InsectIcon type={preset.label} />
                  <span>{preset.label}</span>
                  <strong>{formatDecimal(preset.energyJ, 1)} J</strong>
                </button>
              );
            })}
          </div>
          <div {...bindHelp("Preview farmer distance moves the farmer relative to the firing axis so you can see when the preview crosses inside or outside the nominal safety zone.")}>
            <SafetySlider
            label="Preview farmer distance"
            value={previewFarmerDistanceM}
            min={0.5}
            max={previewDistanceMax}
            step={0.05}
            unit="m"
            digits={2}
            onChange={(value) => onChange({ previewFarmerDistanceM: value })}
            />
          </div>
          <div className="safety-inline-metrics" {...bindHelp("Shot coupling shows the selected insect energy target and the dwell time implied by the current laser power.")}>
            <div className="safety-kpi-grid">
              <div>
                <span>Shot energy</span>
                <strong>{formatDecimal(draft.requiredShotEnergyJ, 2)} J</strong>
              </div>
              <div>
                <span>Computed dwell</span>
                <strong>{formatDecimal(derivedDwellS, 3)} s</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="safety-rail safety-rail-detail">
        <div className="safety-rail-label">Farmer status</div>
        <div className="safety-rail-content safety-analysis-shell">
          <div
            className="safety-warning-strip"
            role="status"
            aria-live="polite"
            {...bindHelp("This warning chip is the compact conclusion for the current farmer position. If it says the farmer is inside NSZ, the shot stays blocked until the zone clears or the model changes.")}
          >
            <div className="safety-warning-chip">{detailWarnings[0]}</div>
          </div>
          <div className="safety-inline-metrics">
            <div className="safety-kpi-grid">
              <div {...bindHelp("Distance to beam is the current farmer offset from the firing axis.")}>
                <span>Distance to beam</span>
                <strong>{formatLength(previewFarmerDistanceM)}</strong>
              </div>
              <div {...bindHelp("Beam radius at farmer shows how wide the beam is at the farmer position, not at focus.")}>
                <span>Beam radius</span>
                <strong>{formatLength(previewBeamRadiusM)}</strong>
              </div>
              <div {...bindHelp("Centerline dose is the simplified energy-density estimate at the farmer position.")}>
                <span>Centerline dose</span>
                <strong>{formatEnergyDensity(previewEnergyDensity)}</strong>
              </div>
              <div {...bindHelp("Equal-energy dwell says how short the shot could be if the system still delivered 10 J at the current power level.")}>
                <span>10 J dwell</span>
                <strong>{formatDecimal(equalEnergyShorterDwellS, 2)} s</strong>
              </div>
            </div>
          </div>
          <div className="safety-note-list">
            {detailWarnings.slice(1).map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            {tradeoffs.map((tradeoff) => (
              <p key={tradeoff}>{tradeoff}</p>
            ))}
          </div>
          {showMath ? (
            <div
              className="formula-block"
              {...bindHelp("The math block shows the simplified Gaussian-beam reasoning used by this nominal teaching model.")}
            >
              {`Nominal teaching model

- required dwell = required shot energy / laser power
- beam waist and Rayleigh range come from the selected aperture and focal distance
- beam radius at farmer distance determines the centerline dose estimate
- nominal safety zone radius is the distance where the estimated dose falls below the nominal eye-safety threshold

This is a design-teaching model, not a certified safety analysis.`}
            </div>
          ) : null}
        </div>
      </section>

      <div className="safety-help-line" role="status" aria-live="polite">
        {helpText}
      </div>

      {showBeamDialog ? (
        <div className="beam-dialog-backdrop" onClick={() => setShowBeamDialog(false)}>
          <div className="beam-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="beam-dialog-header">
              <div>
                <span className="eyebrow">Beam diagram</span>
                <h2>How aperture, focus, and distance set the nominal safety zone</h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowBeamDialog(false)}
              >
                Close
              </button>
            </div>
            <div className="beam-dialog-diagram">
              <BeamConceptDiagram
                focalDistanceM={draft.safetyFocalDistanceM}
                startingApertureMm={draft.safetyStartingApertureMm}
                previewFarmerDistanceM={previewFarmerDistanceM}
                metrics={metrics}
              />
            </div>
            <div className="beam-dialog-grid">
              <div>
                <strong>Aperture</strong>
                <p>The beam leaves the optics at this starting diameter. Larger aperture reduces divergence but requires larger steering hardware.</p>
              </div>
              <div>
                <strong>Focus</strong>
                <p>The focal distance sets where the beam reaches its tightest waist. Pushing focus farther out usually stretches the hazard envelope.</p>
              </div>
              <div>
                <strong>Farmer marker</strong>
                <p>This marker shows the preview distance you are testing. If it sits inside the nominal safety radius, the shot remains blocked.</p>
              </div>
              <div>
                <strong>Nominal SZ</strong>
                <p>This is the current keep-out radius from the beam axis for this teaching model. Applying changes restarts the mission with this value.</p>
              </div>
              <div>
                <strong>Post-focus expansion</strong>
                <p>After the waist, the beam expands again. That expansion reduces centerline dose with distance and eventually drops below the nominal threshold.</p>
              </div>
              <div>
                <strong>Design tradeoff</strong>
                <p>Higher power shortens dwell for a fixed insect dose. Larger aperture shortens hazard range but costs more and slows aiming hardware.</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
