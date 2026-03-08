import { useState } from "react";
import { BUILD_PROMPT } from "../content/buildPrompt";

export function BuildPromptPanel(): JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(BUILD_PROMPT);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Build Prompt</span>
          <h2>Rebuild this simulation</h2>
        </div>
        <span className="small-pill">{copied ? "Copied" : "Codex 5.4"}</span>
      </div>

      <p className="panel-note">
        Copy this prompt into a fresh Codex session if you want to rebuild the app from scratch.
      </p>

      <div className="button-row">
        <button className="primary-button" onClick={() => void handleCopy()}>
          Copy prompt
        </button>
      </div>

      <textarea className="prompt-textarea" readOnly value={BUILD_PROMPT} spellCheck={false} />
    </section>
  );
}
