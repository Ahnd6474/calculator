import { useMemo, useState } from "react";
import type { CalculatorSettings, MatrixData, WorkspaceState, WorkspaceToolId } from "@core/contracts";
import {
  HISTORY_SCHEMA_VERSION,
  MEMORY_SCHEMA_VERSION,
  SETTINGS_SCHEMA_VERSION,
  WORKSPACE_SCHEMA_VERSION
} from "@persistence/schema";
import { createCalculatorPersistence, getBrowserStorage } from "@persistence/store";
import { ResultPanel } from "../components/results/ResultPanel";
import { createHistoryEntry, captureRegister, summarizeWorkspace } from "./workspacePreview";
import { createDefaultMemoryRegisters, type MemoryRegister } from "../features/memory/model";
import {
  ANGLE_MODE_OPTIONS,
  BACKEND_OPTIONS,
  DISPLAY_MODE_OPTIONS,
  SETTINGS_LIMITS
} from "../features/settings/model";
import { createDefaultMatrixData, resizeMatrix, updateMatrixCell } from "./workspaceDrafts";

const HISTORY_LIMIT = 24;

const toolTitles: Record<WorkspaceToolId, string> = {
  calculate: "Expression Engine",
  matrix: "Matrix Lab",
  solver: "Root Solver",
  numerical: "Numerical Tools"
};

function formatTimestamp(value: string | null, locale: string): string {
  if (!value) {
    return "Not stored";
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(timestamp);
  } catch {
    return timestamp.toISOString();
  }
}

