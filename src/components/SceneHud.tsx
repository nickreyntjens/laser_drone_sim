import { AttitudeIndicator } from "./AttitudeIndicator";
import { MODE_LABELS } from "../sim/defaults";
import { SimulationSnapshot } from "../sim/types";
import {
  formatDuration,
  formatHectares,
  formatKiloWattHours,
  formatPower,
  formatSpeed
} from "../lib/format";

interface SceneHudProps {
  snapshot: SimulationSnapshot;
  isIntroActive: boolean;
  isExpanded: boolean;
  controlsHidden: boolean;
  isMobileUi?: boolean;
}

interface HudMetricProps {
  label: string;
  value: string;
  accent?: boolean;
}

function HudMetric({ label, value, accent = false }: HudMetricProps): JSX.Element {
  return (
    <div className={accent ? "hud-metric hud-metric-accent" : "hud-metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function SceneHud({
  snapshot,
  isIntroActive,
  isExpanded,
  controlsHidden,
  isMobileUi = false
}: SceneHudProps): JSX.Element {
  const { drone, metrics } = snapshot;
  const modeLabel = isIntroActive ? "Field initialization" : MODE_LABELS[drone.mode];
  const fieldAreaSqM = snapshot.params.fieldLengthM * snapshot.params.fieldWidthM;
  const fieldSizeLabel = formatHectares(fieldAreaSqM);
  const pressureLabel = `${Math.round(snapshot.params.edgeDensityPerHectare)} beetles/ha`;
  const currentSpeedMps = Math.sqrt(
    drone.velocity.x * drone.velocity.x +
      drone.velocity.y * drone.velocity.y +
      drone.velocity.z * drone.velocity.z
  );
  const compactStatusItems = isMobileUi
    ? [
        `Time ${formatDuration(metrics.missionElapsedS)}`
      ]
    : [
        `Mission time ${formatDuration(metrics.missionElapsedS)}`,
        fieldSizeLabel,
        pressureLabel,
        modeLabel
      ];
  const expandedStatusItems = isMobileUi
    ? [
        `Time ${formatDuration(metrics.missionElapsedS)}`,
        `Power ${formatPower(drone.instantaneousPowerW)}`
      ]
    : [
        `Mission time ${formatDuration(metrics.missionElapsedS)}`,
        `Speed ${formatSpeed(currentSpeedMps)}`,
        fieldSizeLabel,
        pressureLabel,
        modeLabel
      ];

  if (!isExpanded) {
    return (
      <div className="scene-hud scene-hud-compact">
        <div className="scene-hud-status">
          {compactStatusItems.map((item) => (
            <span key={item} className="small-pill">
              {item}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (controlsHidden) {
    return (
      <div className="scene-attitude-shell scene-attitude-shell-clean">
        <AttitudeIndicator drone={drone} />
      </div>
    );
  }

  return (
    <>
      <div className="scene-hud">
        <div className="scene-hud-status">
          {expandedStatusItems.map((item) => (
            <span key={item} className="small-pill">
              {item}
            </span>
          ))}
        </div>
        {!isMobileUi ? (
          <div className="scene-hud-grid">
            <HudMetric label="Power draw" value={formatPower(drone.instantaneousPowerW)} />
            <HudMetric label="Battery remaining" value={formatKiloWattHours(drone.batteryWh)} accent />
            <HudMetric label="Neutralized" value={String(metrics.beetlesNeutralized)} />
            <HudMetric label="Energy used" value={formatKiloWattHours(metrics.totalEnergyWh)} />
          </div>
        ) : null}
      </div>
      <div className="scene-attitude-shell">
        <AttitudeIndicator drone={drone} />
      </div>
    </>
  );
}
