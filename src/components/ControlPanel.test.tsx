import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultParameters } from "../sim/defaults";
import { ControlPanel } from "./ControlPanel";

describe("ControlPanel", () => {
  it("exposes the requested dwell-time and recharge-time limits", () => {
    const markup = renderToStaticMarkup(
      <ControlPanel
        activeParams={defaultParameters}
        draftParams={defaultParameters}
        hasPendingChanges={false}
        isRunning={true}
        seed={17}
        onApply={vi.fn()}
        onEditSafetyZone={vi.fn()}
        onOpenScenarioManager={vi.fn()}
        onRandomize={vi.fn()}
        onRestart={vi.fn()}
        onToggleRun={vi.fn()}
        onParamChange={vi.fn()}
      />
    );

    expect(markup).toMatch(/aria-label="Laser dwell time"[^>]*max="1"/);
    expect(markup).toMatch(/aria-label="Recharge time"[^>]*max="120"/);
    expect(markup).toMatch(/aria-label="Farmers in field"[^>]*max="6"/);
  });

  it("adds explanatory tooltips for less obvious targeting choices", () => {
    const markup = renderToStaticMarkup(
      <ControlPanel
        activeParams={defaultParameters}
        draftParams={defaultParameters}
        hasPendingChanges={false}
        isRunning={true}
        seed={17}
        onApply={vi.fn()}
        onEditSafetyZone={vi.fn()}
        onOpenScenarioManager={vi.fn()}
        onRandomize={vi.fn()}
        onRestart={vi.fn()}
        onToggleRun={vi.fn()}
        onParamChange={vi.fn()}
      />
    );

    expect(markup).toContain("Known locations. The drone assumes target coordinates are already known from prior drone footage and routes directly to them.");
    expect(markup).toContain("Choose whether the drone searches for pests live or flies directly to target coordinates already identified in prior scouting imagery.");
  });

  it("includes a direct nominal safety zone editor action in setup", () => {
    const markup = renderToStaticMarkup(
      <ControlPanel
        activeParams={defaultParameters}
        draftParams={defaultParameters}
        hasPendingChanges={false}
        isRunning={true}
        seed={17}
        onApply={vi.fn()}
        onEditSafetyZone={vi.fn()}
        onOpenScenarioManager={vi.fn()}
        onRandomize={vi.fn()}
        onRestart={vi.fn()}
        onToggleRun={vi.fn()}
        onParamChange={vi.fn()}
      />
    );

    expect(markup).toContain("Edit nominal safety zone");
  });

  it("exposes potato, rice, orchard, and greenhouse field type modes", () => {
    const markup = renderToStaticMarkup(
      <ControlPanel
        activeParams={defaultParameters}
        draftParams={defaultParameters}
        hasPendingChanges={false}
        isRunning={true}
        seed={17}
        onApply={vi.fn()}
        onEditSafetyZone={vi.fn()}
        onOpenScenarioManager={vi.fn()}
        onRandomize={vi.fn()}
        onRestart={vi.fn()}
        onToggleRun={vi.fn()}
        onParamChange={vi.fn()}
      />
    );

    expect(markup).toContain("Potato / beetle");
    expect(markup).toContain("Rice / egg mass");
    expect(markup).toContain("Orchard / stink bug");
    expect(markup).toContain("Greenhouse / caterpillar");
  });

  it("includes a scenario manager entry in setup", () => {
    const markup = renderToStaticMarkup(
      <ControlPanel
        activeParams={defaultParameters}
        draftParams={defaultParameters}
        hasPendingChanges={false}
        isRunning={true}
        seed={17}
        onApply={vi.fn()}
        onEditSafetyZone={vi.fn()}
        onOpenScenarioManager={vi.fn()}
        onRandomize={vi.fn()}
        onRestart={vi.fn()}
        onToggleRun={vi.fn()}
        onParamChange={vi.fn()}
      />
    );

    expect(markup).toContain("Scenario manager");
  });
});
