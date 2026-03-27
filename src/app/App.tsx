import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import type {
  CalculatorSettings,
  ComputationIssue,
  ExpressionResult,
  LinearSystemResult,
  MatrixData,
  MatrixOperationResult,
  NumericalDraft,
  NumericalRequest,
  NumericalResult,
  ResultEnvelope,
  SolverResult,
  WorkspaceState,
  WorkspaceToolId
} from "@core/contracts";
import { MatrixWorkbench } from "../features/matrix/MatrixWorkbench";
import { SolverWorkbench } from "../features/solver/SolverWorkbench";
import { summarizeSolver } from "../features/solver/model";
import { NumericalToolsWorkspace } from "../features/numerical-tools/NumericalToolsWorkspace";
import {
  HISTORY_SCHEMA_VERSION,
  MEMORY_SCHEMA_VERSION,
  SETTINGS_SCHEMA_VERSION,
  WORKSPACE_SCHEMA_VERSION
} from "@persistence/schema";
import { createCalculatorPersistence, getBrowserStorage } from "@persistence/store";
import { ResultPanel } from "../components/results/ResultPanel";
import { createDefaultMemoryRegisters, type MemoryRegister } from "../features/memory/model";
import {
  ANGLE_MODE_OPTIONS,
  BACKEND_OPTIONS,
  DISPLAY_MODE_OPTIONS,
  SETTINGS_LIMITS
} from "../features/settings/model";
import { createCalculationService } from "../services/calculate";
import { createNumericalToolsService } from "../services/numerical";
import {
  captureRegisterFromPresentation,
  createHistoryEntryFromPresentation,
  summarizeWorkspace,
  type WorkspacePresentation
} from "./workspacePreview";
import "../features/calculate/calculate.css";

const HISTORY_LIMIT = 24;
const calculationService = createCalculationService();
const numericalToolsService = createNumericalToolsService();

const toolTitles: Record<WorkspaceToolId, string> = {
  calculate: "Expression Engine",
  matrix: "Matrix Lab",
  solver: "Root Solver",
  numerical: "Numerical Tools"
};

type CalculationOutcome = ResultEnvelope<ExpressionResult> | null;
type MatrixOutcome = ResultEnvelope<MatrixOperationResult | LinearSystemResult> | null;
type SolverOutcome = ResultEnvelope<SolverResult> | null;
type NumericalOutcome = ResultEnvelope<NumericalResult> | null;

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

function formatApproximation(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return Number.isFinite(value) ? value.toPrecision(12) : String(value);
}

function formatElapsedMs(value: number | undefined): string {
  if (value === undefined) {
    return "n/a";
  }

  return `${value.toFixed(3)} ms`;
}

function buildCalculationPresentation(
  workspace: WorkspaceState,
  calculation: CalculationOutcome
): WorkspacePresentation {
  const expression = workspace.expressionInput.trim();

  if (!expression) {
    return summarizeWorkspace(workspace);
  }

  if (!calculation) {
    return {
      tool: "calculate",
      title: "Expression Runtime",
      detail: expression,
      value: "Calculating",
      issues: []
    };
  }

  if (!calculation.ok) {
    return {
      tool: "calculate",
      title: "Expression Diagnostic",
      detail: expression,
      value: "Error",
      issues: calculation.issues
    };
  }

  return {
    tool: "calculate",
    title: "Computed Result",
    detail: `${calculation.value.canonicalExpression} | Approximation ${formatApproximation(calculation.value.approximateValue)}`,
    value: calculation.value.formattedValue,
    issues: calculation.issues
  };
}

function buildSolverPresentation(
  workspace: WorkspaceState,
  result: SolverOutcome
): WorkspacePresentation {
  const summary = summarizeSolver(workspace.solver, result);

  return {
    tool: "solver",
    title: summary.title,
    detail: summary.detail,
    value: summary.value,
    issues: summary.issues
  };
}

