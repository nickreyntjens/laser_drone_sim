import { FieldType } from "../sim/types";

const SHOWN_JOKES_STORAGE_KEY = "photonic-laser-drone-sim.shownFarmerJokes";
const sessionShownJokes: Record<FieldType, string[]> = {
  potatoColoradoBeetle: [],
  riceYellowStemBorerEgg: [],
  orchardMarmoratedStinkBug: [],
  greenhouseTulipCaterpillar: []
};
const assignedJokesByCycle = new Map<string, string>();

function hash(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
}

const SHARED_CHATTER_LINES = [
  "Biology jokes rarely get reactions.",
  "Photons always travel light.",
  "Binary farmers come in 10 kinds.",
  "My code grows field bugs.",
  "Crop-rotated code still grows bugs.",
  "What would Thrump do?",
  "If I want to live on Mars, how do I get there?",
  "Birds Are Not Real",
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

function readShownJokes(): Record<FieldType, string[]> {
  if (typeof window === "undefined") {
    return sessionShownJokes;
  }

  try {
    const raw = window.localStorage.getItem(SHOWN_JOKES_STORAGE_KEY);
    if (!raw) {
      return sessionShownJokes;
    }
    const parsed = JSON.parse(raw) as Partial<Record<FieldType, string[]>>;
    return {
      potatoColoradoBeetle: parsed.potatoColoradoBeetle ?? [],
      riceYellowStemBorerEgg: parsed.riceYellowStemBorerEgg ?? [],
      orchardMarmoratedStinkBug: parsed.orchardMarmoratedStinkBug ?? [],
      greenhouseTulipCaterpillar: parsed.greenhouseTulipCaterpillar ?? []
    };
  } catch {
    return sessionShownJokes;
  }
}

function writeShownJokes(next: Record<FieldType, string[]>): void {
  sessionShownJokes.potatoColoradoBeetle = [...next.potatoColoradoBeetle];
  sessionShownJokes.riceYellowStemBorerEgg = [...next.riceYellowStemBorerEgg];
  sessionShownJokes.orchardMarmoratedStinkBug = [...next.orchardMarmoratedStinkBug];
  sessionShownJokes.greenhouseTulipCaterpillar = [...next.greenhouseTulipCaterpillar];

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SHOWN_JOKES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore localStorage write failures; session memory still works.
  }
}

export function nextFarmerChatterLine(fieldType: FieldType, cycleIndex: number): string {
  const cycleKey = `${fieldType}:${cycleIndex}`;
  const assigned = assignedJokesByCycle.get(cycleKey);
  if (assigned) {
    return assigned;
  }

  const pool = [...FIELD_CHATTER_LINES[fieldType]];
  const shown = readShownJokes();
  let seenForField = shown[fieldType];
  let unseen = pool.filter((line) => !seenForField.includes(line));

  if (unseen.length === 0) {
    seenForField = [];
    unseen = pool;
  }

  const selectedIndex = Math.floor(hash(cycleIndex + fieldType.length * 0.37) * unseen.length);
  const selected = unseen[selectedIndex];
  const nextShown = {
    ...shown,
    [fieldType]: [...seenForField, selected]
  };
  writeShownJokes(nextShown);
  assignedJokesByCycle.set(cycleKey, selected);
  return selected;
}
