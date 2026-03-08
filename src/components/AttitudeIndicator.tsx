import { DroneTelemetry } from "../sim/types";

const PITCH_PIXELS_PER_RAD = 64;
const MAX_PITCH_OFFSET_PX = 34;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeHeadingDeg(headingRad: number): number {
  const wrapped = ((headingRad * 180) / Math.PI + 360) % 360;
  return wrapped;
}

function formatSignedDegrees(value: number): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded} deg`;
}

export function AttitudeIndicator({ drone }: { drone: DroneTelemetry }): JSX.Element {
  const headingDeg = normalizeHeadingDeg(drone.headingRad);
  const bankDeg = (drone.rollRad * 180) / Math.PI;
  const pitchDeg = (drone.pitchRad * 180) / Math.PI;
  const yawRateDegS = (drone.yawRateRadS * 180) / Math.PI;
  const pitchOffsetPx = clamp(drone.pitchRad * PITCH_PIXELS_PER_RAD, -MAX_PITCH_OFFSET_PX, MAX_PITCH_OFFSET_PX);
  const horizonTransform = `translateY(${pitchOffsetPx}px) rotate(${bankDeg.toFixed(2)}deg)`;
  const pitchMarks = [-20, -10, 10, 20];

  return (
    <div className="attitude-card">
      <div className="attitude-header">
        <span>Attitude / horizon</span>
        <strong>{headingDeg.toFixed(0)} deg hdg</strong>
      </div>

      <div className="attitude-gauge">
        <div className="attitude-mask">
          <div className="attitude-horizon" style={{ transform: horizonTransform }}>
            <div className="attitude-sky" />
            <div className="attitude-ground" />
            <div className="attitude-horizon-line" />
            {pitchMarks.map((pitchMark) => (
              <div
                key={pitchMark}
                className="attitude-pitch-mark"
                style={{ top: `calc(50% + ${(-pitchMark / 10) * 16}px)` }}
              >
                <span>{Math.abs(pitchMark)}</span>
                <div />
                <span>{Math.abs(pitchMark)}</span>
              </div>
            ))}
          </div>

          <div className="attitude-bank-scale" />
          <div className="attitude-fixed-reticle">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>

      <div className="attitude-footer">
        <span>Pitch {formatSignedDegrees(pitchDeg)}</span>
        <span>Bank {formatSignedDegrees(bankDeg)}</span>
        <span>Yaw {formatSignedDegrees(yawRateDegS)}/s</span>
      </div>
    </div>
  );
}