function clampNumberField(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

function buildMatrix(matrix?: MatrixData): MatrixData {
  return matrix ?? createDefaultMatrixData();
}

interface MatrixEditorProps {
  label: string;
  matrix: MatrixData;
  onResize: (rows: number, columns: number) => void;
  onCellChange: (rowIndex: number, columnIndex: number, value: number) => void;
}

function MatrixEditor({ label, matrix, onResize, onCellChange }: MatrixEditorProps) {
  return (
    <section className="matrix-card">
      <header className="subpanel-header">
        <h3>{label}</h3>
        <div className="compact-row">
          <label>
            Rows
            <select value={matrix.rows} onChange={(event) => onResize(Number(event.target.value), matrix.columns)}>
              {[2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Columns
            <select value={matrix.columns} onChange={(event) => onResize(matrix.rows, Number(event.target.value))}>
              {[2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <div className="matrix-grid" style={{ gridTemplateColumns: `repeat(${matrix.columns}, minmax(0, 1fr))` }}>
        {matrix.values.map((row, rowIndex) =>
          row.map((entry, columnIndex) => (
            <input
              key={`${label}-${rowIndex}-${columnIndex}`}
              type="number"
              step="any"
              value={entry}
              onChange={(event) => onCellChange(rowIndex, columnIndex, Number(event.target.value))}
            />
          ))
        )}
      </div>
    </section>
  );
}

function renderToolDraft(
  workspace: WorkspaceState,
  updateWorkspace: (recipe: (current: WorkspaceState) => WorkspaceState) => void
) {
  switch (workspace.activeTool) {
    case "calculate":
      return (
        <section className="panel draft-panel">
          <header className="panel-header">
            <h2>Expression Workspace</h2>
            <span>restored draft</span>
          </header>
          <label className="field">
            <span>Expression</span>
            <textarea
              rows={6}
              value={workspace.expressionInput}
              onChange={(event) =>
                updateWorkspace((current) => ({
                  ...current,
                  expressionInput: event.target.value
                }))
              }
              placeholder="sin(pi / 3)^2 + cos(pi / 3)^2"
            />
          </label>
        </section>
      );
    case "matrix":
      return (
        <section className="panel draft-panel">
          <header className="panel-header">
            <h2>Matrix Workspace</h2>
            <span>persistent draft grids</span>
          </header>
          <div className="matrix-layout">
            <MatrixEditor
              label="Left Matrix"
              matrix={workspace.matrix.left}
              onResize={(rows, columns) =>
                updateWorkspace((current) => ({
                  ...current,
                  matrix: {
                    ...current.matrix,
                    left: resizeMatrix(current.matrix.left, rows, columns)
                  }
                }))
              }
              onCellChange={(rowIndex, columnIndex, value) =>
                updateWorkspace((current) => ({
                  ...current,
                  matrix: {
                    ...current.matrix,
                    left: updateMatrixCell(current.matrix.left, rowIndex, columnIndex, value)
                  }
                }))
              }
            />
            <MatrixEditor
              label="Right Matrix"
              matrix={buildMatrix(workspace.matrix.right)}
              onResize={(rows, columns) =>
                updateWorkspace((current) => ({
                  ...current,
                  matrix: {
                    ...current.matrix,
                    right: resizeMatrix(buildMatrix(current.matrix.right), rows, columns)
                  }
                }))
              }
              onCellChange={(rowIndex, columnIndex, value) =>
                updateWorkspace((current) => ({
                  ...current,
                  matrix: {
                    ...current.matrix,
                    right: updateMatrixCell(buildMatrix(current.matrix.right), rowIndex, columnIndex, value)
                  }
                }))
              }
            />
          </div>
        </section>
      );
    case "solver":
      return (
        <section className="panel draft-panel">
          <header className="panel-header">
            <h2>Solver Workspace</h2>
            <span>method + guesses</span>
          </header>
          <div className="form-grid">
            <label className="field field-wide">
              <span>Expression</span>
              <textarea
                rows={4}
                value={workspace.solver.expression}
                onChange={(event) =>
                  updateWorkspace((current) => ({
                    ...current,
                    solver: {
                      ...current.solver,
                      expression: event.target.value
                    }
                  }))
                }
                placeholder="cos(x) - x"
              />
            </label>
            <label className="field">
              <span>Method</span>
              <select
                value={workspace.solver.method}
                onChange={(event) =>
                  updateWorkspace((current) => ({
                    ...current,
                    solver: {
                      ...current.solver,
                      method: event.target.value === "bisection" ? "bisection" : "newton"
                    }
                  }))
                }
              >
                <option value="newton">Newton-Raphson</option>
                <option value="bisection">Bisection</option>
              </select>
            </label>
            <label className="field">
              <span>Initial Guess</span>
              <input
                value={workspace.solver.initialGuess}
                onChange={(event) =>
                  updateWorkspace((current) => ({
                    ...current,
                    solver: {
                      ...current.solver,
                      initialGuess: event.target.value
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Bracket Lower</span>
              <input
                value={workspace.solver.bracketLower}
                onChange={(event) =>
                  updateWorkspace((current) => ({
                    ...current,
                    solver: {
                      ...current.solver,
                      bracketLower: event.target.value
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Bracket Upper</span>
              <input
                value={workspace.solver.bracketUpper}
                onChange={(event) =>
                  updateWorkspace((current) => ({
                    ...current,
                    solver: {
                      ...current.solver,
                      bracketUpper: event.target.value
                    }
                  }))
                }
              />
            </label>
          </div>
        </section>
      );
    case "numerical":
      return (
        <section className="panel draft-panel">
          <header className="panel-header">
            <h2>Numerical Workspace</h2>
            <span>tool + interval draft</span>
          </header>
          <div className="form-grid">
            <label className="field field-wide">
              <span>Expression</span>
              <textarea
                rows={4}
                value={workspace.numerical.expression}
                onChange={(event) =>
                  updateWorkspace((current) => ({
                    ...current,
                    numerical: {
                      ...current.numerical,
                      expression: event.target.value
                    }
                  }))
                }
                placeholder="exp(-x^2)"
              />
            </label>
            <label className="field">
              <span>Tool</span>
              <select
                value={workspace.numerical.tool}
                onChange={(event) =>
                  updateWorkspace((current) => ({
                    ...current,
                    numerical: {
                      ...current.numerical,
                      tool:
                        event.target.value === "integrate"
                          ? "integrate"
                          : event.target.value === "sample"
                            ? "sample"
                            : "differentiate"
                    }
                  }))
                }
              >
                <option value="differentiate">Differentiate</option>
                <option value="integrate">Integrate</option>
                <option value="sample">Sample</option>
              </select>
            </label>
            <label className="field">
              <span>Point</span>
              <input
                value={workspace.numerical.point}
                onChange={(event) =>
                  updateWorkspace((current) => ({
                    ...current,
                    numerical: {
                      ...current.numerical,
                      point: event.target.value
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Interval Start</span>
              <input
                value={workspace.numerical.intervalStart}
                onChange={(event) =>
                  updateWorkspace((current) => ({
                    ...current,
                    numerical: {
                      ...current.numerical,
                      intervalStart: event.target.value
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Interval End</span>
              <input
                value={workspace.numerical.intervalEnd}
                onChange={(event) =>
                  updateWorkspace((current) => ({
                    ...current,
                    numerical: {
                      ...current.numerical,
                      intervalEnd: event.target.value
                    }
                  }))
                }
              />
            </label>
          </div>
        </section>
      );
  }
}

export function App() {
  const persistence = useMemo(() => createCalculatorPersistence(getBrowserStorage()), []);
  const snapshot = useMemo(() => persistence.loadSnapshot(), [persistence]);
  const [settings, setSettingsState] = useState<CalculatorSettings>(() => snapshot.settings.payload);
  const [workspace, setWorkspaceState] = useState<WorkspaceState>(() => snapshot.workspace.payload);
  const [historyEntries, setHistoryEntries] = useState(() => snapshot.history.payload.entries);
  const [memoryRegisters, setMemoryRegisters] = useState<MemoryRegister[]>(
    () => snapshot.memory.payload.registers ?? createDefaultMemoryRegisters()
  );
  const [selectedRegisterId, setSelectedRegisterId] = useState(
    () => snapshot.memory.payload.registers[0]?.id ?? createDefaultMemoryRegisters()[0]!.id
  );

  const activeTool = workspace.activeTool;
  const presentation = summarizeWorkspace(workspace);
  const selectedRegister =
    memoryRegisters.find((register) => register.id === selectedRegisterId) ?? memoryRegisters[0] ?? null;

  function updateSettings(recipe: (current: CalculatorSettings) => CalculatorSettings) {
    setSettingsState((current) => {
      const next = recipe(current);
      return persistence.saveSettings(next).payload;
    });
  }

  function updateWorkspace(recipe: (current: WorkspaceState) => WorkspaceState) {
    setWorkspaceState((current) => {
      const next = recipe(current);
      return persistence.saveWorkspace(next).payload;
    });
  }

  function replaceHistory(entries: typeof historyEntries) {
    setHistoryEntries(persistence.saveHistory(entries).payload.entries);
  }

  function replaceMemory(registers: MemoryRegister[]) {
    const savedRegisters = persistence.saveMemory(registers).payload.registers;
    setMemoryRegisters(savedRegisters);
    if (!savedRegisters.some((register) => register.id === selectedRegisterId) && savedRegisters[0]) {
      setSelectedRegisterId(savedRegisters[0].id);
    }
  }

  function storeCurrentSnapshot() {
    const timestamp = new Date().toISOString();
    const entry = createHistoryEntry(workspace, settings, timestamp, `history-${timestamp}`);
    replaceHistory([entry, ...historyEntries].slice(0, HISTORY_LIMIT));
  }

  function saveToSelectedRegister() {
    if (!selectedRegister) {
      return;
    }

    const timestamp = new Date().toISOString();
    replaceMemory(
      memoryRegisters.map((register) =>
        register.id === selectedRegister.id ? captureRegister(register, workspace, settings, timestamp) : register
      )
    );
  }

  function clearSelectedRegister() {
    if (!selectedRegister) {
      return;
    }

    replaceMemory(
      memoryRegisters.map((register) =>
        register.id === selectedRegister.id
          ? {
              ...register,
              value: "",
              detail: "Empty register",
              sourceTool: null,
              updatedAt: null,
              mode: null
            }
          : register
      )
    );
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Precision Scientific Calculator</p>
        <h1>Persistent engineering workspace</h1>
        <p className="lede">
          Tabs, numerical settings, memory, and history now share a versioned workspace store so the product
          shell survives restarts before engine nodes land.
        </p>
      </section>

      <section className="panel tab-shell">
        <header className="panel-header">
          <h2>Workspace Modes</h2>
          <span>persistent navigation</span>
        </header>
        <div className="tab-list" role="tablist" aria-label="Calculator modes">
          {(Object.keys(toolTitles) as WorkspaceToolId[]).map((toolId) => (
            <button
              key={toolId}
              role="tab"
              aria-selected={toolId === activeTool}
              className={toolId === activeTool ? "tool-chip tool-chip-active" : "tool-chip"}
              onClick={() =>
                updateWorkspace((current) => ({
                  ...current,
                  activeTool: toolId
                }))
              }
              type="button"
            >
              <strong>{toolTitles[toolId]}</strong>
              <span>{toolId}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="workspace-grid">
        <div className="workspace-main">{renderToolDraft(workspace, updateWorkspace)}</div>
        <aside className="workspace-side">
          <section className="panel settings-panel">
            <header className="panel-header">
              <h2>Numerical Settings</h2>
              <span>saved immediately</span>
            </header>
            <div className="form-grid">
              <label className="field">
                <span>Backend</span>
                <select
                  value={settings.numeric.backend}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      numeric: {
                        ...current.numeric,
                        backend: BACKEND_OPTIONS.includes(event.target.value as (typeof BACKEND_OPTIONS)[number])
                          ? (event.target.value as (typeof BACKEND_OPTIONS)[number])
                          : "float64"
                      }
                    }))
                  }
                >
                  {BACKEND_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Display Precision</span>
                <input
                  type="number"
                  min={SETTINGS_LIMITS.displayPrecision.min}
                  max={SETTINGS_LIMITS.displayPrecision.max}
                  value={settings.numeric.displayPrecision}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      numeric: {
                        ...current.numeric,
                        displayPrecision: clampNumberField(
                          Number(event.target.value),
                          SETTINGS_LIMITS.displayPrecision.min,
                          SETTINGS_LIMITS.displayPrecision.max
                        )
                      }
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Internal Precision</span>
                <input
                  type="number"
                  min={SETTINGS_LIMITS.internalPrecision.min}
                  max={SETTINGS_LIMITS.internalPrecision.max}
                  value={settings.numeric.internalPrecision}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      numeric: {
                        ...current.numeric,
                        internalPrecision: clampNumberField(
                          Number(event.target.value),
                          SETTINGS_LIMITS.internalPrecision.min,
                          SETTINGS_LIMITS.internalPrecision.max
                        )
                      }
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Solver Tolerance</span>
                <input
                  type="number"
                  step="any"
                  min={SETTINGS_LIMITS.solverTolerance.min}
                  max={SETTINGS_LIMITS.solverTolerance.max}
                  value={settings.numeric.solverTolerance}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      numeric: {
                        ...current.numeric,
                        solverTolerance: clampNumberField(
                          Number(event.target.value),
                          SETTINGS_LIMITS.solverTolerance.min,
                          SETTINGS_LIMITS.solverTolerance.max
                        )
                      }
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Max Iterations</span>
                <input
                  type="number"
                  min={SETTINGS_LIMITS.maxIterations.min}
                  max={SETTINGS_LIMITS.maxIterations.max}
                  value={settings.numeric.maxIterations}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      numeric: {
                        ...current.numeric,
                        maxIterations: clampNumberField(
                          Number(event.target.value),
                          SETTINGS_LIMITS.maxIterations.min,
                          SETTINGS_LIMITS.maxIterations.max
                        )
                      }
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Angle Mode</span>
                <select
                  value={settings.numeric.angleMode}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      numeric: {
                        ...current.numeric,
                        angleMode: ANGLE_MODE_OPTIONS.includes(event.target.value as (typeof ANGLE_MODE_OPTIONS)[number])
                          ? (event.target.value as (typeof ANGLE_MODE_OPTIONS)[number])
                          : "radian"
                      }
                    }))
                  }
                >
                  {ANGLE_MODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Display Mode</span>
                <select
                  value={settings.numeric.displayMode}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      numeric: {
                        ...current.numeric,
                        displayMode: DISPLAY_MODE_OPTIONS.includes(
                          event.target.value as (typeof DISPLAY_MODE_OPTIONS)[number]
                        )
                          ? (event.target.value as (typeof DISPLAY_MODE_OPTIONS)[number])
                          : "normal"
                      }
                    }))
                  }
                >
                  {DISPLAY_MODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <dl className="detail-grid compact-detail-grid">
              <div>
                <dt>Settings Schema</dt>
                <dd>v{SETTINGS_SCHEMA_VERSION}</dd>
              </div>
              <div>
                <dt>Workspace Schema</dt>
                <dd>v{WORKSPACE_SCHEMA_VERSION}</dd>
              </div>
              <div>
                <dt>History Schema</dt>
                <dd>v{HISTORY_SCHEMA_VERSION}</dd>
              </div>
              <div>
                <dt>Memory Schema</dt>
                <dd>v{MEMORY_SCHEMA_VERSION}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </section>

      <section className="panel-grid dashboard-grid">
        <ResultPanel
          eyebrow={toolTitles[activeTool]}
          title={presentation.title}
          value={presentation.value}
          detail={presentation.detail}
          issues={presentation.issues}
          metadata={[
            { label: "Backend", value: settings.numeric.backend },
            { label: "Angle", value: settings.numeric.angleMode },
            { label: "Display", value: settings.numeric.displayMode },
            { label: "Precision", value: `${settings.numeric.displayPrecision} digits` }
          ]}
        >
          <button type="button" className="secondary-button" onClick={storeCurrentSnapshot}>
            Capture History Snapshot
          </button>
          <button type="button" className="secondary-button" onClick={saveToSelectedRegister}>
            Store in {selectedRegister?.label ?? "memory"}
          </button>
        </ResultPanel>

        <section className="panel memory-panel">
          <header className="panel-header">
            <h2>Memory Registers</h2>
            <span>survive restart</span>
          </header>
          <div className="memory-selector" role="tablist" aria-label="Memory registers">
            {memoryRegisters.map((register) => (
              <button
                key={register.id}
                type="button"
                className={register.id === selectedRegisterId ? "register-chip register-chip-active" : "register-chip"}
                onClick={() => setSelectedRegisterId(register.id)}
              >
                {register.label}
              </button>
            ))}
          </div>
          {selectedRegister ? (
            <article className="memory-detail">
              <p className="memory-value">{selectedRegister.value || "Empty register"}</p>
              <p className="memory-note">{selectedRegister.detail}</p>
              <dl className="meta-grid">
                <div>
                  <dt>Source</dt>
                  <dd>{selectedRegister.sourceTool ?? "None"}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatTimestamp(selectedRegister.updatedAt, settings.locale)}</dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>{selectedRegister.mode ? `${selectedRegister.mode.angleMode} / ${selectedRegister.mode.displayMode}` : "N/A"}</dd>
                </div>
                <div>
                  <dt>Backend</dt>
                  <dd>{selectedRegister.mode?.backend ?? "N/A"}</dd>
                </div>
              </dl>
              <div className="result-actions">
                <button type="button" className="secondary-button" onClick={saveToSelectedRegister}>
                  Update {selectedRegister.label}
                </button>
                <button type="button" className="secondary-button secondary-button-muted" onClick={clearSelectedRegister}>
                  Clear {selectedRegister.label}
                </button>
              </div>
            </article>
          ) : null}
        </section>
      </section>

      <section className="panel history-panel">
        <header className="panel-header">
          <h2>Recent History</h2>
          <div className="panel-actions">
            <span>{historyEntries.length} saved</span>
            <button type="button" className="secondary-button secondary-button-muted" onClick={() => replaceHistory([])}>
              Clear history
            </button>
          </div>
        </header>
        {historyEntries.length === 0 ? (
          <p className="empty-state">Capture snapshots from any tab to keep persistent timestamps and mode metadata.</p>
        ) : (
          <div className="history-list">
            {historyEntries.map((entry) => (
              <article key={entry.id} className="history-item">
                <div className="history-heading">
                  <strong>{entry.title}</strong>
                  <span>{formatTimestamp(entry.createdAt, settings.locale)}</span>
                </div>
                <p>{entry.value}</p>
                <p className="history-note">{entry.detail}</p>
                <div className="history-meta">
                  <span>{toolTitles[entry.tool]}</span>
                  <span>{entry.mode.backend}</span>
                  <span>{entry.mode.angleMode}</span>
                  <span>{entry.mode.displayMode}</span>
                  <span>{entry.mode.displayPrecision} digits</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
