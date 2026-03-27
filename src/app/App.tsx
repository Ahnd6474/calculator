import { useMemo, useState } from "react";
import type { WorkspaceToolId } from "@core/contracts";
import {
  SETTINGS_SCHEMA_VERSION,
  WORKSPACE_SCHEMA_VERSION,
  createDefaultSettingsDocument,
  createDefaultWorkspaceDocument
} from "@persistence/schema";

const toolTitles: Record<WorkspaceToolId, string> = {
  calculate: "Expression Engine",
  matrix: "Matrix Lab",
  solver: "Root Solver",
  numerical: "Numerical Tools"
};

export function App() {
  const settingsDocument = useMemo(() => createDefaultSettingsDocument(), []);
  const workspaceDocument = useMemo(() => createDefaultWorkspaceDocument(), []);
  const [activeTool, setActiveTool] = useState<WorkspaceToolId>(workspaceDocument.payload.activeTool);

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Precision Scientific Calculator</p>
        <h1>Contract-first computation workspace</h1>
        <p className="lede">
          This shell freezes service boundaries before parser, matrix, solver, and numerical engines are
          implemented. The UI surface is intentionally thin and depends only on typed contracts.
        </p>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <header className="panel-header">
            <h2>Tool surfaces</h2>
            <span>stubbed</span>
          </header>
          <div className="tool-list">
            {(Object.keys(toolTitles) as WorkspaceToolId[]).map((toolId) => (
              <button
                key={toolId}
                className={toolId === activeTool ? "tool-chip tool-chip-active" : "tool-chip"}
                onClick={() => setActiveTool(toolId)}
                type="button"
              >
                <strong>{toolTitles[toolId]}</strong>
                <span>{toolId}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <header className="panel-header">
            <h2>Shared defaults</h2>
            <span>versioned</span>
          </header>
          <dl className="detail-grid">
            <div>
              <dt>Active tool</dt>
              <dd>{activeTool}</dd>
            </div>
            <div>
              <dt>Numeric backend</dt>
              <dd>{settingsDocument.payload.numeric.backend}</dd>
            </div>
            <div>
              <dt>Displayed precision</dt>
              <dd>{settingsDocument.payload.numeric.displayPrecision}</dd>
            </div>
            <div>
              <dt>Angle mode</dt>
              <dd>{settingsDocument.payload.numeric.angleMode}</dd>
            </div>
            <div>
              <dt>Settings schema</dt>
              <dd>v{SETTINGS_SCHEMA_VERSION}</dd>
            </div>
            <div>
              <dt>Workspace schema</dt>
              <dd>v{WORKSPACE_SCHEMA_VERSION}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>{toolTitles[activeTool]}</h2>
          <span>next nodes implement behavior</span>
        </header>
        <p className="lede">
          Contract stubs exist for calculate, matrix, solver, and numerical services. Persistence is routed
          through versioned schema documents, and engines remain isolated from React and Tauri concerns.
        </p>
      </section>
    </main>
  );
}
