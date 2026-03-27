import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import type {
  AngleMode,
  CalculatorSettings,
  DisplayMode,
  NumericBackend,
  NumericSettings,
  ResultEnvelope,
  WorkspaceToolId,
  ExpressionResult
} from "@core/contracts";
import {
  createDefaultSettingsDocument,
  createDefaultWorkspaceDocument,
  parsePersistedSettings,
  parsePersistedWorkspace,
  type PersistedSettingsDocument,
  type PersistedWorkspaceDocument
} from "@persistence/schema";
import { clampDisplayPrecision, clampInternalPrecision } from "@core/precision";
import { createCalculationService } from "../../services/calculate";
import "./calculate.css";

const SETTINGS_STORAGE_KEY = "precision-calculator.settings.v1";
const WORKSPACE_STORAGE_KEY = "precision-calculator.workspace.v1";
const calculationService = createCalculationService();

const toolTitles: Record<WorkspaceToolId, string> = {
  calculate: "Expression Engine",
  matrix: "Matrix Lab",
  solver: "Root Solver",
  numerical: "Numerical Tools"
};

type CalculationOutcome = ResultEnvelope<ExpressionResult> | null;

export function CalculateWorkspace() {
  const [settingsDocument, setSettingsDocument] = useState<PersistedSettingsDocument>(loadSettingsDocument);
  const [workspaceDocument, setWorkspaceDocument] = useState<PersistedWorkspaceDocument>(loadWorkspaceDocument);
  const deferredExpression = useDeferredValue(workspaceDocument.payload.expressionInput);
  const deferredSettings = useDeferredValue(settingsDocument.payload);
  const [calculation, setCalculation] = useState<CalculationOutcome>(null);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsDocument));
  }, [settingsDocument]);

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspaceDocument));
  }, [workspaceDocument]);

  useEffect(() => {
    let cancelled = false;

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
  }, [deferredExpression, deferredSettings]);

  const activeTool = workspaceDocument.payload.activeTool;
  const numericSettings = settingsDocument.payload.numeric;
  const summary = useMemo(
    () =>
      [
        { label: "Backend", value: numericSettings.backend },
        { label: "Display digits", value: String(numericSettings.displayPrecision) },
        { label: "Internal digits", value: String(numericSettings.internalPrecision) },
        { label: "Angle mode", value: numericSettings.angleMode }
      ],
    [numericSettings]
  );

  const updateNumericSettings = <TKey extends keyof NumericSettings>(
    key: TKey,
    value: NumericSettings[TKey]
  ) => {
    setSettingsDocument((current) =>
      stampDocument({
        ...current,
        payload: {
          ...current.payload,
          numeric: {
            ...current.payload.numeric,
            [key]: value
          }
        }
      })
    );
  };

  const updateExpressionInput = (expressionInput: string) => {
    setWorkspaceDocument((current) =>
      stampDocument({
        ...current,
        payload: {
          ...current.payload,
          expressionInput
        }
      })
    );
  };

  const updateActiveTool = (activeToolId: WorkspaceToolId) => {
    setWorkspaceDocument((current) =>
      stampDocument({
        ...current,
        payload: {
          ...current.payload,
          activeTool: activeToolId
        }
      })
    );
  };

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Precision Scientific Calculator</p>
        <h1>Calculation mode with parser, diagnostics, and selectable numeric backends</h1>
        <p className="lede">
          Expression evaluation stays inside a pure tokenizer, parser, compiler, and backend runtime. The
          UI persists numeric settings and workspace input locally so calculation preferences survive restarts.
        </p>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <header className="panel-header">
            <h2>Tool surfaces</h2>
            <span>calculation live</span>
          </header>
          <div className="tool-list">
            {(Object.keys(toolTitles) as WorkspaceToolId[]).map((toolId) => (
              <button
                key={toolId}
                className={toolId === activeTool ? "tool-chip tool-chip-active" : "tool-chip"}
                onClick={() => updateActiveTool(toolId)}
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
            <h2>Runtime defaults</h2>
            <span>persisted</span>
          </header>
          <dl className="detail-grid">
            {summary.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>

      {activeTool === "calculate" ? (
        <CalculatePanel
          calculation={calculation}
          expressionInput={workspaceDocument.payload.expressionInput}
          settings={settingsDocument.payload}
          onExpressionInputChange={updateExpressionInput}
          onNumericSettingsChange={updateNumericSettings}
        />
      ) : (
        <section className="panel">
          <header className="panel-header">
            <h2>{toolTitles[activeTool]}</h2>
            <span>reserved for sibling nodes</span>
          </header>
          <p className="lede">
            This execution node only lands calculation mode. Matrix, solver, and numerical tools keep their
            shell placeholders so later nodes can attach behavior without cross-node refactors.
          </p>
        </section>
      )}
    </main>
  );
}

interface CalculatePanelProps {
  calculation: CalculationOutcome;
  expressionInput: string;
  settings: CalculatorSettings;
  onExpressionInputChange(expression: string): void;
  onNumericSettingsChange<TKey extends keyof NumericSettings>(
    key: TKey,
    value: NumericSettings[TKey]
  ): void;
}

function CalculatePanel(props: CalculatePanelProps) {
  const { calculation, expressionInput, settings, onExpressionInputChange, onNumericSettingsChange } = props;
  const numeric = settings.numeric;

  return (
    <section className="panel calculator-panel">
      <header className="panel-header">
        <h2>Expression Engine</h2>
        <span>{numeric.backend}</span>
      </header>

      <div className="calculator-layout">
        <div className="stack">
          <label className="field-block">
            <span className="field-label">Expression</span>
            <textarea
              className="expression-input"
              onChange={(event) => onExpressionInputChange(event.target.value)}
              placeholder="sin(pi/3)^2 + cos(pi/3)^2"
              rows={5}
              value={expressionInput}
            />
          </label>

          <div className="settings-grid">
            <SelectField
              label="Backend"
              onChange={(value) => onNumericSettingsChange("backend", value as NumericBackend)}
              options={[
                { label: "Float64", value: "float64" },
                { label: "Decimal", value: "decimal" }
              ]}
              value={numeric.backend}
            />
            <SelectField
              label="Angle mode"
              onChange={(value) => onNumericSettingsChange("angleMode", value as AngleMode)}
              options={[
                { label: "Radian", value: "radian" },
                { label: "Degree", value: "degree" }
              ]}
              value={numeric.angleMode}
            />
            <SelectField
              label="Display mode"
              onChange={(value) => onNumericSettingsChange("displayMode", value as DisplayMode)}
              options={[
                { label: "Normal", value: "normal" },
                { label: "Scientific", value: "scientific" },
                { label: "Engineering", value: "engineering" }
              ]}
              value={numeric.displayMode}
            />
            <NumberField
              label="Display digits"
              max={32}
              min={1}
              onChange={(value) =>
                onNumericSettingsChange("displayPrecision", clampDisplayPrecision(value))
              }
              step={1}
              value={numeric.displayPrecision}
            />
            <NumberField
              label="Internal digits"
              max={128}
              min={8}
              onChange={(value) =>
                onNumericSettingsChange("internalPrecision", clampInternalPrecision(value))
              }
              step={1}
              value={numeric.internalPrecision}
            />
            <NumberField
              label="Solver tolerance"
              max={1}
              min={1e-16}
              onChange={(value) => onNumericSettingsChange("solverTolerance", sanitizePositive(value, 1e-10))}
              step={1e-10}
              value={numeric.solverTolerance}
            />
            <NumberField
              label="Max iterations"
              max={100000}
              min={1}
              onChange={(value) => onNumericSettingsChange("maxIterations", sanitizeInteger(value, 100))}
              step={1}
              value={numeric.maxIterations}
            />
          </div>
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
              <strong>{calculation?.metadata.backend ?? numeric.backend}</strong>
            </div>
            <div className="result-box">
              <span>Status</span>
              <strong>{calculation?.ok ? "ok" : calculation ? "diagnostic" : "idle"}</strong>
            </div>
          </div>

          <div className="issue-list">
            {(calculation?.issues ?? []).length > 0 ? (
              (calculation?.issues ?? []).map((issue) => (
                <div className={issue.severity === "error" ? "issue issue-error" : "issue"} key={`${issue.code}-${issue.message}`}>
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

interface SelectFieldProps {
  label: string;
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange(value: string): void;
}

function SelectField(props: SelectFieldProps) {
  return (
    <label className="field-block">
      <span className="field-label">{props.label}</span>
      <select className="field-control" onChange={(event) => props.onChange(event.target.value)} value={props.value}>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface NumberFieldProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange(value: number): void;
}

function NumberField(props: NumberFieldProps) {
  return (
    <label className="field-block">
      <span className="field-label">{props.label}</span>
      <input
        className="field-control"
        max={props.max}
        min={props.min}
        onChange={(event) => props.onChange(Number(event.target.value))}
        step={props.step}
        type="number"
        value={props.value}
      />
    </label>
  );
}

function loadSettingsDocument(): PersistedSettingsDocument {
  const fallback = createDefaultSettingsDocument();

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    return parsePersistedSettings(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

function loadWorkspaceDocument(): PersistedWorkspaceDocument {
  const fallback = createDefaultWorkspaceDocument();

  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    return parsePersistedWorkspace(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

function stampDocument<TDocument extends { updatedAt: string }>(document: TDocument): TDocument {
  return {
    ...document,
    updatedAt: new Date().toISOString()
  };
}

function sanitizePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sanitizeInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
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
