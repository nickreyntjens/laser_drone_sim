import { MODE_LABELS } from "../sim/defaults";
import { getFieldProfile } from "../sim/fieldProfiles";
import { SimulationSnapshot } from "../sim/types";
import {
  formatCurrencyUsd,
  formatDuration,
  formatEnergy,
  formatKiloWattHours,
  formatPercent,
  formatPower
} from "../lib/format";
import { formatCostPerHectare } from "../lib/economics";

interface LiveMetricsProps {
  snapshot: SimulationSnapshot;
  isIntroActive: boolean;
}

interface MetricCardProps {
  label: string;
  value: string;
  tone?: "default" | "accent";
}

function MetricCard({ label, value, tone = "default" }: MetricCardProps): JSX.Element {
  return (
    <div className={`metric-card metric-card-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function LiveMetrics({ snapshot, isIntroActive }: LiveMetricsProps): JSX.Element {
  const { drone, metrics } = snapshot;
  const fieldProfile = getFieldProfile(snapshot.params.fieldType);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Live Telemetry</span>
          <h2>Mission state</h2>
        </div>
        <span className="status-pill">
          {isIntroActive ? "Field initialization" : MODE_LABELS[drone.mode]}
        </span>
      </div>

      <div className="metric-grid">
        <MetricCard label="Battery remaining" value={formatKiloWattHours(drone.batteryWh)} tone="accent" />
        <MetricCard label="State of charge" value={formatPercent(drone.batteryPct, 0)} />
        <MetricCard label="Power draw" value={formatPower(drone.instantaneousPowerW)} />
        <MetricCard label="Mission time" value={formatDuration(metrics.missionElapsedS)} />
        <MetricCard label="Energy used" value={formatEnergy(metrics.totalEnergyWh)} />
        <MetricCard label="Targets remaining" value={String(metrics.beetlesRemaining)} />
        <MetricCard label="Recharge cycles" value={String(metrics.rechargeCycles)} />
      </div>

      <div className="telemetry-rows">
        {isIntroActive ? (
          <div className="telemetry-row">
            <span>Pre-roll</span>
            <strong>{fieldProfile.introSettlingLabel}</strong>
          </div>
        ) : null}
        <div className="telemetry-row">
          <span>Neutralized</span>
          <strong>{metrics.beetlesNeutralized}</strong>
        </div>
        <div className="telemetry-row">
          <span>Average time per target</span>
          <strong>{formatDuration(metrics.averageTimePerTargetS)}</strong>
        </div>
        <div className="telemetry-row">
          <span>Energy per target</span>
          <strong>{formatEnergy(metrics.energyPerBeetleWh)}</strong>
        </div>
        <div className="telemetry-row">
          <span>Battery depreciation</span>
          <strong>{formatCurrencyUsd(metrics.batteryDepreciationCostUsd)}</strong>
        </div>
        <div className="telemetry-row">
          <span>Charging electricity</span>
          <strong>{formatCurrencyUsd(metrics.energyCostUsd)}</strong>
        </div>
        <div className="telemetry-row">
          <span>Estimated cost per hectare</span>
          <strong>{formatCostPerHectare(metrics.costPerHectareUsd)} / ha</strong>
        </div>
      </div>
    </section>
  );
}
