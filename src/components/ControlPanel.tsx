import { SimulationParameters } from "../sim/types";
import { formatDecimal, formatHectares, formatKiloWattHours } from "../lib/format";

interface ControlPanelProps {
  activeParams: SimulationParameters;
  draftParams: SimulationParameters;
  hasPendingChanges: boolean;
  isRunning: boolean;
  seed: number;
  onApply: () => void;
  onRandomize: () => void;
  onRestart: () => void;
  onToggleRun: () => void;
  onParamChange: <K extends keyof SimulationParameters>(
    key: K,
    value: SimulationParameters[K]
  ) => void;
}

interface SliderFieldProps<K extends keyof SimulationParameters> {
  label: string;
  paramKey: K;
  min: number;
  max: number;
  step: number;
  unit: string;
  value: SimulationParameters[K];
  onParamChange: <T extends keyof SimulationParameters>(
    key: T,
    value: SimulationParameters[T]
  ) => void;
  digits?: number;
}

interface ChoiceFieldProps<K extends keyof SimulationParameters> {
  label: string;
  paramKey: K;
  helpText?: string;
  options: Array<{
    label: string;
    value: SimulationParameters[K];
    description?: string;
  }>;
  value: SimulationParameters[K];
  onParamChange: <T extends keyof SimulationParameters>(
    key: T,
    value: SimulationParameters[T]
  ) => void;
}

function InfoHint({ text }: { text: string }): JSX.Element {
  return (
    <span className="info-hint" title={text} aria-label={text}>
      i
    </span>
  );
}

function SliderField<K extends keyof SimulationParameters>({
  label,
  paramKey,
  min,
  max,
  step,
  unit,
  value,
  onParamChange,
  digits = 1
}: SliderFieldProps<K>): JSX.Element {
  const numericValue = Number(value);

  return (
    <label className="slider-field">
      <span className="slider-header">
        <span>{label}</span>
        <strong>
          {formatDecimal(numericValue, digits)} {unit}
        </strong>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={numericValue}
        onChange={(event) =>
          onParamChange(paramKey, Number(event.target.value) as SimulationParameters[K])
        }
      />
    </label>
  );
}

