export type GuideCategory = "visualContext" | "marketBiology" | "events" | "safetyEditor";

export type GuideLineDefinitionId =
  | "intro-welcome"
  | "intro-field-context"
  | "intro-field-biology"
  | "intro-mission-mode"
  | "intro-visible-targets"
  | "intro-selected-target"
  | "intro-desktop"
  | "intro-farmers-setting"
  | "intro-next-target"
  | "intro-energy-budget"
  | "intro-setup"
  | "field-switch"
  | "first-neutralization"
  | "neutralization-reminder"
  | "charging-start"
  | "charging-complete"
  | "mission-complete"
  | "playback-reminder"
  | "field-modes-reminder"
  | "real-image-context"
  | "safety-hold"
  | "nsz-ring"
  | "nsz-edit"
  | "nsz-farmer-meaning"
  | "safety-editor-intro"
  | "safety-editor-focal-distance"
  | "safety-editor-aperture"
  | "safety-editor-target-energy"
  | "safety-editor-beam-diagram"
  | "beam-diagram-focus"
  | "beam-diagram-aperture"
  | "beam-diagram-overview";

export interface GuideLineDefinition {
  id: GuideLineDefinitionId;
  category: GuideCategory;
  title: string;
}

export const GUIDE_CATEGORY_LABELS: Record<GuideCategory, string> = {
  visualContext: "Visual context",
  marketBiology: "Market and biology",
  events: "Events",
  safetyEditor: "Safety editor"
};

export const GUIDE_LINE_DEFINITIONS: GuideLineDefinition[] = [
  { id: "intro-welcome", category: "marketBiology", title: "Insecticide-free world intro" },
  { id: "intro-field-context", category: "marketBiology", title: "Field-specific welcome" },
  { id: "intro-field-biology", category: "marketBiology", title: "Crop and pest biology context" },
  { id: "intro-mission-mode", category: "events", title: "Mission mode" },
  { id: "intro-visible-targets", category: "visualContext", title: "Visible target dots" },
  { id: "intro-selected-target", category: "visualContext", title: "Selected target marker" },
  { id: "intro-desktop", category: "visualContext", title: "Desktop preferred note" },
  { id: "intro-farmers-setting", category: "events", title: "Add farmers in Setup" },
  { id: "intro-next-target", category: "events", title: "Automatic next-target flow" },
  { id: "intro-energy-budget", category: "events", title: "Battery and recharge logic" },
  { id: "intro-setup", category: "events", title: "Setup and telemetry location" },
  { id: "field-switch", category: "marketBiology", title: "Field switch welcome" },
  { id: "first-neutralization", category: "events", title: "First target neutralized" },
  { id: "neutralization-reminder", category: "events", title: "Neutralization reminder" },
  { id: "charging-start", category: "events", title: "Return to charge" },
  { id: "charging-complete", category: "events", title: "Charge complete" },
  { id: "mission-complete", category: "events", title: "Mission complete" },
  { id: "playback-reminder", category: "events", title: "Playback speed reminder" },
  { id: "field-modes-reminder", category: "visualContext", title: "Field mode selector reminder" },
  { id: "real-image-context", category: "visualContext", title: "Real image context card" },
  { id: "safety-hold", category: "events", title: "Farmer safety hold" },
  { id: "nsz-ring", category: "visualContext", title: "NSZ ring meaning" },
  { id: "nsz-edit", category: "safetyEditor", title: "NSZ can be reconfigured" },
  { id: "nsz-farmer-meaning", category: "safetyEditor", title: "Why the drone pauses for a farmer" },
  { id: "safety-editor-intro", category: "safetyEditor", title: "Safety editor intro" },
  { id: "safety-editor-focal-distance", category: "safetyEditor", title: "Focal distance meaning" },
  { id: "safety-editor-aperture", category: "safetyEditor", title: "Starting aperture meaning" },
  { id: "safety-editor-target-energy", category: "safetyEditor", title: "Target energy presets" },
  { id: "safety-editor-beam-diagram", category: "safetyEditor", title: "Beam diagram availability" },
  { id: "beam-diagram-focus", category: "safetyEditor", title: "Beam diagram focus concept" },
  { id: "beam-diagram-aperture", category: "safetyEditor", title: "Beam diagram aperture concept" },
  { id: "beam-diagram-overview", category: "safetyEditor", title: "Beam diagram overview" }
];

export const GUIDE_LINE_DEFINITION_MAP = new Map(
  GUIDE_LINE_DEFINITIONS.map((definition) => [definition.id, definition] as const)
);
