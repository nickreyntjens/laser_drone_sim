import { getFieldProfile } from "../sim/fieldProfiles";
import { FieldType, SimulationParameters } from "../sim/types";

function fieldContextLine(fieldType: FieldType): string {
  const profile = getFieldProfile(fieldType);
  if (profile.cropVisualStyle === "rice") {
    return "Welcome to the rice field. This run shows a laser drone targeting yellow stem borer egg masses near the leaf tips.";
  }
  if (profile.cropVisualStyle === "orchard") {
    return "Welcome to the orchard. Here the drone works around tree canopies to target brown marmorated stink bugs on the sides and upper crown.";
  }
  if (profile.cropVisualStyle === "greenhouse") {
    return "Welcome inside the tulip greenhouse. The drone flies under a covered structure and avoids support beams while targeting caterpillars on tulip leaves.";
  }
  return "Welcome to the potato field. This run shows a laser-equipped drone targeting Colorado potato beetles across the crop rows.";
}

function missionModeLine(params: Pick<SimulationParameters, "fieldType" | "targetingMode">): string {
  const profile = getFieldProfile(params.fieldType);
  if (params.targetingMode === "preSurveyed") {
    return `This mission uses known target locations, so the drone routes directly to mapped ${profile.targetLabelPlural} instead of searching first.`;
  }
  return `This mission uses live detection, so the drone first sweeps the field and only engages ${profile.targetLabelPlural} after spotting them.`;
}

function fieldBiologyLine(fieldType: FieldType): string {
  if (fieldType === "potatoColoradoBeetle") {
    return "In this model, the potato canopy is not assumed to ignite from these short laser shots. Potato plants can tolerate modest defoliation, and Colorado potato beetle was chosen because it is notorious for pesticide resistance.";
  }
  if (fieldType === "riceYellowStemBorerEgg") {
    return "Yellow stem borer is a major rice pest in Asia. It lays white egg masses on the upper part of rice leaves, which is why this field mode places bright egg deposits near the leaf tips.";
  }
  if (fieldType === "orchardMarmoratedStinkBug") {
    return "Brown marmorated stink bug pressure often concentrates around orchard canopies and edges, which is why this mode puts targets on the upper and side canopy faces.";
  }
  return "Inside the greenhouse, the drone has to work under a covered structure and around support beams while targeting caterpillars on tulip leaves.";
}

function visibleTargetsLine(fieldType: FieldType): string {
  const profile = getFieldProfile(fieldType);
  return `All visible dots represent currently present ${profile.targetLabelPlural}.`;
}

function selectedTargetLine(fieldType: FieldType): string {
  const profile = getFieldProfile(fieldType);
  return `The highlighted marker indicates the next selected ${profile.targetLabelSingular}.`;
}

export function buildGuideIntroLines(
  params: Pick<
    SimulationParameters,
    "fieldType" | "targetingMode" | "reserveBatteryPct" | "batteryCapacityWh"
  >
): string[] {
  return [
    "Welcome to a simulation of an insecticide-free world. In this application we simulate how a drone with a laser can replace certain insecticides.",
    fieldContextLine(params.fieldType),
    fieldBiologyLine(params.fieldType),
    missionModeLine(params),
    visibleTargetsLine(params.fieldType),
    selectedTargetLine(params.fieldType),
    "The desktop version is preferred because the simulation is dense. The mobile version is available, but it necessarily shows less at once.",
    "If you want to remove the farmers from the scene, open the menu, go to Setup, and set farmers per hectare to zero.",
    "After each successful shot, the next target is selected automatically and the route continues without manual input.",
    `Watch the energy budget. When the battery approaches the return requirement plus the ${params.reserveBatteryPct}% reserve, the drone goes back to dock, recharges, and then resumes the remaining mission.`,
    "Use the Setup section in the menu to change pest pressure, field dimensions, optics, battery size, and flight limits. The telemetry and report panels show whether the mission still closes realistically."
  ];
}

export function buildFieldSwitchLine(fieldType: FieldType): string {
  return fieldContextLine(fieldType);
}

export function buildSafetyHoldLine(nominalSafetyZoneRadiusM: number | null): string {
  if (nominalSafetyZoneRadiusM !== null) {
    return `A farmer entered the ${nominalSafetyZoneRadiusM.toFixed(1)} meter nominal safety zone. The shot is deferred and this target will be revisited later.`;
  }
  return "A farmer entered the nominal safety zone. The shot is deferred and the drone will revisit the target when the area is clear.";
}

export function buildChargingStartLine(): string {
  return "The reserve threshold has been reached, so the drone is returning to dock before continuing the mission.";
}

export function buildChargingCompleteLine(): string {
  return "Recharge complete. The drone can now resume the remaining target list.";
}

export function buildMissionCompleteLine(totalTargets: number): string {
  return `Mission complete. ${totalTargets} targets were neutralized and the final energy ledger is ready in the mission report.`;
}

export function buildNeutralizationReminderLine(): string {
  return "A target has been neutralized. The controller immediately acquires the next target and continues the route without manual intervention.";
}

export function buildPlaybackReminderLine(): string {
  return "You can speed the simulation up from the playback control. That is useful when you want to estimate how many targets fit in one battery cycle and how that affects cost per hectare.";
}

export function buildFieldModesReminderLine(): string {
  return "Multiple field types are available from the field mode selector in the top-left corner, including potato, rice, orchard, and greenhouse scenarios.";
}

export function buildNominalSafetyZoneRingLine(): string {
  return "The ring that appears during firing is the nominal safety zone. It marks the area where reflected light could still be hazardous to a human eye.";
}

export function buildNominalSafetyZoneEditLine(): string {
  return "The nominal safety zone can be reconfigured. Open the safety editor to change focal length, starting aperture, laser power, and related optics parameters.";
}

export function buildFarmerNszMeaningLine(): string {
  return "When a farmer is inside the nominal safety zone, that is the circle where reflected light could still cause eye damage, so the drone does not fire.";
}

export function buildSafetyEditorIntroLines(): string[] {
  return [
    "You are now in the nominal safety zone editor. The mission is paused while you inspect the optics.",
    "Focal distance is how far from the drone the beam reaches its tightest point, so that is where the target should ideally sit.",
    "Starting aperture is how wide the beam is as it leaves the optics. In this nominal model, a larger aperture shortens the safety zone, but it also implies larger and slower steering optics.",
    "Different target types need different shot energy. In this editor the presets range from eggs at half a joule up to adult insects at five joules, and that required energy drives the dwell time.",
    "The beam diagram can explain more about this. Open it to see the beam narrow to focus and then expand again."
  ];
}

export function buildBeamDiagramIntroLines(): string[] {
  return [
    "This beam diagram shows the beam leaving the optics at the starting aperture, narrowing to the focal point, and then expanding again after focus.",
    "Focal distance sets where the beam is tightest. Starting aperture sets how wide it begins and influences how the beam spreads after focus."
  ];
}
