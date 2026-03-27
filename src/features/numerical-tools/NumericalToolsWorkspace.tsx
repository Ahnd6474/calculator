import type {
  CalculatorSettings,
  ComputationIssue,
  DifferentiationMethod,
  IntegrationMethod,
  NumericalDraft,
  NumericalResult,
  ResultEnvelope
} from "@core/contracts";
import "./numerical-tools.css";

interface NumericalToolsWorkspaceProps {
  settings: CalculatorSettings;
  draft: NumericalDraft;
  result: ResultEnvelope<NumericalResult> | null;
  onDraftChange(recipe: (current: NumericalDraft) => NumericalDraft): void;
}

export function NumericalToolsWorkspace({
  settings,
  draft,
  result,
  onDraftChange
}: NumericalToolsWorkspaceProps) {
  const activeTool = draft.tool === "integrate" ? "integrate" : "differentiate";
  const issues = result?.issues ?? fallbackIssues(activeTool);

  return (
    <section className="panel numerical-workspace">
      <header className="panel-header">
        <h2>Numerical Tools</h2>
        <span>live analysis</span>
      </header>

      <div className="numerical-layout">
        <div className="numerical-stack">
          <div className="numerical-meta-strip">
            <span>Backend: {settings.numeric.backend}</span>
            <span>Tolerance: {formatCompact(settings.numeric.solverTolerance)}</span>
            <span>Display: {settings.numeric.displayMode}</span>
            <span>Precision: {settings.numeric.displayPrecision} digits</span>
          </div>

          <div className="form-grid">
            <label className="field field-wide">
              <span>Expression in x</span>
              <textarea
                rows={5}
                value={draft.expression}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    expression: event.target.value
                  }))
                }
                placeholder="sin(x) * exp(-x)"
              />
            </label>

            <label className="field">
              <span>Tool</span>
              <select
                value={activeTool}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    tool: event.target.value === "integrate" ? "integrate" : "differentiate"
                  }))
                }
              >
                <option value="differentiate">Differentiate</option>
                <option value="integrate">Integrate</option>
              </select>
            </label>

            {activeTool === "differentiate" ? (
              <>
                <label className="field">
                  <span>Method</span>
                  <select
                    value={draft.differentiationMethod}
                    onChange={(event) =>
                      onDraftChange((current) => ({
                        ...current,
                        differentiationMethod:
                          event.target.value === "five-point" ? "five-point" : "central"
                      }))
                    }
                  >
                    <option value="central">Central difference</option>
                    <option value="five-point">Five-point stencil</option>
                  </select>
                </label>
                <label className="field">
                  <span>Point</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft.point}
                    onChange={(event) =>
                      onDraftChange((current) => ({
                        ...current,
                        point: event.target.value
                      }))
                    }
                  />
                </label>
              </>
            ) : (
              <>
                <label className="field">
                  <span>Method</span>
                  <select
                    value={draft.integrationMethod}
                    onChange={(event) =>
                      onDraftChange((current) => ({
                        ...current,
                        integrationMethod:
                          event.target.value === "trapezoidal" ? "trapezoidal" : "simpson"
                      }))
                    }
                  >
                    <option value="simpson">Simpson</option>
                    <option value="trapezoidal">Trapezoidal</option>
                  </select>
                </label>
                <label className="field">
                  <span>Interval Start</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft.intervalStart}
                    onChange={(event) =>
                      onDraftChange((current) => ({
                        ...current,
                        intervalStart: event.target.value
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Interval End</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft.intervalEnd}
                    onChange={(event) =>
                      onDraftChange((current) => ({
                        ...current,
                        intervalEnd: event.target.value
                      }))
                    }
                  />
                </label>
              </>
            )}
          </div>
        </div>

        <div className="numerical-stack">
          <div className="result-card">
            <p className="result-label">Formatted result</p>
            <output className="result-value">
              {result?.ok ? result.value.formattedValue : draft.expression.trim() ? "Error" : "Ready"}
            </output>
            <p className="result-meta">
              {result?.ok
                ? `Approximation ${formatApproximation(result.value.approximateValue)}`
                : "Results update when the draft, settings, and numerical method change."}
            </p>
          </div>

          <div className="numerical-detail-grid">
            <div className="result-box">
              <span>Method</span>
              <strong>{result?.ok ? labelMethod(result.value.method) : labelPendingMethod(activeTool, draft)}</strong>
            </div>
            <div className="result-box">
              <span>Status</span>
              <strong>{result?.ok ? "ok" : result ? "diagnostic" : "idle"}</strong>
            </div>
            <div className="result-box">
              <span>Error estimate</span>
              <strong>{result?.ok ? formatCompact(result.value.errorEstimate) : "n/a"}</strong>
            </div>
            <div className="result-box">
              <span>Samples</span>
              <strong>{result?.ok ? String(result.value.sampleCount ?? "n/a") : "n/a"}</strong>
            </div>
            <div className="result-box">
              <span>Step size</span>
              <strong>{result?.ok ? formatCompact(result.value.stepSize) : "n/a"}</strong>
            </div>
            <div className="result-box">
              <span>Canonical</span>
              <strong>{result?.ok ? result.value.canonicalExpression : "n/a"}</strong>
            </div>
          </div>

          <div className="issue-list">
            {issues.map((issue) => (
              <div
                className={issue.severity === "error" ? "issue issue-error" : "issue"}
                key={`${issue.code}-${issue.field ?? "general"}`}
              >
                <strong>{issue.code}</strong>
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function fallbackIssues(tool: "differentiate" | "integrate"): ComputationIssue[] {
  return [
    {
      code: "numerical.examples",
      message:
        tool === "differentiate"
          ? "Try `sin(x)` at `0`, `x^3 - 2*x` at `2`, or `abs(x)` at `0` to inspect reliability warnings."
          : "Try `x^2` on `[0, 1]`, `sin(x)` on `[0, pi]`, or tighten tolerance with trapezoidal mode to inspect warnings.",
      severity: "warning"
    }
  ];
}

function formatApproximation(value: number | undefined): string {
  if (value === undefined) {
    return "n/a";
  }

  return Number.isFinite(value) ? value.toPrecision(12) : String(value);
}

function formatCompact(value: number | undefined): string {
  if (value === undefined) {
    return "n/a";
  }

  if (!Number.isFinite(value)) {
    return String(value);
  }

  return Number.parseFloat(value.toPrecision(8)).toString();
}

function labelMethod(method: DifferentiationMethod | IntegrationMethod): string {
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

function labelPendingMethod(tool: "differentiate" | "integrate", draft: NumericalDraft): string {
  return labelMethod(tool === "integrate" ? draft.integrationMethod : draft.differentiationMethod);
}
