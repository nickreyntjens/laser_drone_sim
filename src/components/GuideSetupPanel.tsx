import {
  GUIDE_CATEGORY_LABELS,
  GUIDE_LINE_DEFINITIONS,
  GuideCategory,
  GuideLineDefinitionId
} from "../content/guideCatalog";

interface GuideSetupPanelProps {
  disabledLineIds: GuideLineDefinitionId[];
  onToggleLine: (definitionId: GuideLineDefinitionId, enabled: boolean) => void;
}

export function GuideSetupPanel({
  disabledLineIds,
  onToggleLine
}: GuideSetupPanelProps): JSX.Element {
  const disabled = new Set(disabledLineIds);
  const categories: GuideCategory[] = ["visualContext", "marketBiology", "events", "safetyEditor"];

  return (
    <section className="overlay-panel">
      <div className="overlay-panel-header">
        <div>
          <span className="eyebrow">Guide setup</span>
          <h2>Choose which guide lines can be spoken</h2>
        </div>
      </div>
      <div className="guide-setup-grid">
        {categories.map((category) => (
          <section key={category} className="guide-setup-group">
            <h3>{GUIDE_CATEGORY_LABELS[category]}</h3>
            <div className="guide-setup-list">
              {GUIDE_LINE_DEFINITIONS.filter((definition) => definition.category === category).map(
                (definition) => {
                  const enabled = !disabled.has(definition.id);
                  return (
                    <label key={definition.id} className="guide-line-toggle">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(event) => onToggleLine(definition.id, event.target.checked)}
                      />
                      <span>{definition.title}</span>
                    </label>
                  );
                }
              )}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
