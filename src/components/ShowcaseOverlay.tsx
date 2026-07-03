import { MODE_LABELS } from "../sim/defaults";
import { getFieldProfile } from "../sim/fieldProfiles";
import { FieldType, SimulationSnapshot } from "../sim/types";
import { formatDuration, formatEnergy } from "../lib/format";
import {
  formatCostPerHectare,
  formatSavingsMultiple,
  savingsMultiple,
  SPRAY_BASELINES
} from "../lib/economics";

const SHOWCASE_FIELD_TYPES: FieldType[] = [
  "potatoColoradoBeetle",
  "riceYellowStemBorerEgg",
  "orchardMarmoratedStinkBug",
  "greenhouseTulipCaterpillar"
];

interface ShowcaseOverlayProps {
  snapshot: SimulationSnapshot;
  isIntroActive: boolean;
  playbackSpeed: number;
  safetyHold: boolean;
  onFieldTypeChange: (fieldType: FieldType) => void;
  onExplore: () => void;
}

export function ShowcaseOverlay({
  snapshot,
  isIntroActive,
  playbackSpeed,
  safetyHold,
  onFieldTypeChange,
  onExplore
}: ShowcaseOverlayProps): JSX.Element {
  const fieldType = snapshot.params.fieldType;
  const baseline = SPRAY_BASELINES[fieldType];
  const summary = snapshot.summary;
  const costPerHectareUsd = summary
    ? summary.costPerHectareUsd
    : snapshot.metrics.costPerHectareUsd;
  const hasData = snapshot.metrics.totalEnergyWh > 0;
  const fieldAreaHectares =
    (snapshot.params.fieldLengthM * snapshot.params.fieldWidthM) / 10_000;
  const mode = snapshot.drone.mode;
  const chargeState =
    mode === "charging" ? "charging" : mode === "returning" ? "returning" : null;
  const statusLabel = isIntroActive
    ? "Surveying the field"
    : safetyHold
      ? "Paused — person in safety zone"
      : chargeState === "returning"
        ? "Low battery — returning to charging station"
        : chargeState === "charging"
          ? "Recharging at station"
          : MODE_LABELS[mode];

  const batteryPct = Math.max(0, Math.min(1, snapshot.drone.batteryPct));
  const batteryLevel =
    chargeState === "charging"
      ? "charging"
      : batteryPct <= 0.16
        ? "low"
        : batteryPct <= 0.3
          ? "warn"
          : "ok";

  return (
    <div className="showcase-overlay">
      <div className="showcase-chips">
        {SHOWCASE_FIELD_TYPES.map((value) => {
          const profile = getFieldProfile(value);
          return (
            <button
              key={value}
              type="button"
              className={value === fieldType ? "showcase-chip showcase-chip-active" : "showcase-chip"}
              onClick={() => onFieldTypeChange(value)}
            >
              {profile.cropLabel}
            </button>
          );
        })}
      </div>

      <span className="showcase-timelapse">Time-lapse {playbackSpeed}×</span>

      <div className="showcase-hero">
        <span className="showcase-hero-label">Treatment cost, this field</span>
        <strong className="showcase-hero-value">
          {hasData ? formatCostPerHectare(costPerHectareUsd) : "—"}
          <em>/ hectare</em>
        </strong>
        <span className="showcase-hero-baseline">
          conventional spraying: ~${baseline.costPerHectareUsd} / hectare
        </span>
      </div>

      <div className="showcase-battery" data-level={batteryLevel}>
        <span className="showcase-battery-track">
          <span className="showcase-battery-fill" style={{ width: `${batteryPct * 100}%` }} />
        </span>
        <span className="showcase-battery-pct">{Math.round(batteryPct * 100)}%</span>
        {chargeState ? (
          <span className="showcase-battery-note">
            {chargeState === "charging" ? "⚡ Recharging" : "↩ To charging station"}
          </span>
        ) : null}
      </div>

      <div className="showcase-status">
        <span>{formatDuration(snapshot.metrics.missionElapsedS)} mission time</span>
        <span>{snapshot.metrics.beetlesNeutralized.toLocaleString("en-US")} neutralized</span>
        <span>{formatEnergy(snapshot.metrics.totalEnergyWh)}</span>
        <span className={safetyHold || chargeState ? "showcase-status-safety" : undefined}>{statusLabel}</span>
      </div>

      <button type="button" className="showcase-explore" onClick={onExplore}>
        Explore the model →
      </button>

      {summary ? (
        <div className="showcase-result">
          <span className="showcase-hero-label">
            {fieldAreaHectares.toFixed(0)} ha cleared in {formatDuration(summary.totalMissionTimeS)}
          </span>
          <strong className="showcase-result-value">
            {formatCostPerHectare(summary.costPerHectareUsd)} / hectare
          </strong>
          <span className="showcase-result-line">
            {summary.beetlesNeutralized.toLocaleString("en-US")} pests neutralized ·{" "}
            {formatEnergy(summary.totalEnergyWh)} ·{" "}
            {formatSavingsMultiple(savingsMultiple(summary.costPerHectareUsd, fieldType))} cheaper than
            spraying
          </span>
          <span className="showcase-result-restart">Restarting with a fresh field…</span>
        </div>
      ) : null}
    </div>
  );
}
