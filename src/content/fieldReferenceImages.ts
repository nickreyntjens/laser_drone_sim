import { FieldType } from "../sim/types";

export interface FieldReferenceImage {
  fieldType: FieldType;
  title: string;
  caption: string;
  guideLine: string;
  imageUrl: string;
  sourceLabel: string;
}

const COMMONS_FILE_PATH = "https://commons.wikimedia.org/wiki/Special:FilePath/";

export const FIELD_REFERENCE_IMAGES: Record<FieldType, FieldReferenceImage> = {
  potatoColoradoBeetle: {
    fieldType: "potatoColoradoBeetle",
    title: "Real Colorado potato beetle",
    caption: "USDA-released image of an adult Colorado potato beetle.",
    guideLine:
      "These are real images for context. This one shows an actual Colorado potato beetle, the target in the potato field mode.",
    imageUrl: `${COMMONS_FILE_PATH}Colorado_potato_beetle_(cropped).jpg`,
    sourceLabel: "Wikimedia Commons / USDA ARS"
  },
  riceYellowStemBorerEgg: {
    fieldType: "riceYellowStemBorerEgg",
    title: "Real yellow stem borer",
    caption:
      "Real yellow stem borer image for context. The simulation targets the egg stage near rice leaf tips.",
    guideLine:
      "These are real images for context. This shows yellow stem borer, the pest behind the egg masses used in the rice field mode.",
    imageUrl: `${COMMONS_FILE_PATH}Rice_yellow_stem_borer.jpg`,
    sourceLabel: "Wikimedia Commons"
  },
  orchardMarmoratedStinkBug: {
    fieldType: "orchardMarmoratedStinkBug",
    title: "Real brown marmorated stink bug",
    caption: "USDA image of brown marmorated stink bug feeding on apple.",
    guideLine:
      "These are real images for context. This one shows a real brown marmorated stink bug, the orchard target in this mode.",
    imageUrl: `${COMMONS_FILE_PATH}Brown_marmorated_stink_bug_feeding_on_apple.jpg`,
    sourceLabel: "Wikimedia Commons / USDA ARS"
  },
  greenhouseTulipCaterpillar: {
    fieldType: "greenhouseTulipCaterpillar",
    title: "Real caterpillar reference",
    caption: "Real caterpillar image for biological context in greenhouse mode.",
    guideLine:
      "These are real images for context. This shows a real caterpillar, matching the pest concept used in the greenhouse mode.",
    imageUrl: `${COMMONS_FILE_PATH}Caterpillar_on_leaf-.jpg`,
    sourceLabel: "Wikimedia Commons"
  }
};

export function fieldReferenceImageFor(fieldType: FieldType): FieldReferenceImage {
  return FIELD_REFERENCE_IMAGES[fieldType];
}