function buildMatrixPresentation(
  settings: CalculatorSettings,
  workspace: WorkspaceState,
  result: MatrixOutcome
): WorkspacePresentation {
  if (!result) {
    return summarizeWorkspace(workspace);
  }

  const dimensions = `Left ${workspace.matrix.left.rows} x ${workspace.matrix.left.columns} / Right ${workspace.matrix.right?.rows ?? 2} x ${workspace.matrix.right?.columns ?? 2}`;

  if (!result.ok) {
    return {
      tool: "matrix",
      title: "Matrix Diagnostic",
      detail: dimensions,
      value: "Error",
      issues: result.issues
    };
  }

  if ("solution" in result.value) {
    return {
      tool: "matrix",
      title: "Linear System Solution",
      detail: [
        `${result.value.solution.length} unknowns`,
        `Residual ${formatOptionalCompact(result.value.residualNorm, settings.numeric.displayPrecision)}`,
        `Pivot ${result.value.diagnostics?.pivotStrategy ?? "n/a"}`
      ].join(" | "),
      value: formatVectorSummary(result.value.solution, settings.numeric.displayPrecision),
      issues: result.issues
    };
  }

  return {
    tool: "matrix",
    title: labelMatrixTitle(result.value.operation),
    detail: [
      result.value.matrix
        ? `${result.value.matrix.rows} x ${result.value.matrix.columns} matrix`
        : "Scalar output",
      result.value.diagnostics?.pivotStrategy ? `Pivot ${result.value.diagnostics.pivotStrategy}` : null,
      result.value.diagnostics?.conditionEstimate !== undefined
        ? `Cond ${formatCompactNumber(result.value.diagnostics.conditionEstimate, settings.numeric.displayPrecision)}`
        : null
    ]
      .filter((value): value is string => Boolean(value))
      .join(" | "),
    value:
      result.value.scalar ??
      formatMatrixSummary(result.value.matrix, settings.numeric.displayPrecision) ??
      "Computed",
    issues: result.issues
  };
}

function buildNumericalPresentation(
  workspace: WorkspaceState,
  result: NumericalOutcome
): WorkspacePresentation {
  const supportedTool = workspace.numerical.tool === "integrate" ? "integrate" : "differentiate";
  const expression = workspace.numerical.expression.trim();

  if (!expression) {
    return summarizeWorkspace(workspace);
  }

  if (!result) {
    return {
      tool: "numerical",
      title: "Numerical Analysis",
      detail: expression,
      value: "Calculating",
      issues: []
    };
  }

  if (!result.ok) {
    return {
      tool: "numerical",
      title: "Numerical Diagnostic",
      detail: expression,
      value: "Error",
      issues: result.issues
    };
  }

  return {
    tool: "numerical",
    title: supportedTool === "integrate" ? "Integral Estimate" : "Derivative Estimate",
    detail: `${result.value.canonicalExpression} | ${labelNumericalMethod(result.value.method)}`,
    value: result.value.formattedValue,
    issues: result.issues
  };
}

interface CalculateDraftProps {
  calculation: CalculationOutcome;
  workspace: WorkspaceState;
  onExpressionChange: (expression: string) => void;
}

