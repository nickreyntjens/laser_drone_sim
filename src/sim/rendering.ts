export const NOMINAL_TARGET_MARKER_HEIGHT_M = 0.3;
export const DJI_MINI_REFERENCE_MASS_KG = 0.25;
export const DJI_MINI_REFERENCE_LENGTH_M = 0.25;
export const NOMINAL_FARMER_HEIGHT_M = 1.78;
export const NOMINAL_UTILITY_VEHICLE_LENGTH_M = 4.6;

// DroneActor is modeled in scene units first, then scaled into metric context.
export const DRONE_MODEL_SPAN_SCENE_UNITS = 1.26;

export function metersToSceneUnits(meters: number, renderScaleMPerUnit: number): number {
  return meters / renderScaleMPerUnit;
}

export function estimatedDroneLengthM(droneMassKg: number): number {
  return DJI_MINI_REFERENCE_LENGTH_M * (droneMassKg / DJI_MINI_REFERENCE_MASS_KG);
}

export function nominalDroneModelScale(
  droneMassKg: number,
  renderScaleMPerUnit: number
): number {
  return (
    metersToSceneUnits(estimatedDroneLengthM(droneMassKg), renderScaleMPerUnit) /
    DRONE_MODEL_SPAN_SCENE_UNITS
  );
}
