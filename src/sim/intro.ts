import { clamp } from "./defaults";
import { TargetState } from "./types";

export interface BeetleIntroVisualState {
  settleProgress: number;
  spawnLiftSceneUnits: number;
  opacityFactor: number;
  scaleFactor: number;
  landingSquash: number;
}

function sceneNoise(a: number, b: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function easeOutCubic(value: number): number {
  const t = clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

export function getBeetleIntroVisualState(
  target: Pick<TargetState, "id" | "position">,
  introProgress: number
): BeetleIntroVisualState {
  // Every beetle is visible from the very first frame. The variation only affects
  // drop height and settling rate, not whether the beetle exists yet.
  const duration = 0.52 + sceneNoise(target.position.x * 0.03, target.id * 0.29) * 0.18;
  const progress = clamp(introProgress / duration, 0, 1);
  const easedProgress = easeOutCubic(progress);
  const spawnLiftSceneUnits =
    (0.82 + sceneNoise(target.id * 0.41, target.position.z * 0.21) * 0.52) *
    (1 - easedProgress);

  return {
    settleProgress: easedProgress,
    spawnLiftSceneUnits,
    opacityFactor: 0.62 + easedProgress * 0.38,
    scaleFactor: 0.82 + easedProgress * 0.18,
    landingSquash: 0.82 + easedProgress * 0.18
  };
}
