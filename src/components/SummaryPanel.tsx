import { MissionSummary } from "../sim/types";
import { formatCurrencyUsd, formatDuration, formatEnergy, formatPercent } from "../lib/format";

interface SummaryPanelProps {
  summary: MissionSummary | null;
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

export function SummaryPanel({ summary }: SummaryPanelProps): JSX.Element {
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
              <span>Cost per hectare</span>
              <strong>{formatCurrencyUsd(summary.costPerHectareUsd)} / ha</strong>
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
