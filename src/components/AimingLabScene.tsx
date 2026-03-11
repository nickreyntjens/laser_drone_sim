import { useMemo } from "react";
import { AimingSample, computeAimingDiagramState } from "../sim/aiming";

function mapPoint(
  x: number,
  z: number,
  bounds: { minX: number; maxX: number; maxAbsZ: number },
  width: number,
  height: number
): { x: number; y: number } {
  const normalizedX = (x - bounds.minX) / Math.max(bounds.maxX - bounds.minX, 1e-6);
  const normalizedZ = z / Math.max(bounds.maxAbsZ, 1e-6);
  return {
    x: 48 + normalizedX * (width - 96),
    y: height * 0.5 - normalizedZ * (height * 0.34)
  };
}

function buildPolyline(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

export function AimingLabScene({
  sample,
  showMeasuredPoint = true,
  mirrorVisualExaggeration = 220
}: {
  sample: AimingSample;
  showMeasuredPoint?: boolean;
  mirrorVisualExaggeration?: number;
}): JSX.Element {
  const diagram = useMemo(
    () => computeAimingDiagramState(sample, { mirrorVisualExaggeration }),
    [mirrorVisualExaggeration, sample]
  );
  const width = 720;
  const height = 320;
  const bounds = useMemo(() => {
    const xs = [
      diagram.targetPosition.x,
      diagram.virtualTargetPoint.x,
      diagram.mirrorPosition.x,
      diagram.lensCenter.x,
      diagram.sensorCenter.x
    ];
    const zs = [
      diagram.targetPosition.z,
      diagram.virtualTargetPoint.z,
      diagram.actualSensorPoint.z,
      diagram.measuredSensorPoint.z,
      diagram.lensParallelPoint.z
    ];
    return {
      minX: Math.min(...xs) - 0.35,
      maxX: Math.max(...xs) + 0.35,
      maxAbsZ: Math.max(0.18, ...zs.map((value) => Math.abs(value))) * 1.28
    };
  }, [diagram]);

  const chiefPoints = diagram.chiefRayPoints.map((point) => mapPoint(point.x, point.z, bounds, width, height));
  const focalPoints = diagram.focalRayPoints.map((point) => mapPoint(point.x, point.z, bounds, width, height));
  const targetPoint = mapPoint(diagram.targetPosition.x, diagram.targetPosition.z, bounds, width, height);
  const virtualTargetPoint = mapPoint(
    diagram.virtualTargetPoint.x,
    diagram.virtualTargetPoint.z,
    bounds,
    width,
    height
  );
  const mirrorCenter = mapPoint(diagram.mirrorPosition.x, diagram.mirrorPosition.z, bounds, width, height);
  const lensCenter = mapPoint(diagram.lensCenter.x, diagram.lensCenter.z, bounds, width, height);
  const sensorCenter = mapPoint(diagram.sensorCenter.x, diagram.sensorCenter.z, bounds, width, height);
  const actualSensorPoint = mapPoint(
    diagram.actualSensorPoint.x,
    diagram.actualSensorPoint.z,
    bounds,
    width,
    height
  );
  const measuredSensorPoint = mapPoint(
    diagram.measuredSensorPoint.x,
    diagram.measuredSensorPoint.z,
    bounds,
    width,
    height
  );
  const focalPoint = mapPoint(
    diagram.imageSideFocalPoint.x,
    diagram.imageSideFocalPoint.z,
    bounds,
    width,
    height
  );

  const mirrorHalfLength = 34;
  const mirrorDx = Math.cos(diagram.mirrorLineAngleRad) * mirrorHalfLength;
  const mirrorDy = -Math.sin(diagram.mirrorLineAngleRad) * mirrorHalfLength;

  return (
    <div className="aiming-sideview-shell">
      <svg viewBox={`0 0 ${width} ${height}`} className="aiming-sideview-svg" aria-label="Aiming side view">
        <rect x="0" y="0" width={width} height={height} fill="url(#aiming-bg)" />
        <defs>
          <linearGradient id="aiming-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#07110f" />
            <stop offset="100%" stopColor="#030807" />
          </linearGradient>
        </defs>

        <line x1="32" y1={height / 2} x2={width - 32} y2={height / 2} className="aiming-sideview-axis" />

        <line
          x1={sensorCenter.x}
          y1={48}
          x2={sensorCenter.x}
          y2={height - 48}
          className="aiming-sideview-sensor"
        />
        <line
          x1={lensCenter.x}
          y1={54}
          x2={lensCenter.x}
          y2={height - 54}
          className="aiming-sideview-lens"
        />
        <line
          x1={mirrorCenter.x - mirrorDx}
          y1={mirrorCenter.y - mirrorDy}
          x2={mirrorCenter.x + mirrorDx}
          y2={mirrorCenter.y + mirrorDy}
          className="aiming-sideview-mirror"
        />

        <polyline points={buildPolyline(chiefPoints)} className="aiming-sideview-chief" />
        <polyline points={buildPolyline(focalPoints)} className="aiming-sideview-focal" />
        <line
          x1={virtualTargetPoint.x}
          y1={virtualTargetPoint.y}
          x2={targetPoint.x}
          y2={targetPoint.y}
          className="aiming-sideview-fold"
        />

        <circle cx={targetPoint.x} cy={targetPoint.y} r="8" className="aiming-sideview-target" />
        <circle cx={virtualTargetPoint.x} cy={virtualTargetPoint.y} r="5" className="aiming-sideview-virtual-target" />
        <circle cx={actualSensorPoint.x} cy={actualSensorPoint.y} r="6" className="aiming-sideview-sensor-point" />
        {showMeasuredPoint ? (
          <circle
            cx={measuredSensorPoint.x}
            cy={measuredSensorPoint.y}
            r="5"
            className="aiming-sideview-measured-point"
          />
        ) : null}
        <circle cx={focalPoint.x} cy={focalPoint.y} r="4" className="aiming-sideview-focal-point" />

        <text x={targetPoint.x - 10} y={34} className="aiming-sideview-label" textAnchor="middle">
          target
        </text>
        <text x={mirrorCenter.x} y={34} className="aiming-sideview-label" textAnchor="middle">
          MEMS mirror
        </text>
        <text x={mirrorCenter.x} y={height - 24} className="aiming-sideview-subtle" textAnchor="middle">
          tilt {((diagram.mirrorVisualTiltRad * 180) / Math.PI).toFixed(1)} deg visual
        </text>
        <text x={lensCenter.x} y={34} className="aiming-sideview-label" textAnchor="middle">
          lens
        </text>
        <text x={sensorCenter.x} y={34} className="aiming-sideview-label" textAnchor="middle">
          sensor
        </text>
        <text x={focalPoint.x} y={height - 42} className="aiming-sideview-subtle" textAnchor="middle">
          image focal point
        </text>
        <text x={actualSensorPoint.x + 10} y={actualSensorPoint.y - 10} className="aiming-sideview-subtle">
          actual image point
        </text>
        {showMeasuredPoint ? (
          <text x={measuredSensorPoint.x + 10} y={measuredSensorPoint.y + 18} className="aiming-sideview-subtle">
            delayed measured point
          </text>
        ) : null}
        <text x={width - 28} y={height - 24} className="aiming-sideview-subtle" textAnchor="end">
          chief ray = yellow, focal ray = green
        </text>
      </svg>
    </div>
  );
}
