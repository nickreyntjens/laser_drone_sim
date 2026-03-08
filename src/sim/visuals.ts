import { TargetState } from "./types";

export function shouldRenderMarkerForTarget(
  target: Pick<TargetState, "alive" | "neutralizationPulse">,
  active: boolean,
  showOnlySelectedTargetMarkers: boolean
): boolean {
  if (!target.alive) {
    return target.neutralizationPulse > 0.05;
  }

  if (!showOnlySelectedTargetMarkers) {
    return true;
  }

  return active;
}