function CalculateDraft({ calculation, workspace, onExpressionChange }: CalculateDraftProps) {
  const expressionInput = workspace.expressionInput;

  return (
    <section className="panel calculator-panel">
      <header className="panel-header">
        <h2>Expression Engine</h2>
        <span>live parser + runtime</span>
      </header>
      <div className="calculator-layout">
        <div className="stack">
          <label className="field-block">
            <span className="field-label">Expression</span>
            <textarea
              className="expression-input"
              rows={6}
              value={expressionInput}
              onChange={(event) => onExpressionChange(event.target.value)}
              placeholder="sin(pi / 3)^2 + cos(pi / 3)^2"
            />
          </label>
        </div>

        <div className="stack">
          <div className="result-card">
            <p className="result-label">Formatted result</p>
            <output className="result-value">
              {calculation?.ok ? calculation.value.formattedValue : expressionInput.trim() ? "Error" : "Ready"}
            </output>
            <p className="result-meta">
              {calculation?.ok
                ? `Approximation ${formatApproximation(calculation.value.approximateValue)}`
                : "Live diagnostics update as the expression changes."}
            </p>
          </div>

          <div className="result-grid">
            <div className="result-box">
              <span>Canonical</span>
              <strong>{calculation?.ok ? calculation.value.canonicalExpression : "n/a"}</strong>
            </div>
            <div className="result-box">
              <span>Elapsed</span>
              <strong>{formatElapsedMs(calculation?.metadata.elapsedMs)}</strong>
            </div>
            <div className="result-box">
              <span>Backend</span>
              <strong>{calculation?.metadata.backend ?? "n/a"}</strong>
            </div>
            <div className="result-box">
              <span>Status</span>
              <strong>{calculation?.ok ? "ok" : calculation ? "diagnostic" : "idle"}</strong>
            </div>
          </div>

          <div className="issue-list">
            {(calculation?.issues ?? []).length > 0 ? (
              (calculation?.issues ?? []).map((issue) => (
                <div
                  className={issue.severity === "error" ? "issue issue-error" : "issue"}
                  key={`${issue.code}-${issue.message}`}
                >
                  <strong>{issue.code}</strong>
                  <span>{issue.message}</span>
                </div>
              ))
            ) : (
              <div className="issue issue-neutral">
                <strong>Examples</strong>
                <span>Try `sin(pi/3)^2 + cos(pi/3)^2`, `sqrt(2)^2 - 2`, or `sin(90)` in degree mode.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function renderToolDraft(
  settings: CalculatorSettings,
  workspace: WorkspaceState,
  calculation: CalculationOutcome,
  matrix: MatrixOutcome,
  numerical: NumericalOutcome,
  updateWorkspace: (recipe: (current: WorkspaceState) => WorkspaceState) => void,
  updateMatrixCalculation: Dispatch<SetStateAction<MatrixOutcome>>,
  updateSolverCalculation: Dispatch<SetStateAction<SolverOutcome>>
) {
  switch (workspace.activeTool) {
    case "calculate":
      return (
        <CalculateDraft
          calculation={calculation}
          workspace={workspace}
          onExpressionChange={(expressionInput) =>
            updateWorkspace((current) => ({
              ...current,
              expressionInput
            }))
          }
        />
      );
    case "matrix":
      return (
        <MatrixWorkbench
          settings={settings}
          draft={workspace.matrix}
          result={matrix}
          onDraftChange={(recipe) =>
            updateWorkspace((current) => ({
              ...current,
              matrix: recipe(current.matrix)
            }))
          }
          onResultChange={updateMatrixCalculation}
        />
      );
    case "solver":
      return (
        <SolverWorkbench
          settings={settings}
          draft={workspace.solver}
          onDraftChange={(recipe) =>
            updateWorkspace((current) => ({
              ...current,
              solver: recipe(current.solver)
            }))
          }
          onResultChange={updateSolverCalculation}
        />
      );
    case "numerical":
      return (
        <NumericalToolsWorkspace
          draft={workspace.numerical}
          result={numerical}
          settings={settings}
          onDraftChange={(recipe) =>
            updateWorkspace((current) => ({
              ...current,
              numerical: recipe(current.numerical)
            }))
          }
        />
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
  const [calculation, setCalculation] = useState<CalculationOutcome>(null);
  const [matrixCalculation, setMatrixCalculation] = useState<MatrixOutcome>(null);
  const [solverCalculation, setSolverCalculation] = useState<SolverOutcome>(null);
  const [numerical, setNumerical] = useState<NumericalOutcome>(null);
  const deferredExpression = useDeferredValue(workspace.expressionInput);
  const deferredNumericalDraft = useDeferredValue(workspace.numerical);
  const deferredSettings = useDeferredValue(settings);

  const activeTool = workspace.activeTool;
  const presentation =
    activeTool === "calculate"
      ? buildCalculationPresentation(workspace, calculation)
      : activeTool === "matrix"
        ? buildMatrixPresentation(settings, workspace, matrixCalculation)
      : activeTool === "solver"
        ? buildSolverPresentation(workspace, solverCalculation)
      : activeTool === "numerical"
        ? buildNumericalPresentation(workspace, numerical)
        : summarizeWorkspace(workspace);
  const selectedRegister =
    memoryRegisters.find((register) => register.id === selectedRegisterId) ?? memoryRegisters[0] ?? null;

  useEffect(() => {
    let cancelled = false;

    if (activeTool !== "calculate") {
      return () => {
        cancelled = true;
      };
    }

    if (!deferredExpression.trim()) {
      startTransition(() => {
        setCalculation(null);
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.resolve(
      calculationService.calculate({
        expression: deferredExpression,
        settings: deferredSettings
      })
    ).then((result) => {
      if (cancelled) {
        return;
      }

      startTransition(() => {
        setCalculation(result);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeTool, deferredExpression, deferredSettings]);

  useEffect(() => {
    let cancelled = false;

    if (activeTool !== "numerical") {
      return () => {
        cancelled = true;
      };
    }

    if (!deferredNumericalDraft.expression.trim()) {
      startTransition(() => {
        setNumerical(null);
      });
      return () => {
        cancelled = true;
      };
    }

    const builtRequest = buildNumericalRequest(deferredNumericalDraft, deferredSettings);
    if (!builtRequest.ok) {
      startTransition(() => {
        setNumerical(failEnvelope(deferredSettings, builtRequest.issues));
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.resolve(numericalToolsService.run(builtRequest.value)).then((result) => {
      if (cancelled) {
        return;
      }

      startTransition(() => {
        setNumerical(result);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeTool, deferredNumericalDraft, deferredSettings]);

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
    replaceHistory([
      createHistoryEntryFromPresentation(presentation, settings, timestamp, `history-${timestamp}`),
      ...historyEntries
    ].slice(0, HISTORY_LIMIT));
  }

  function saveToSelectedRegister() {
    if (!selectedRegister) {
      return;
    }

    const timestamp = new Date().toISOString();
    replaceMemory(
      memoryRegisters.map((register) =>
        register.id === selectedRegister.id
          ? captureRegisterFromPresentation(register, presentation, settings, timestamp)
          : register
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
          Tabs, numerical settings, memory, and history now share a versioned workspace store while the
          expression engine runs live inside the calculate mode.
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
        <div className="workspace-main">
          {renderToolDraft(
            settings,
            workspace,
            calculation,
            matrixCalculation,
            numerical,
            updateWorkspace,
            setMatrixCalculation,
            setSolverCalculation
          )}
        </div>
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
            { label: "Precision", value: `${settings.numeric.displayPrecision} digits` },
            {
              label: "Elapsed",
              value:
                activeTool === "calculate"
                  ? formatElapsedMs(calculation?.metadata.elapsedMs)
                  : activeTool === "matrix"
                    ? formatElapsedMs(matrixCalculation?.metadata.elapsedMs)
                  : activeTool === "solver"
                    ? formatElapsedMs(solverCalculation?.metadata.elapsedMs)
                  : activeTool === "numerical"
                    ? formatElapsedMs(numerical?.metadata.elapsedMs)
                    : "n/a"
            }
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
                  <dd>
                    {selectedRegister.mode
                      ? `${selectedRegister.mode.angleMode} / ${selectedRegister.mode.displayMode}`
                      : "N/A"}
                  </dd>
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

function buildNumericalRequest(
  draft: NumericalDraft,
  settings: CalculatorSettings
): { ok: true; value: NumericalRequest } | { ok: false; issues: ComputationIssue[] } {
  const tool = draft.tool === "integrate" ? "integrate" : "differentiate";

  if (tool === "differentiate") {
    const point = Number(draft.point);
    if (!Number.isFinite(point)) {
      return {
        ok: false,
        issues: [
          {
            code: "numerical.invalid_point",
            message: "Enter a finite point for differentiation.",
            severity: "error",
            field: "point"
          }
        ]
      };
    }

    return {
      ok: true,
      value: {
        tool,
        expression: draft.expression,
        settings,
        point,
        differentiationMethod: draft.differentiationMethod
      }
    };
  }

  const start = Number(draft.intervalStart);
  const end = Number(draft.intervalEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return {
      ok: false,
      issues: [
        {
          code: "numerical.invalid_interval",
          message: "Enter finite interval bounds for integration.",
          severity: "error",
          field: "interval"
        }
      ]
    };
  }

  return {
    ok: true,
    value: {
      tool,
      expression: draft.expression,
      settings,
      interval: [start, end],
      integrationMethod: draft.integrationMethod
    }
  };
}

function failEnvelope<T>(
  settings: CalculatorSettings,
  issues: ComputationIssue[]
): ResultEnvelope<T> {
  return {
    ok: false,
    issues,
    metadata: {
      backend: settings.numeric.backend
    }
  };
}

function labelNumericalMethod(method: NumericalResult["method"]): string {
  switch (method) {
    case "central":
      return "Central difference";
    case "five-point":
      return "Five-point stencil";
    case "trapezoidal":
      return "Trapezoidal";
    case "simpson":
      return "Simpson";
  }
}

function labelMatrixTitle(operation: MatrixOperationResult["operation"]): string {
  switch (operation) {
    case "add":
      return "Matrix Addition";
    case "subtract":
      return "Matrix Subtraction";
    case "multiply":
      return "Matrix Product";
    case "transpose":
      return "Matrix Transpose";
    case "determinant":
      return "Matrix Determinant";
    case "inverse":
      return "Matrix Inverse";
  }
}

function formatMatrixSummary(matrix: MatrixData | undefined, precision: number): string | null {
  if (!matrix) {
    return null;
  }

  return matrix.values
    .map((row) => `[${row.map((value) => formatCompactNumber(value, precision)).join(", ")}]`)
    .join(" ");
}

function formatVectorSummary(values: number[], precision: number): string {
  return values.map((value, index) => `x${index + 1} = ${formatCompactNumber(value, precision)}`).join(", ");
}

function formatOptionalCompact(value: number | undefined, precision: number): string {
  return value === undefined ? "n/a" : formatCompactNumber(value, precision);
}

function formatCompactNumber(value: number, precision: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  const normalized = Object.is(value, -0) ? 0 : value;
  if (normalized === 0) {
    return "0";
  }

  return Number.parseFloat(normalized.toPrecision(Math.min(Math.max(precision, 2), 12))).toString();
}
