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
        onRandomize={vi.fn()}
        onRestart={vi.fn()}
        onToggleRun={vi.fn()}
        onParamChange={vi.fn()}
      />
    );

    expect(markup).toMatch(/aria-label="Laser dwell time"[^>]*max="1"/);
    expect(markup).toMatch(/aria-label="Recharge time"[^>]*max="120"/);
  });
});
