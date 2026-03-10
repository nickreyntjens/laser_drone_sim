import { FieldType, SimulationParameters } from "./types";

export interface FieldProfile {
  label: string;
  cropLabel: string;
  targetLabelSingular: string;
  targetLabelPlural: string;
  pressureUnitLabel: string;
  randomizeActionLabel: string;
  introSettlingLabel: string;
  cropVisualStyle: "potato" | "rice" | "orchard" | "greenhouse";
  targetVisualStyle: "beetle" | "eggMass" | "stinkBug" | "caterpillar";
  denseKnownColor: string;
  denseSeededColor: string;
  targetAliveColor: string;
  targetSeededColor: string;
  targetNeutralizedColor: string;
  targetHaloColor: string;
  targetHeightBaseM: number;
  targetHeightJitterM: number;
  alongRowJitterM: number;
  canopyOffsetFactor: number;
  maturePlantHeightM: number;
  representativeLeafLengthM: number;
  representativePlantDensityPerM2: number;
  inRowPlantSpacingM: number;
  canopyRadiusM: number;
  trunkHeightM: number;
  defaultOverrides: Pick<
    SimulationParameters,
    | "rowSpacingM"
    | "laneSpacingM"
    | "searchAltitudeM"
    | "engageAltitudeM"
    | "detectionRadiusM"
    | "safetyFocalDistanceM"
  >;
}

