import { FieldType, MissionSummary } from "../sim/types";
import { formatCurrencyUsd, formatDuration, formatEnergy, formatPercent } from "../lib/format";
import {
  formatCostPerHectare,
  formatSavingsMultiple,
  savingsMultiple,
  SPRAY_BASELINES
} from "../lib/economics";

interface SummaryPanelProps {
  summary: MissionSummary | null;
  fieldType: FieldType;
}

function BreakdownBar({ summary }: { summary: MissionSummary }): JSX.Element {
  const segments = [
    { label: "Flight", color: "#79dcb4", fraction: summary.energyFractions.flight },
    { label: "Hover", color: "#4f8f84", fraction: summary.energyFractions.hover },
    { label: "Acceleration", color: "#f2bf6d", fraction: summary.energyFractions.acceleration },
    { label: "Laser", color: "#f9654d", fraction: summary.energyFractions.laser },
    { label: "Avionics", color: "#8ea1c9", fraction: summary.energyFractions.avionics }
  ];

  return (
    <>
      <div className="breakdown-bar">
        {segments.map((segment) => (
          <span
            key={segment.label}
            style={{
              background: segment.color,
              width: `${Math.max(segment.fraction * 100, segment.fraction > 0 ? 3 : 0)}%`
            }}
          />
        ))}
      </div>
      <div className="legend-list">
        {segments.map((segment) => (
          <div className="legend-row" key={segment.label}>
            <span>
              <i style={{ background: segment.color }} />
              {segment.label}
            </span>
            <strong>{formatPercent(segment.fraction, 0)}</strong>
          </div>
        ))}
      </div>
    </>
  );
}

function CostStory({ summary, fieldType }: { summary: MissionSummary; fieldType: FieldType }): JSX.Element {
  const baseline = SPRAY_BASELINES[fieldType];
  const laserCost = summary.costPerHectareUsd;
  const multiple = savingsMultiple(laserCost, fieldType);
  // Keep the laser bar visible even though it is orders of magnitude shorter than the baseline.
  const laserBarPct = Math.max((laserCost / baseline.costPerHectareUsd) * 100, 0.75);

  return (
    <div className="cost-story">
      <div className="cost-story-headline">
        <strong>{formatCostPerHectare(laserCost)}</strong>
        <span> per hectare in consumables — roughly {formatSavingsMultiple(multiple)} cheaper than spraying</span>
      </div>
      <div className="cost-compare">
        <div className="cost-compare-row">
          <span>Laser drone (this run)</span>
          <div className="cost-compare-track">
            <i className="cost-compare-fill cost-compare-fill-laser" style={{ width: `${laserBarPct}%` }} />
          </div>
          <strong>{formatCostPerHectare(laserCost)}</strong>
        </div>
        <div className="cost-compare-row">
          <span>Typical {baseline.label}</span>
          <div className="cost-compare-track">
            <i className="cost-compare-fill cost-compare-fill-spray" style={{ width: "100%" }} />
          </div>
          <strong>~${baseline.costPerHectareUsd}</strong>
        </div>
      </div>
      <p className="cost-story-note">
        Simulated consumables only: battery wear plus charging electricity. Drone amortization, labor, and
        maintenance are excluded on both sides; the spray figure is an indicative single-application cost
        for product and operation.
      </p>
    </div>
  );
}

export function SummaryPanel({ summary, fieldType }: SummaryPanelProps): JSX.Element {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Mission Report</span>
          <h2>End-of-run summary</h2>
        </div>
        <span className={`status-pill ${summary ? "status-complete" : ""}`}>
          {summary ? "Mission complete" : "Awaiting completion"}
        </span>
      </div>

      {summary ? (
        <>
          <CostStory summary={summary} fieldType={fieldType} />
          <div className="summary-grid">
            <div>
              <span>Total neutralized</span>
              <strong>{summary.beetlesNeutralized}</strong>
            </div>
            <div>
              <span>Total mission time</span>
              <strong>{formatDuration(summary.totalMissionTimeS)}</strong>
            </div>
            <div>
              <span>Total energy</span>
              <strong>{formatEnergy(summary.totalEnergyWh)}</strong>
            </div>
            <div>
              <span>Charging cycles</span>
              <strong>{summary.rechargeCycles}</strong>
            </div>
            <div>
              <span>Average time per target</span>
              <strong>{formatDuration(summary.averageTimePerTargetS)}</strong>
            </div>
            <div>
              <span>Energy per target</span>
              <strong>{formatEnergy(summary.energyPerBeetleWh)}</strong>
            </div>
            <div>
              <span>Battery depreciation</span>
              <strong>{formatCurrencyUsd(summary.batteryDepreciationCostUsd)}</strong>
            </div>
            <div>
              <span>Charging electricity</span>
              <strong>{formatCurrencyUsd(summary.energyCostUsd)}</strong>
            </div>
            <div>
              <span>Cost per hectare</span>
              <strong>{formatCostPerHectare(summary.costPerHectareUsd)} / ha</strong>
            </div>
            <div>
              <span>Equivalent full cycles</span>
              <strong>{summary.equivalentFullCyclesUsed.toFixed(3)}</strong>
            </div>
          </div>
          <BreakdownBar summary={summary} />
        </>
      ) : (
        <p className="panel-note">
          The summary populates once the drone clears the infestation, lands at the dock, and finalizes the
          energy ledger.
        </p>
      )}
    </section>
  );
}