function ChoiceField<K extends keyof SimulationParameters>({
  label,
  paramKey,
  helpText,
  options,
  value,
  onParamChange
}: ChoiceFieldProps<K>): JSX.Element {
  return (
    <div className="choice-field">
      <span className="slider-header">
        <span className="inline-label">
          {label}
          {helpText ? <InfoHint text={helpText} /> : null}
        </span>
      </span>
      <div className="choice-chip-row">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className={value === option.value ? "camera-button active" : "camera-button"}
            title={option.description}
            aria-label={
              option.description ? `${option.label}. ${option.description}` : option.label
            }
            onClick={() => onParamChange(paramKey, option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ControlPanel({
  activeParams,
  draftParams,
  hasPendingChanges,
  isRunning,
  seed,
  onApply,
  onRandomize,
  onRestart,
  onToggleRun,
  onParamChange
}: ControlPanelProps): JSX.Element {
  const activeFieldAreaSqM = activeParams.fieldLengthM * activeParams.fieldWidthM;
  const draftShotEnergyJ = draftParams.laserPowerW * draftParams.engagementDwellS;

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Scenario Controls</span>
          <h2>Mission setup</h2>
        </div>
        <span className="small-pill">Seed {seed}</span>
      </div>

      <div className="button-row">
        <button className="primary-button" onClick={onApply} disabled={!hasPendingChanges}>
          {hasPendingChanges ? "Apply changes" : "Scenario live"}
        </button>
        <button className="secondary-button" onClick={onRestart}>
          Restart mission
        </button>
        <button className="secondary-button" onClick={onRandomize}>
          Randomize beetles
        </button>
        <button className="secondary-button" onClick={onToggleRun}>
          {isRunning ? "Pause" : "Resume"}
        </button>
      </div>

      <p className="panel-note">
        The mission uses the active parameter set immediately below. Draft changes restart the sweep only when
        you apply them.
      </p>

      <div className="control-grid">
        <div className="control-group">
          <div className="control-title-row">
            <h3>Mission mode</h3>
            <span>
              {draftParams.targetingMode === "preSurveyed" ? "Pre-surveyed route" : "Live detection sweep"}
            </span>
          </div>
          <ChoiceField
            label="Target intelligence"
            paramKey="targetingMode"
            value={draftParams.targetingMode}
            onParamChange={onParamChange}
            helpText="Choose whether the drone searches for beetles live or flies directly to beetles already identified in prior scouting imagery."
            options={[
              {
                label: "Live search",
                value: "search",
                description: "The drone sweeps the field, detects beetles during flight, and then engages them."
              },
              {
                label: "Known locations",
                value: "preSurveyed",
                description: "The drone assumes beetle coordinates are already known from prior drone footage and routes directly to them."
              }
            ]}
          />
          <ChoiceField
            label="Target markers"
            paramKey="showOnlySelectedTargetMarkers"
            value={draftParams.showOnlySelectedTargetMarkers}
            onParamChange={onParamChange}
            helpText="Reduce clutter by showing only the currently selected target marker, or show marker beacons for every target."
            options={[
              {
                label: "Selected only",
                value: true,
                description: "Only the actively selected beetle keeps a marker beacon on screen."
              },
              {
                label: "Show all",
                value: false,
                description: "Every beetle marker stays visible, which is useful for debugging or overview shots."
              }
            ]}
          />
        </div>

        <div className="control-group">
          <div className="control-title-row">
            <h3>Field</h3>
            <span>
              {activeParams.fieldLengthM} x {activeParams.fieldWidthM} m / {formatHectares(activeFieldAreaSqM)}
            </span>
          </div>
          <SliderField
            label="Field length"
            paramKey="fieldLengthM"
            min={180}
            max={650}
            step={10}
            unit="m"
            value={draftParams.fieldLengthM}
            onParamChange={onParamChange}
            digits={0}
          />
          <SliderField
            label="Field width"
            paramKey="fieldWidthM"
            min={120}
            max={420}
            step={5}
            unit="m"
            value={draftParams.fieldWidthM}
            onParamChange={onParamChange}
            digits={0}
          />
          <SliderField
            label="Invasion-edge density"
            paramKey="edgeDensityPerHectare"
            min={100}
            max={2000}
            step={25}
            unit="beetles / ha"
            value={draftParams.edgeDensityPerHectare}
            onParamChange={onParamChange}
            digits={0}
          />
          <SliderField
            label="Gradient strength"
            paramKey="gradientStrength"
            min={1}
            max={12}
            step={0.25}
            unit="exp decay"
            value={draftParams.gradientStrength}
            onParamChange={onParamChange}
            digits={2}
          />
          <SliderField
            label="Farmers in field"
            paramKey="farmersPerHectare"
            min={0}
            max={6}
            step={0.05}
            unit="farmers / ha"
            value={draftParams.farmersPerHectare}
            onParamChange={onParamChange}
            digits={2}
          />
        </div>

        <div className="control-group">
          <div className="control-title-row">
            <h3>Drone</h3>
            <span>{formatKiloWattHours(activeParams.batteryCapacityWh)} pack</span>
          </div>
          <SliderField
            label="Battery capacity"
            paramKey="batteryCapacityWh"
            min={80}
            max={320}
            step={10}
            unit="Wh"
            value={draftParams.batteryCapacityWh}
            onParamChange={onParamChange}
            digits={0}
          />
          <SliderField
            label="Drone mass"
            paramKey="droneMassKg"
            min={0.5}
            max={5}
            step={0.05}
            unit="kg"
            value={draftParams.droneMassKg}
            onParamChange={onParamChange}
          />
          <SliderField
            label="Cruise speed"
            paramKey="cruiseSpeedMps"
            min={4}
            max={12}
            step={0.1}
            unit="m/s"
            value={draftParams.cruiseSpeedMps}
            onParamChange={onParamChange}
          />
          <SliderField
            label="Max horizontal acceleration"
            paramKey="maxHorizontalAccelMps2"
            min={1}
            max={6}
            step={0.1}
            unit="m/s²"
            value={draftParams.maxHorizontalAccelMps2}
            onParamChange={onParamChange}
            digits={1}
          />
          <SliderField
            label="Effective drag area"
            paramKey="effectiveDragAreaM2"
            min={0.01}
            max={0.12}
            step={0.002}
            unit="m²"
            value={draftParams.effectiveDragAreaM2}
            onParamChange={onParamChange}
            digits={3}
          />
        </div>

        <div className="control-group">
          <div className="control-title-row">
            <h3>Engagement</h3>
            <span>{formatDecimal(draftShotEnergyJ, 1)} J / shot</span>
          </div>
          <SliderField
            label="Laser electrical draw"
            paramKey="laserPowerW"
            min={20}
            max={200}
            step={5}
            unit="W"
            value={draftParams.laserPowerW}
            onParamChange={onParamChange}
            digits={0}
          />
          <SliderField
            label="Laser dwell time"
            paramKey="engagementDwellS"
            min={0.05}
            max={1}
            step={0.01}
            unit="s"
            value={draftParams.engagementDwellS}
            onParamChange={onParamChange}
            digits={2}
          />
          <SliderField
            label="Max speed when firing"
            paramKey="maxFiringSpeedMps"
            min={0}
            max={2}
            step={0.05}
            unit="m/s"
            value={draftParams.maxFiringSpeedMps}
            onParamChange={onParamChange}
            digits={2}
          />
          <SliderField
            label="Reserve threshold"
            paramKey="reserveBatteryPct"
            min={8}
            max={30}
            step={1}
            unit="%"
            value={draftParams.reserveBatteryPct}
            onParamChange={onParamChange}
            digits={0}
          />
          <SliderField
            label="Recharge time"
            paramKey="rechargeTimeMin"
            min={2}
            max={120}
            step={1}
            unit="min"
            value={draftParams.rechargeTimeMin}
            onParamChange={onParamChange}
            digits={0}
          />
        </div>

        <div className="control-group">
          <div className="control-title-row">
            <h3>Economics</h3>
            <span>Battery depreciation only</span>
          </div>
          <SliderField
            label="Battery replacement cost"
            paramKey="batteryReplacementCostUsd"
            min={60}
            max={400}
            step={10}
            unit="USD"
            value={draftParams.batteryReplacementCostUsd}
            onParamChange={onParamChange}
            digits={0}
          />
          <SliderField
            label="Battery cycle life"
            paramKey="batteryCycleLife"
            min={200}
            max={1200}
            step={25}
            unit="cycles"
            value={draftParams.batteryCycleLife}
            onParamChange={onParamChange}
            digits={0}
          />
        </div>
      </div>
    </section>
  );
}