export const FIELD_PROFILES: Record<FieldType, FieldProfile> = {
  potatoColoradoBeetle: {
    label: "Potato / Colorado beetle",
    cropLabel: "Potato",
    targetLabelSingular: "Colorado potato beetle",
    targetLabelPlural: "Colorado potato beetles",
    pressureUnitLabel: "beetles/ha",
    randomizeActionLabel: "Randomize beetles",
    introSettlingLabel: "Beetles settling onto the potato canopy",
    cropVisualStyle: "potato",
    targetVisualStyle: "beetle",
    denseKnownColor: "#ffd48d",
    denseSeededColor: "#e0ae66",
    targetAliveColor: "#ffd178",
    targetSeededColor: "#e0ae66",
    targetNeutralizedColor: "#666963",
    targetHaloColor: "#ffd48d",
    targetHeightBaseM: 0.18,
    targetHeightJitterM: 0.12,
    alongRowJitterM: 0.7,
    canopyOffsetFactor: 0.35,
    maturePlantHeightM: 0.55,
    representativeLeafLengthM: 0.22,
    representativePlantDensityPerM2: 4.5,
    inRowPlantSpacingM: 3.4,
    canopyRadiusM: 0.34,
    trunkHeightM: 0.18,
    defaultOverrides: {
      rowSpacingM: 0.9,
      laneSpacingM: 5.4,
      searchAltitudeM: 2.8,
      engageAltitudeM: 1.9,
      detectionRadiusM: 3.2,
      safetyFocalDistanceM: 0.5
    }
  },
  riceYellowStemBorerEgg: {
    label: "Rice / Yellow stem borer eggs",
    cropLabel: "Rice",
    targetLabelSingular: "yellow stem borer egg mass",
    targetLabelPlural: "yellow stem borer egg masses",
    pressureUnitLabel: "egg masses/ha",
    randomizeActionLabel: "Randomize egg masses",
    introSettlingLabel: "Egg masses settling onto rice leaf tips",
    cropVisualStyle: "rice",
    targetVisualStyle: "eggMass",
    denseKnownColor: "#f7f5ea",
    denseSeededColor: "#e6ead9",
    targetAliveColor: "#f6f5ef",
    targetSeededColor: "#e6ead9",
    targetNeutralizedColor: "#7d8078",
    targetHaloColor: "#fff4c4",
    targetHeightBaseM: 0.68,
    targetHeightJitterM: 0.14,
    alongRowJitterM: 0.35,
    canopyOffsetFactor: 0.18,
    maturePlantHeightM: 1,
    representativeLeafLengthM: 0.5,
    representativePlantDensityPerM2: 62.5,
    inRowPlantSpacingM: 0.2,
    canopyRadiusM: 0.08,
    trunkHeightM: 0.06,
    defaultOverrides: {
      rowSpacingM: 0.2,
      laneSpacingM: 3.2,
      searchAltitudeM: 2.4,
      engageAltitudeM: 1.55,
      detectionRadiusM: 2.4,
      safetyFocalDistanceM: 0.5
    }
  },
  orchardMarmoratedStinkBug: {
    label: "Orchard / Marmorated stink bug",
    cropLabel: "Orchard",
    targetLabelSingular: "brown marmorated stink bug",
    targetLabelPlural: "brown marmorated stink bugs",
    pressureUnitLabel: "stink bugs/ha",
    randomizeActionLabel: "Randomize stink bugs",
    introSettlingLabel: "Stink bugs settling onto orchard canopy edges",
    cropVisualStyle: "orchard",
    targetVisualStyle: "stinkBug",
    denseKnownColor: "#d6c39a",
    denseSeededColor: "#b5966e",
    targetAliveColor: "#d1b388",
    targetSeededColor: "#b5966e",
    targetNeutralizedColor: "#5c5b57",
    targetHaloColor: "#f1c88f",
    targetHeightBaseM: 2.1,
    targetHeightJitterM: 0.8,
    alongRowJitterM: 0.28,
    canopyOffsetFactor: 0.16,
    maturePlantHeightM: 3.2,
    representativeLeafLengthM: 0.18,
    representativePlantDensityPerM2: 0.27,
    inRowPlantSpacingM: 1.2,
    canopyRadiusM: 0.45,
    trunkHeightM: 0.7,
    defaultOverrides: {
      rowSpacingM: 3.5,
      laneSpacingM: 3.5,
      searchAltitudeM: 4.9,
      engageAltitudeM: 4.1,
      detectionRadiusM: 3.3,
      safetyFocalDistanceM: 0.9
    }
  },
  greenhouseTulipCaterpillar: {
    label: "Greenhouse / Tulip caterpillar",
    cropLabel: "Greenhouse tulips",
    targetLabelSingular: "tulip caterpillar",
    targetLabelPlural: "tulip caterpillars",
    pressureUnitLabel: "caterpillars/ha",
    randomizeActionLabel: "Randomize caterpillars",
    introSettlingLabel: "Caterpillars settling onto tulip leaves inside the greenhouse",
    cropVisualStyle: "greenhouse",
    targetVisualStyle: "caterpillar",
    denseKnownColor: "#f4d978",
    denseSeededColor: "#c8c05f",
    targetAliveColor: "#f1df86",
    targetSeededColor: "#c8c05f",
    targetNeutralizedColor: "#6d765f",
    targetHaloColor: "#ffde8a",
    targetHeightBaseM: 0.34,
    targetHeightJitterM: 0.16,
    alongRowJitterM: 0.18,
    canopyOffsetFactor: 0.18,
    maturePlantHeightM: 0.55,
    representativeLeafLengthM: 0.3,
    representativePlantDensityPerM2: 18,
    inRowPlantSpacingM: 0.3,
    canopyRadiusM: 0.09,
    trunkHeightM: 0.08,
    defaultOverrides: {
      rowSpacingM: 0.45,
      laneSpacingM: 2.25,
      searchAltitudeM: 2.15,
      engageAltitudeM: 1.3,
      detectionRadiusM: 1.9,
      safetyFocalDistanceM: 0.45
    }
  }
};

export function getFieldProfile(fieldType: FieldType): FieldProfile {
  return FIELD_PROFILES[fieldType];
}

export function applyFieldTypePreset(
  params: SimulationParameters,
  fieldType: FieldType
): SimulationParameters {
  const profile = getFieldProfile(fieldType);
  return {
    ...params,
    fieldType,
    ...profile.defaultOverrides
  };
}

export function formatPressureLabel(
  fieldType: FieldType,
  densityPerHectare: number
): string {
  return `${Math.round(densityPerHectare)} ${getFieldProfile(fieldType).pressureUnitLabel}`;
}
