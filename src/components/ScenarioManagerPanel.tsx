import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  SavedScenario,
  SCENARIO_SECTIONS,
  ScenarioSectionId
} from "../lib/scenarios";

interface ScenarioManagerPanelProps {
  scenarios: SavedScenario[];
  onSaveScenario: (name: string, sections: ScenarioSectionId[]) => void;
  onLoadScenario: (scenarioId: string) => void;
  onDeleteScenario: (scenarioId: string) => void;
  onExportScenario: (scenarioId: string) => void;
  onExportCurrent: (name: string, sections: ScenarioSectionId[]) => void;
  onImportScenario: (raw: string) => { ok: boolean; message: string };
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function ScenarioManagerPanel({
  scenarios,
  onSaveScenario,
  onLoadScenario,
  onDeleteScenario,
  onExportScenario,
  onExportCurrent,
  onImportScenario
}: ScenarioManagerPanelProps): JSX.Element {
  const [scenarioName, setScenarioName] = useState("My scenario");
  const [selectedSections, setSelectedSections] = useState<ScenarioSectionId[]>(
    SCENARIO_SECTIONS.map((section) => section.id)
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedSummary = useMemo(
    () =>
      SCENARIO_SECTIONS.filter((section) => selectedSections.includes(section.id))
        .map((section) => section.label)
        .join(", "),
    [selectedSections]
  );

  const toggleSection = (sectionId: ScenarioSectionId): void => {
    setSelectedSections((current) =>
      current.includes(sectionId)
        ? current.filter((value) => value !== sectionId)
        : [...current, sectionId]
    );
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const raw = await file.text();
    const result = onImportScenario(raw);
    setStatusMessage(result.message);
    event.target.value = "";
  };

  return (
    <section className="panel overlay-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Persistent Parameters</span>
          <h2>Scenario manager</h2>
        </div>
        <span className="small-pill">{scenarios.length} saved</span>
      </div>

      <p className="panel-note">
        Current mission parameters and aiming settings are persisted automatically in browser storage.
        Scenarios let you store named subsets, reload them later, or export them to JSON.
      </p>

      <div className="control-grid">
        <div className="control-group">
          <div className="control-title-row">
            <h3>Save current state</h3>
            <span>{selectedSections.length} sections selected</span>
          </div>
          <label className="slider-field">
            <span className="slider-header">
              <span>Scenario name</span>
            </span>
            <input
              className="scenario-name-input"
              type="text"
              value={scenarioName}
              onChange={(event) => setScenarioName(event.target.value)}
            />
          </label>

          <div className="scenario-section-grid">
            {SCENARIO_SECTIONS.map((section) => (
              <label key={section.id} className="scenario-section-toggle">
                <input
                  type="checkbox"
                  checked={selectedSections.includes(section.id)}
                  onChange={() => toggleSection(section.id)}
                />
                <span>
                  <strong>{section.label}</strong>
                  <small>{section.description}</small>
                </span>
              </label>
            ))}
          </div>

          <p className="panel-note">Selected: {selectedSummary || "Nothing selected"}</p>

          <div className="button-row">
            <button
              className="primary-button"
              onClick={() => {
                onSaveScenario(scenarioName, selectedSections);
                setStatusMessage(`Saved "${scenarioName}".`);
              }}
              disabled={selectedSections.length === 0 || scenarioName.trim().length === 0}
            >
              Save scenario
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                onExportCurrent(scenarioName, selectedSections);
                setStatusMessage(`Exported "${scenarioName}" as JSON.`);
              }}
              disabled={selectedSections.length === 0 || scenarioName.trim().length === 0}
            >
              Export current selection
            </button>
            <button
              className="secondary-button"
              onClick={() => fileInputRef.current?.click()}
            >
              Import scenario
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="scenario-hidden-input"
            onChange={handleImportFile}
          />
          {statusMessage ? <p className="panel-note">{statusMessage}</p> : null}
        </div>

        <div className="control-group">
          <div className="control-title-row">
            <h3>Saved scenarios</h3>
            <span>Load, export, or delete</span>
          </div>
          {scenarios.length === 0 ? (
            <p className="panel-note">No scenarios saved locally yet.</p>
          ) : (
            <div className="scenario-list">
              {scenarios.map((scenario) => (
                <article key={scenario.id} className="scenario-card">
                  <div className="scenario-card-header">
                    <div>
                      <strong>{scenario.name}</strong>
                      <small>
                        Updated {formatTimestamp(scenario.updatedAt)}
                      </small>
                    </div>
                    <span className="small-pill">{scenario.sections.length} sections</span>
                  </div>
                  <p className="panel-note">
                    {scenario.sections
                      .map(
                        (sectionId) =>
                          SCENARIO_SECTIONS.find((section) => section.id === sectionId)?.label ?? sectionId
                      )
                      .join(", ")}
                  </p>
                  <div className="button-row">
                    <button className="primary-button" onClick={() => onLoadScenario(scenario.id)}>
                      Load
                    </button>
                    <button className="secondary-button" onClick={() => onExportScenario(scenario.id)}>
                      Export
                    </button>
                    <button className="secondary-button" onClick={() => onDeleteScenario(scenario.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
