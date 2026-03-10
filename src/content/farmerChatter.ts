import { FieldType } from "../sim/types";

const SHARED_CHATTER_LINES = [
  "What would Thrump do?",
  "If I want to live on Mars, how do I get there?",
  "Are birds government spy machines?",
  "Can you fry a Mars bar?",
  "I wish I had nicer shoes.",
  "I sow, so I am.",
  "I hate it when people don't finish their",
  "If I pick my nose in the field, will people notice?",
  "Darn, I have to poop.",
  "I may not be smart, but thank God I'm not pretty.",
  "The square root of 5 is a number.",
  "How much will shoes cost on Mars? And will they be shiny?",
  "Can you plow with a Porsche?",
  "I'm funny."
] as const;

const FIELD_CHATTER_LINES: Record<FieldType, readonly string[]> = {
  potatoColoradoBeetle: [
    "Potatoes are yummy!",
    "One potato a day keeps the apple away.",
    "Potato planting is what I'll do.",
    "Good God! Look at the size of that tuber!",
    ...SHARED_CHATTER_LINES
  ],
  riceYellowStemBorerEgg: [
    "Rice is life.",
    "Those white egg masses creep me out.",
    "This paddy better pay off.",
    "Wet boots again. Great.",
    ...SHARED_CHATTER_LINES
  ],
  orchardMarmoratedStinkBug: [
    "These orchard rows never end.",
    "Stink bugs again. Perfect.",
    "Apples I get. Stink bugs I do not.",
    "Tree pruning was easier than this.",
    ...SHARED_CHATTER_LINES
  ],
  greenhouseTulipCaterpillar: [
    "These tulips look expensive.",
    "I can smell the greenhouse heat already.",
    "Caterpillars on tulips feels personal.",
    "Support beams everywhere.",
    ...SHARED_CHATTER_LINES
  ]
};

export function chatterLinesForField(fieldType: FieldType): readonly string[] {
  return FIELD_CHATTER_LINES[fieldType];
}
