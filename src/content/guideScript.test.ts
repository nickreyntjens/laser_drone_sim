import { describe, expect, it } from "vitest";
import {
  buildFarmerNszMeaningLine,
  buildFieldModesReminderLine,
  buildFieldSwitchLine,
  buildGuideIntroLines,
  buildNominalSafetyZoneEditLine,
  buildNominalSafetyZoneRingLine,
  buildPlaybackReminderLine,
  buildSafetyEditorIntroLines,
  buildSafetyHoldLine
} from "./guideScript";
import { applyFieldTypePreset } from "../sim/fieldProfiles";
import { defaultParameters } from "../sim/defaults";

describe("guideScript", () => {
  it("builds field-specific intro lines", () => {
    const potato = buildGuideIntroLines(defaultParameters);
    const orchard = buildGuideIntroLines(
      applyFieldTypePreset(defaultParameters, "orchardMarmoratedStinkBug")
    );
    const greenhouse = buildGuideIntroLines(
      applyFieldTypePreset(defaultParameters, "greenhouseTulipCaterpillar")
    );

    expect(potato[0]).toContain("insecticide-free world");
    expect(potato[1]).toContain("potato field");
    expect(potato.some((line) => line.includes("currently present Colorado potato beetles"))).toBe(true);
    expect(potato.some((line) => line.includes("next selected Colorado potato beetle"))).toBe(true);
    expect(orchard[1]).toContain("orchard");
    expect(greenhouse[1]).toContain("greenhouse");
  });

  it("explains the active mission mode", () => {
    const knownModeLines = buildGuideIntroLines(defaultParameters);
    const searchModeLines = buildGuideIntroLines({
      ...defaultParameters,
      targetingMode: "search"
    });

    expect(knownModeLines[3]).toContain("known target locations");
    expect(searchModeLines[3]).toContain("live detection");
    expect(knownModeLines.some((line) => line.includes("desktop version is preferred"))).toBe(true);
    expect(knownModeLines.some((line) => line.includes("menu, go to Setup"))).toBe(true);
    expect(knownModeLines.some((line) => line.includes("Setup section in the menu"))).toBe(true);
  });

  it("builds event lines for safety holds and field switches", () => {
    expect(buildSafetyHoldLine(3.2)).toContain("3.2 meter nominal safety zone");
    expect(buildFieldSwitchLine("riceYellowStemBorerEgg")).toContain("rice field");
  });

  it("includes reminder lines for playback, field modes, and nominal safety zone education", () => {
    expect(buildPlaybackReminderLine()).toContain("speed the simulation up");
    expect(buildFieldModesReminderLine()).toContain("Multiple field types");
    expect(buildNominalSafetyZoneRingLine()).toContain("nominal safety zone");
    expect(buildNominalSafetyZoneEditLine()).toContain("focal length");
    expect(buildFarmerNszMeaningLine()).toContain("eye damage");
    expect(buildSafetyEditorIntroLines()[0]).toContain("nominal safety zone editor");
    expect(buildSafetyEditorIntroLines().some((line) => line.includes("half a joule up to adult insects at five joules"))).toBe(true);
  });
});
